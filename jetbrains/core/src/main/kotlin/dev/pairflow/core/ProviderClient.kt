package dev.pairflow.core

import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.add
import kotlinx.serialization.json.addJsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject
import java.net.URI
import java.net.URLEncoder
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration
import java.util.concurrent.CompletableFuture
import java.util.concurrent.CompletionException
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ExecutionException
import java.util.concurrent.TimeUnit
import java.util.concurrent.TimeoutException
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

enum class Provider(val id: String, val label: String, val defaultBaseUrl: String, val defaultModel: String) {
    OPENAI("openai", "OpenAI", "https://api.openai.com/v1", "gpt-5-mini"),
    ANTHROPIC("anthropic", "Anthropic", "https://api.anthropic.com/v1", "claude-sonnet-4-5"),
    GEMINI("gemini", "Gemini", "https://generativelanguage.googleapis.com/v1beta", "gemini-3.8-flash"),
    OPENROUTER("openrouter", "OpenRouter", "https://openrouter.ai/api/v1", "openai/gpt-5-mini"),
    OLLAMA("ollama", "Ollama", "http://localhost:11434", "qwen3-coder");

    val needsApiKey: Boolean get() = this != OLLAMA

    companion object {
        fun fromId(id: String?): Provider = entries.firstOrNull { it.id == id } ?: OPENAI
    }
}

data class ProviderOptions(
    val provider: Provider,
    val apiKey: String,
    val model: String? = null,
    val baseUrl: String? = null,
    val timeoutMs: Long = 120_000,
    val transport: HttpTransport = JdkHttpTransport(),
)

data class HttpResult(val status: Int, val body: String)

/** Seam for tests; the default uses java.net.http so the plugin needs no extra HTTP library. */
fun interface HttpTransport {
    fun post(url: String, headers: Map<String, String>, body: String, timeoutMs: Long): CompletableFuture<HttpResult>
}

class JdkHttpTransport(private val client: HttpClient = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(20)).build()) : HttpTransport {
    override fun post(url: String, headers: Map<String, String>, body: String, timeoutMs: Long): CompletableFuture<HttpResult> {
        val builder = HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofMillis(timeoutMs)).POST(HttpRequest.BodyPublishers.ofString(body))
        headers.forEach { (name, value) -> builder.header(name, value) }
        return client.sendAsync(builder.build(), HttpResponse.BodyHandlers.ofString()).thenApply { HttpResult(it.statusCode(), it.body()) }
    }
}

/** Port of src/model/providerClients.ts. Prompts and request shapes must stay identical. */
class ProviderClient(private val options: ProviderOptions) : ModelClient {
    private val baseUrl = (options.baseUrl?.trim()?.takeIf { it.isNotEmpty() } ?: options.provider.defaultBaseUrl).trimEnd('/')
    private val model = options.model?.trim()?.takeIf { it.isNotEmpty() } ?: options.provider.defaultModel
    private val active = ConcurrentHashMap.newKeySet<ActiveRequest>()

    private class ActiveRequest(val future: CompletableFuture<HttpResult>) { @Volatile var stopped = false }

    override suspend fun requestPlan(goal: String, context: String): Plan =
        Protocol.parsePlanResponse(complete(PLAN_PROMPT, "Goal:\n$goal\n\nWorkspace:\n$context"))

    override suspend fun requestChunk(goal: String, plan: Plan, stepIndex: Int, context: String, feedback: String?): Chunk {
        val payload = buildJsonObject {
            put("goal", goal)
            put("plan", PairFlowJson.encodeToJsonElement(Plan.serializer(), plan))
            put("stepIndex", stepIndex)
            put("context", context)
            if (feedback != null) put("feedback", feedback)
        }
        return Protocol.parseChunkResponse(complete(CHUNK_PROMPT, payload.toString()))
    }

    override fun cancel() {
        for (request in active) { request.stopped = true; request.future.cancel(true) }
        active.clear()
    }

    private suspend fun complete(system: String, user: String): String {
        if (options.provider.needsApiKey && options.apiKey.isBlank()) throw IllegalStateException("Set your ${options.provider.id} API key first")
        return when (options.provider) {
            Provider.ANTHROPIC -> anthropic(system, user)
            Provider.GEMINI -> gemini(system, user)
            Provider.OLLAMA -> ollama(system, user)
            Provider.OPENAI, Provider.OPENROUTER -> openAI(system, user)
        }
    }

    private suspend fun openAI(system: String, user: String): String {
        val headers = mutableMapOf("content-type" to "application/json", "authorization" to "Bearer ${options.apiKey}")
        if (options.provider == Provider.OPENROUTER) {
            headers["HTTP-Referer"] = "https://github.com/roee030/pair-programming-with-ai"
            headers["X-Title"] = "Pair Flow"
        }
        val body = buildJsonObject {
            put("model", model)
            putJsonArray("messages") {
                addJsonObject { put("role", "system"); put("content", system) }
                addJsonObject { put("role", "user"); put("content", user) }
            }
            putJsonObject("response_format") { put("type", "json_object") }
        }
        val data = post("$baseUrl/chat/completions", headers, body)
        return required(data.path("choices", 0, "message", "content").asString())
    }

    private suspend fun anthropic(system: String, user: String): String {
        val headers = mapOf("content-type" to "application/json", "x-api-key" to options.apiKey, "anthropic-version" to "2023-06-01")
        val body = buildJsonObject {
            put("model", model)
            put("max_tokens", 8192)
            put("system", system)
            putJsonArray("messages") { addJsonObject { put("role", "user"); put("content", user) } }
        }
        val data = post("$baseUrl/messages", headers, body)
        val text = (data.path("content") as? JsonArray)?.firstOrNull { it.path("type").asString() == "text" }?.path("text").asString()
        return required(text)
    }

    private suspend fun gemini(system: String, user: String): String {
        val headers = mapOf("content-type" to "application/json", "x-goog-api-key" to options.apiKey)
        val body = buildJsonObject {
            putJsonObject("systemInstruction") { putJsonArray("parts") { addJsonObject { put("text", system) } } }
            putJsonArray("contents") { addJsonObject { put("role", "user"); putJsonArray("parts") { addJsonObject { put("text", user) } } } }
            putJsonObject("generationConfig") { put("responseMimeType", "application/json") }
        }
        val encodedModel = URLEncoder.encode(model, Charsets.UTF_8).replace("+", "%20")
        val data = post("$baseUrl/models/$encodedModel:generateContent", headers, body)
        val parts = data.path("candidates", 0, "content", "parts") as? JsonArray
        return required(parts?.joinToString("") { it.path("text").asString() ?: "" })
    }

    private suspend fun ollama(system: String, user: String): String {
        val body = buildJsonObject {
            put("model", model)
            put("stream", false)
            put("format", "json")
            putJsonArray("messages") {
                addJsonObject { put("role", "system"); put("content", system) }
                addJsonObject { put("role", "user"); put("content", user) }
            }
        }
        val data = post("$baseUrl/api/chat", mapOf("content-type" to "application/json"), body)
        return required(data.path("message", "content").asString())
    }

    private suspend fun post(url: String, headers: Map<String, String>, body: JsonObject): JsonElement {
        val future = options.transport.post(url, headers, body.toString(), options.timeoutMs).orTimeout(options.timeoutMs, TimeUnit.MILLISECONDS)
        val request = ActiveRequest(future)
        active.add(request)
        val result = try {
            future.awaitResult()
        } catch (error: Throwable) {
            val cause = unwrap(error)
            if (request.stopped) throw IllegalStateException("Task stopped")
            if (cause is TimeoutException || cause is java.net.http.HttpTimeoutException) throw IllegalStateException("${options.provider.id} request timed out")
            throw cause
        } finally {
            active.remove(request)
        }
        if (result.status !in 200..299) {
            val detail = result.body.take(240)
            throw IllegalStateException("${options.provider.id} request failed (${result.status})${if (detail.isNotEmpty()) ": $detail" else ""}")
        }
        return try { PairFlowJson.parseToJsonElement(result.body) } catch (_: Exception) { throw IllegalStateException("${options.provider.id} returned a non-JSON response") }
    }

    companion object {
        const val PLAN_PROMPT = "You are a careful pair programmer. Return JSON only: {\"summary\":\"what we will do\",\"steps\":[\"small step\"]}. Return 3-6 concise chapters. Each chapter is a short action title under 12 words, independently understandable and reviewable. Do not include alternate branches, conditional advice, implementation detail, or code."
        const val CHUNK_PROMPT = "Return JSON only: {\"stepIndex\":0,\"title\":\"\",\"explanation\":\"\",\"edits\":[{\"path\":\"relative/path\",\"content\":\"complete new file content\"}],\"verification\":\"optional safe command\"}. One coherent change, at most 3 text files. Never use absolute paths."
    }
}

private fun required(value: String?): String = if (value.isNullOrEmpty()) throw IllegalStateException("Model returned an empty response") else value

private fun JsonElement?.path(vararg keys: Any): JsonElement? {
    var current = this
    for (key in keys) {
        current = when (key) {
            is String -> (current as? JsonObject)?.get(key)
            is Int -> (current as? JsonArray)?.getOrNull(key)
            else -> null
        }
    }
    return current
}

private fun JsonElement?.asString(): String? = (this as? JsonPrimitive)?.takeIf { it.isString }?.content

private fun unwrap(error: Throwable): Throwable {
    var current = error
    while ((current is CompletionException || current is ExecutionException || current is PairFlowRequestException) && current.cause != null) current = current.cause!!
    return current
}

/** Awaits without treating a cancelled HTTP future as coroutine cancellation (we map it to "Task stopped"). */
private suspend fun <T> CompletableFuture<T>.awaitResult(): T = suspendCancellableCoroutine { continuation ->
    whenComplete { value, error ->
        if (error != null) continuation.resumeWithException(PairFlowRequestException(error)) else continuation.resume(value)
    }
    continuation.invokeOnCancellation { cancel(true) }
}

private class PairFlowRequestException(cause: Throwable) : RuntimeException(cause.message, cause)

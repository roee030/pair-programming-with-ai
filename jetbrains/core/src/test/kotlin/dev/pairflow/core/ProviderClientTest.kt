package dev.pairflow.core

import kotlinx.coroutines.async
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.yield
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.util.concurrent.CompletableFuture
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

class ProviderClientTest {
    private class Recorder(private val reply: String) : HttpTransport {
        var url = ""; var headers = emptyMap<String, String>(); var body = JsonObject(emptyMap())
        override fun post(url: String, headers: Map<String, String>, body: String, timeoutMs: Long): CompletableFuture<HttpResult> {
            this.url = url; this.headers = headers; this.body = PairFlowJson.parseToJsonElement(body).jsonObject
            return CompletableFuture.completedFuture(HttpResult(200, reply))
        }
    }
    private val plan = "{\\\"summary\\\":\\\"S\\\",\\\"steps\\\":[\\\"A\\\"]}"

    @Test fun `uses OpenAI Chat Completions JSON mode`() = runTest {
        val http = Recorder("{\"choices\":[{\"message\":{\"content\":\"$plan\"}}]}")
        ProviderClient(ProviderOptions(Provider.OPENAI, "key", "gpt-test", "", transport = http)).requestPlan("goal", "context")
        assertEquals("https://api.openai.com/v1/chat/completions", http.url)
        assertEquals("Bearer key", http.headers["authorization"])
        assertEquals("json_object", http.body["response_format"]!!.jsonObject["type"]!!.jsonPrimitive.content)
    }

    @Test fun `uses Anthropic Messages headers and system field`() = runTest {
        val http = Recorder("{\"content\":[{\"type\":\"text\",\"text\":\"$plan\"}]}")
        ProviderClient(ProviderOptions(Provider.ANTHROPIC, "key", "claude-test", "", transport = http)).requestPlan("goal", "context")
        assertEquals("https://api.anthropic.com/v1/messages", http.url)
        assertEquals("key", http.headers["x-api-key"])
        assertEquals("2023-06-01", http.headers["anthropic-version"])
        assertTrue(http.body["system"]!!.jsonPrimitive.content.contains("pair programmer"))
    }

    @Test fun `uses Gemini generateContent and JSON mime type`() = runTest {
        val http = Recorder("{\"candidates\":[{\"content\":{\"parts\":[{\"text\":\"$plan\"}]}}]}")
        ProviderClient(ProviderOptions(Provider.GEMINI, "key", "gemini-test", "", transport = http)).requestPlan("goal", "context")
        assertEquals("https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent", http.url)
        assertEquals("key", http.headers["x-goog-api-key"])
        assertEquals("application/json", http.body["generationConfig"]!!.jsonObject["responseMimeType"]!!.jsonPrimitive.content)
    }

    @Test fun `uses native Ollama chat without requiring a key`() = runTest {
        val http = Recorder("{\"message\":{\"content\":\"$plan\"}}")
        ProviderClient(ProviderOptions(Provider.OLLAMA, "", "local-model", "", transport = http)).requestPlan("goal", "context")
        assertEquals("http://localhost:11434/api/chat", http.url)
        assertEquals("json", http.body["format"]!!.jsonPrimitive.content)
    }

    @Test fun `requires an API key for hosted providers`() = runTest {
        val error = assertFailsWith<IllegalStateException> { ProviderClient(ProviderOptions(Provider.OPENAI, "", transport = Recorder("{}"))).requestPlan("g", "c") }
        assertEquals("Set your openai API key first", error.message)
    }

    @Test fun `reports a timeout in the message the orchestrator pauses on`() = runTest {
        val never = HttpTransport { _, _, _, _ -> CompletableFuture<HttpResult>() }
        val error = assertFailsWith<IllegalStateException> { ProviderClient(ProviderOptions(Provider.OPENAI, "key", timeoutMs = 20, transport = never)).requestPlan("g", "c") }
        assertEquals("openai request timed out", error.message)
    }

    @Test fun `stopping reports Task stopped`() = runTest {
        val pending = CompletableFuture<HttpResult>()
        val client = ProviderClient(ProviderOptions(Provider.OPENAI, "key", transport = { _, _, _, _ -> pending }))
        val job = async { runCatching { client.requestPlan("g", "c") } }
        yield()
        client.cancel()
        val result = job.await()
        assertEquals("Task stopped", result.exceptionOrNull()?.message)
    }

    @Test fun `surfaces HTTP errors with a short detail`() = runTest {
        val failing = HttpTransport { _, _, _, _ -> CompletableFuture.completedFuture(HttpResult(401, "bad key")) }
        val error = assertFailsWith<IllegalStateException> { ProviderClient(ProviderOptions(Provider.ANTHROPIC, "key", transport = failing)).requestPlan("g", "c") }
        assertEquals("anthropic request failed (401): bad key", error.message)
    }
}

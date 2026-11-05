package dev.pairflow.core

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.doubleOrNull

/** Port of src/model/protocol.ts: strict validation of model JSON replies. */
object Protocol {
    fun parsePlanResponse(text: String): Plan {
        val value = obj(json(text))
        val summary = value.string("summary")
        val steps = value["steps"] as? JsonArray
        if (summary == null || steps == null || steps.isEmpty() || !steps.all { it.isString() }) throw IllegalArgumentException("Invalid plan response")
        return Plan(summary, steps.map { (it as JsonPrimitive).content })
    }

    fun parseChunkResponse(text: String): Chunk {
        val value = obj(json(text))
        val stepIndex = (value["stepIndex"] as? JsonPrimitive)?.takeIf { !it.isString }?.let { it.intOrNull ?: it.doubleOrNull?.toInt() }
        val title = value.string("title")
        val explanation = value.string("explanation")
        val edits = value["edits"] as? JsonArray
        if (stepIndex == null || title == null || explanation == null || edits == null) throw IllegalArgumentException("Invalid chunk response")
        if (edits.size > 3) throw IllegalArgumentException("A chunk cannot edit more than three files")
        val parsed = edits.map { item ->
            val edit = obj(item)
            val path = edit.string("path")
            val content = edit.string("content")
            if (path == null || content == null) throw IllegalArgumentException("Invalid chunk edit")
            ProposedEdit(path, content, edit.string("originalHash"))
        }
        return Chunk(stepIndex, title, explanation, parsed, value.string("verification"))
    }

    private fun json(text: String): JsonElement {
        val clean = text.trim().replace(Regex("^```(?:json)?\\s*", RegexOption.IGNORE_CASE), "").replace(Regex("\\s*```$"), "")
        return try { PairFlowJson.parseToJsonElement(clean) } catch (_: Exception) { throw IllegalArgumentException("Model returned invalid JSON") }
    }

    private fun obj(value: JsonElement): JsonObject = value as? JsonObject ?: throw IllegalArgumentException("Expected a JSON object")
    private fun JsonElement.isString(): Boolean = this is JsonPrimitive && this.isString
    private fun JsonObject.string(key: String): String? = (this[key] as? JsonPrimitive)?.takeIf { it.isString }?.content
}

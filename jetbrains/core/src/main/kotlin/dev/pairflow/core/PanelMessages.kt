package dev.pairflow.core

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.intOrNull

/** Port of src/ui/panelMessages.ts: validates messages coming from the (shared) webview script. */
sealed interface PanelMessage {
    data class SubmitGoal(val goal: String) : PanelMessage
    data class SendMessage(val message: String) : PanelMessage
    data class OpenFile(val index: Int) : PanelMessage
    data class Simple(val type: String) : PanelMessage
    data object Ready : PanelMessage

    companion object {
        val SIMPLE_TYPES = setOf("approvePlan", "approveChunk", "rejectChunk", "previousFile", "nextFile", "retry", "resume", "cancelSession", "reset", "stop")

        fun parse(raw: String): PanelMessage? {
            val message = try { PairFlowJson.parseToJsonElement(raw) as? JsonObject } catch (_: Exception) { null } ?: return null
            val type = (message["type"] as? JsonPrimitive)?.takeIf { it.isString }?.content ?: return null
            fun text(key: String) = (message[key] as? JsonPrimitive)?.takeIf { it.isString }?.content?.trim()?.takeIf { it.isNotEmpty() }
            return when {
                type == "ready" -> Ready
                type == "submitGoal" -> text("goal")?.let { SubmitGoal(it) }
                type == "sendMessage" -> text("message")?.let { SendMessage(it) }
                type == "openFile" -> (message["index"] as? JsonPrimitive)?.takeIf { !it.isString }?.intOrNull?.takeIf { it >= 0 }?.let { OpenFile(it) }
                type in SIMPLE_TYPES -> Simple(type)
                else -> null
            }
        }

        fun moveFileSelection(current: Int, delta: Int, count: Int): Int = if (count <= 0) 0 else (current + delta).coerceIn(0, count - 1)
    }
}

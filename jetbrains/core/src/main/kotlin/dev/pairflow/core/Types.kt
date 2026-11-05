package dev.pairflow.core

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class Plan(val summary: String, val steps: List<String>)

@Serializable
data class ProposedEdit(val path: String, val content: String, val originalHash: String? = null)

@Serializable
data class Chunk(
    val stepIndex: Int,
    val title: String,
    val explanation: String,
    val edits: List<ProposedEdit>,
    val verification: String? = null,
)

@Serializable
enum class SessionStatus {
    @SerialName("active") ACTIVE,
    @SerialName("paused") PAUSED,
    @SerialName("done") DONE,
    @SerialName("canceled") CANCELED,
}

@Serializable
enum class HistoryRole { @SerialName("user") USER, @SerialName("assistant") ASSISTANT, @SerialName("system") SYSTEM }

@Serializable
enum class HistoryType {
    @SerialName("goal") GOAL,
    @SerialName("message") MESSAGE,
    @SerialName("plan") PLAN,
    @SerialName("explanation") EXPLANATION,
    @SerialName("revision") REVISION,
    @SerialName("approval") APPROVAL,
    @SerialName("applied") APPLIED,
    @SerialName("pause") PAUSE,
    @SerialName("error") ERROR,
    @SerialName("completion") COMPLETION,
}

@Serializable
data class HistoryEntry(
    val id: String,
    val timestamp: String,
    val role: HistoryRole,
    val type: HistoryType,
    val title: String? = null,
    val body: String? = null,
    val stepIndex: Int? = null,
)

/** Mirrors the TypeScript `PendingOperation` union; serialized with a `type` discriminator. */
@Serializable
sealed class PendingOperation {
    @Serializable @SerialName("plan")
    data class PlanOp(val goal: String) : PendingOperation()

    @Serializable @SerialName("chunk")
    data class ChunkOp(val feedback: String? = null) : PendingOperation()

    @Serializable @SerialName("apply")
    data object ApplyOp : PendingOperation()
}

@Serializable
enum class Phase {
    @SerialName("idle") IDLE,
    @SerialName("planning") PLANNING,
    @SerialName("awaitingPlanApproval") AWAITING_PLAN_APPROVAL,
    @SerialName("requestingChunk") REQUESTING_CHUNK,
    @SerialName("awaitingChunkApproval") AWAITING_CHUNK_APPROVAL,
    @SerialName("applying") APPLYING,
    @SerialName("paused") PAUSED,
    @SerialName("completed") COMPLETED,
    @SerialName("canceled") CANCELED,
    @SerialName("error") ERROR;

    val isRunning: Boolean get() = this == PLANNING || this == REQUESTING_CHUNK || this == APPLYING
}

@Serializable
data class SessionState(
    val phase: Phase = Phase.IDLE,
    val goal: String? = null,
    val plan: Plan? = null,
    val chunk: Chunk? = null,
    val currentStep: Int = 0,
    val error: String? = null,
    val resumePhase: Phase? = null,
)

@Serializable
data class SessionSummary(val id: String, val title: String, val status: SessionStatus, val updatedAt: String)

@Serializable
data class PersistedSession(
    val version: Int = 1,
    val id: String,
    val title: String,
    val status: SessionStatus,
    val updatedAt: String,
    val state: SessionState,
    val history: List<HistoryEntry>,
    val pendingOperation: PendingOperation? = null,
)

sealed interface SessionEvent {
    data class SubmitGoal(val goal: String) : SessionEvent
    data class PlanReceived(val plan: Plan) : SessionEvent
    data object ApprovePlan : SessionEvent
    data class ChunkReceived(val chunk: Chunk) : SessionEvent
    data object ApproveChunk : SessionEvent
    data object RejectChunk : SessionEvent
    data object ApplyComplete : SessionEvent
    data class Fail(val message: String) : SessionEvent
    data object Retry : SessionEvent
    data object Pause : SessionEvent
    data object Resume : SessionEvent
    data object Cancel : SessionEvent
    data object Reset : SessionEvent
}

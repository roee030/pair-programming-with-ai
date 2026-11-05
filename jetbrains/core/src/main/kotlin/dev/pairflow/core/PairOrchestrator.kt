package dev.pairflow.core

import java.time.Instant
import kotlin.coroutines.cancellation.CancellationException
import kotlin.random.Random

/**
 * Port of src/orchestrator/pairOrchestrator.ts.
 *
 * Not thread-safe by design: callers must confine every call to one thread or a
 * single-parallelism dispatcher (the IntelliJ panel does this), exactly like the
 * single-threaded VS Code extension host.
 */
class PairOrchestrator(
    private val model: ModelClient,
    private val workspace: Workspace,
    private val render: (SessionState) -> Unit,
    initial: PersistedSession? = null,
    private val persist: ((PersistedSession) -> Unit)? = null,
    private val now: () -> String = { Instant.now().toString() },
    private val makeId: () -> String = { "${System.currentTimeMillis().toString(36)}-${Random.nextLong(Long.MAX_VALUE).toString(36).take(7)}" },
) {
    private var state: SessionState = initial?.state ?: SessionMachine.initialState()
    private var prepared: List<PreparedEdit> = emptyList()
    private var inFlight = false
    private var operationVersion = 0
    private var history: MutableList<HistoryEntry> = initial?.history?.toMutableList() ?: mutableListOf()
    private var pendingOperation: PendingOperation? = initial?.pendingOperation
    private val sessionId: String = initial?.id ?: makeId()

    init { render(state) }

    val current: SessionState get() = state

    val snapshot: PersistedSession
        get() {
            val chunk = state.chunk
            val snapshotState = if (chunk != null && prepared.size == chunk.edits.size) {
                state.copy(chunk = chunk.copy(edits = chunk.edits.mapIndexed { index, edit -> edit.copy(originalHash = edit.originalHash ?: prepared[index].currentHash) }))
            } else state
            return PersistedSession(
                id = sessionId,
                title = state.goal?.take(80)?.takeIf { it.isNotEmpty() } ?: "Untitled session",
                status = statusFor(state.phase),
                updatedAt = now(),
                state = snapshotState,
                history = history.toList(),
                pendingOperation = pendingOperation,
            )
        }

    fun getPrepared(): List<PreparedEdit> = prepared
    fun getHistory(): List<HistoryEntry> = history.toList()

    suspend fun restorePrepared() {
        val needsPrepared = state.phase == Phase.AWAITING_CHUNK_APPROVAL || pendingOperation is PendingOperation.ApplyOp
        val chunk = state.chunk
        if (needsPrepared && chunk != null) { prepared = workspace.prepare(chunk.edits); render(state) }
    }

    suspend fun submitGoal(goal: String) {
        if (inFlight) return
        pendingOperation = PendingOperation.PlanOp(goal)
        addHistory(HistoryRole.USER, HistoryType.GOAL, "Goal", goal)
        exclusive { version -> set(SessionEvent.SubmitGoal(goal)); runPlan(version, goal) }
    }

    suspend fun approvePlan() {
        if (inFlight) return
        pendingOperation = PendingOperation.ChunkOp()
        addHistory(HistoryRole.USER, HistoryType.APPROVAL, "Plan approved", state.plan?.summary)
        exclusive { version -> set(SessionEvent.ApprovePlan); requestChunk(version) }
    }

    suspend fun approveChunk() {
        if (inFlight) return
        pendingOperation = PendingOperation.ApplyOp
        addHistory(HistoryRole.USER, HistoryType.APPROVAL, "Chunk approved", state.chunk?.title, state.currentStep)
        exclusive { version -> set(SessionEvent.ApproveChunk); applyAndAdvance(version) }
    }

    suspend fun rejectChunk(feedback: String = "Rejected. Propose a materially different, smaller approach.") {
        if (inFlight) return
        pendingOperation = PendingOperation.ChunkOp(feedback)
        addHistory(HistoryRole.USER, HistoryType.REVISION, "Revision requested", feedback, state.currentStep)
        exclusive { version -> set(SessionEvent.RejectChunk); requestChunk(version, feedback) }
    }

    fun stop() {
        if (!state.phase.isRunning) return
        operationVersion++; inFlight = false; model.cancel()
        set(SessionEvent.Pause)
        addHistory(HistoryRole.SYSTEM, HistoryType.PAUSE, "Work paused", "The active request was stopped.")
        save()
    }

    suspend fun resume() {
        if (state.phase != Phase.PAUSED || pendingOperation == null) return
        set(SessionEvent.Resume); runPending()
    }

    suspend fun retry() {
        if (state.phase != Phase.ERROR || pendingOperation == null) return
        set(SessionEvent.Retry); runPending()
    }

    fun cancel() {
        if (inFlight) model.cancel()
        operationVersion++; inFlight = false; pendingOperation = null
        set(SessionEvent.Cancel); addHistory(HistoryRole.SYSTEM, HistoryType.PAUSE, "Session canceled"); save()
    }

    fun reset() {
        operationVersion++; inFlight = false; model.cancel(); prepared = emptyList(); pendingOperation = null; history = mutableListOf()
        state = SessionMachine.initialState(); render(state)
    }

    private suspend fun runPending() {
        val operation = pendingOperation ?: return
        exclusive { version ->
            when (operation) {
                is PendingOperation.PlanOp -> runPlan(version, operation.goal)
                is PendingOperation.ChunkOp -> requestChunk(version, operation.feedback)
                PendingOperation.ApplyOp -> applyAndAdvance(version)
            }
        }
    }

    private suspend fun runPlan(version: Int, goal: String) {
        val context = workspace.context(); if (!isCurrent(version)) return
        val plan = model.requestPlan(goal, context); if (!isCurrent(version)) return
        pendingOperation = null; set(SessionEvent.PlanReceived(plan))
        addHistory(HistoryRole.ASSISTANT, HistoryType.PLAN, "Plan", "${plan.summary}\n${plan.steps.mapIndexed { index, step -> "${index + 1}. $step" }.joinToString("\n")}")
        save()
    }

    private suspend fun requestChunk(version: Int, feedback: String? = null) {
        val goal = state.goal
        val plan = state.plan
        val currentStep = state.currentStep
        if (goal == null || plan == null) throw IllegalStateException("Session is missing its approved plan")
        val context = workspace.context(); if (!isCurrent(version)) return
        val chunk = model.requestChunk(goal, plan, currentStep, context, feedback); if (!isCurrent(version)) return
        prepared = workspace.prepare(chunk.edits); if (!isCurrent(version)) return
        pendingOperation = null; set(SessionEvent.ChunkReceived(chunk))
        addHistory(HistoryRole.ASSISTANT, HistoryType.EXPLANATION, chunk.title, chunk.explanation, currentStep)
        save()
    }

    private suspend fun applyAndAdvance(version: Int) {
        workspace.apply(prepared); if (!isCurrent(version)) return
        addHistory(HistoryRole.SYSTEM, HistoryType.APPLIED, "Chunk applied", state.chunk?.title, state.currentStep)
        val hasNext = state.currentStep + 1 < (state.plan?.steps?.size ?: 0)
        pendingOperation = if (hasNext) PendingOperation.ChunkOp() else null
        set(SessionEvent.ApplyComplete)
        if (state.phase == Phase.REQUESTING_CHUNK) requestChunk(version)
        else { pendingOperation = null; addHistory(HistoryRole.SYSTEM, HistoryType.COMPLETION, "Story complete"); save() }
    }

    private suspend fun exclusive(work: suspend (Int) -> Unit) {
        if (inFlight) return
        val version = ++operationVersion
        inFlight = true
        try {
            work(version)
        } catch (error: CancellationException) {
            throw error
        } catch (error: Throwable) {
            if (isCurrent(version)) {
                val message = error.message ?: error.toString()
                if (Regex("request timed out$", RegexOption.IGNORE_CASE).containsMatchIn(message)) {
                    set(SessionEvent.Pause)
                    addHistory(HistoryRole.SYSTEM, HistoryType.PAUSE, "Request timed out", "The session is saved and can be resumed.")
                } else {
                    set(SessionEvent.Fail(message))
                    addHistory(HistoryRole.SYSTEM, HistoryType.ERROR, "Action failed", message)
                }
                save()
            }
        } finally {
            if (isCurrent(version)) inFlight = false
        }
    }

    private fun set(event: SessionEvent) { state = SessionMachine.transition(state, event); render(state); save() }
    private fun isCurrent(version: Int): Boolean = version == operationVersion

    private fun addHistory(role: HistoryRole, type: HistoryType, title: String? = null, body: String? = null, stepIndex: Int? = null) {
        history.add(HistoryEntry(makeId(), now(), role, type, title, body, stepIndex))
        render(state)
    }

    private fun save() {
        val sink = persist ?: return
        runCatching { sink(snapshot) }
    }

    private fun statusFor(phase: Phase): SessionStatus = when (phase) {
        Phase.PAUSED -> SessionStatus.PAUSED
        Phase.COMPLETED -> SessionStatus.DONE
        Phase.CANCELED -> SessionStatus.CANCELED
        else -> SessionStatus.ACTIVE
    }
}

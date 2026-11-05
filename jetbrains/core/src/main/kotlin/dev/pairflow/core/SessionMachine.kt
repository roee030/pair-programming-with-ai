package dev.pairflow.core

/** Port of src/session/sessionMachine.ts. Keep the two in sync. */
object SessionMachine {
    fun initialState(): SessionState = SessionState()

    fun transition(state: SessionState, event: SessionEvent): SessionState {
        if (event is SessionEvent.Reset) return initialState()
        if (event is SessionEvent.Pause && state.phase.isRunning) return state.copy(phase = Phase.PAUSED, resumePhase = state.phase)
        if (event is SessionEvent.Cancel && state.phase != Phase.COMPLETED) return state.copy(phase = Phase.CANCELED, error = null, resumePhase = null)
        if (event is SessionEvent.Resume && state.phase == Phase.PAUSED && state.resumePhase != null) return state.copy(phase = state.resumePhase, error = null)
        if (event is SessionEvent.Fail && state.phase != Phase.ERROR) return state.copy(phase = Phase.ERROR, error = event.message, resumePhase = state.phase)
        if (event is SessionEvent.Retry && state.phase == Phase.ERROR && state.resumePhase != null) return state.copy(phase = state.resumePhase, error = null, resumePhase = null)
        when (state.phase) {
            Phase.IDLE -> if (event is SessionEvent.SubmitGoal && event.goal.isNotBlank()) return state.copy(phase = Phase.PLANNING, goal = event.goal.trim())
            Phase.PLANNING -> if (event is SessionEvent.PlanReceived) return state.copy(phase = Phase.AWAITING_PLAN_APPROVAL, plan = event.plan)
            Phase.AWAITING_PLAN_APPROVAL -> {
                if (event is SessionEvent.ApprovePlan) return state.copy(phase = Phase.REQUESTING_CHUNK)
                if (event is SessionEvent.ChunkReceived) throw IllegalStateException("Plan must be approved before a chunk can be accepted")
            }
            Phase.REQUESTING_CHUNK -> if (event is SessionEvent.ChunkReceived) return state.copy(phase = Phase.AWAITING_CHUNK_APPROVAL, chunk = event.chunk)
            Phase.AWAITING_CHUNK_APPROVAL -> {
                if (event is SessionEvent.ApproveChunk) return state.copy(phase = Phase.APPLYING)
                if (event is SessionEvent.RejectChunk) return state.copy(phase = Phase.REQUESTING_CHUNK, chunk = null)
            }
            Phase.APPLYING -> if (event is SessionEvent.ApplyComplete) {
                val next = state.currentStep + 1
                val total = state.plan?.steps?.size ?: 0
                return state.copy(currentStep = next, chunk = null, phase = if (next >= total) Phase.COMPLETED else Phase.REQUESTING_CHUNK)
            }
            else -> Unit
        }
        throw IllegalStateException("Event ${eventName(event)} is not allowed while ${phaseName(state.phase)}")
    }

    private fun eventName(event: SessionEvent): String = when (event) {
        is SessionEvent.SubmitGoal -> "SUBMIT_GOAL"
        is SessionEvent.PlanReceived -> "PLAN_RECEIVED"
        SessionEvent.ApprovePlan -> "APPROVE_PLAN"
        is SessionEvent.ChunkReceived -> "CHUNK_RECEIVED"
        SessionEvent.ApproveChunk -> "APPROVE_CHUNK"
        SessionEvent.RejectChunk -> "REJECT_CHUNK"
        SessionEvent.ApplyComplete -> "APPLY_COMPLETE"
        is SessionEvent.Fail -> "FAIL"
        SessionEvent.Retry -> "RETRY"
        SessionEvent.Pause -> "PAUSE"
        SessionEvent.Resume -> "RESUME"
        SessionEvent.Cancel -> "CANCEL"
        SessionEvent.Reset -> "RESET"
    }

    private fun phaseName(phase: Phase): String = PairFlowJson.encodeToString(Phase.serializer(), phase).trim('"')
}

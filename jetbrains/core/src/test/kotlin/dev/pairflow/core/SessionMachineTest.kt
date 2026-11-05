package dev.pairflow.core

import dev.pairflow.core.SessionMachine.initialState
import dev.pairflow.core.SessionMachine.transition
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class SessionMachineTest {
    private val chunk = Chunk(0, "Add route", "Adds route", listOf(ProposedEdit("src/a.ts", "export {}")))
    private fun approvedPlan(): SessionState {
        var state = transition(initialState(), SessionEvent.SubmitGoal("Add login"))
        state = transition(state, SessionEvent.PlanReceived(Plan("Add login", listOf("Add route"))))
        return transition(state, SessionEvent.ApprovePlan)
    }

    @Test fun `requires plan approval before requesting a chunk`() {
        var state = transition(initialState(), SessionEvent.SubmitGoal("Add login"))
        state = transition(state, SessionEvent.PlanReceived(Plan("Add login", listOf("Add route"))))
        assertEquals(Phase.AWAITING_PLAN_APPROVAL, state.phase)
        val error = assertFailsWith<IllegalStateException> { transition(state, SessionEvent.ChunkReceived(chunk)) }
        assert(error.message!!.contains("plan", ignoreCase = true))
    }

    @Test fun `never enters applying without explicit chunk approval`() {
        val state = transition(approvedPlan(), SessionEvent.ChunkReceived(chunk))
        assertEquals(Phase.AWAITING_CHUNK_APPROVAL, state.phase)
        assertEquals(Phase.REQUESTING_CHUNK, transition(state, SessionEvent.RejectChunk).phase)
        assertEquals(Phase.APPLYING, transition(state, SessionEvent.ApproveChunk).phase)
    }

    @Test fun `preserves the prior phase when an operation fails`() {
        val failed = transition(approvedPlan(), SessionEvent.Fail("offline"))
        assertEquals(Phase.ERROR, failed.phase)
        assertEquals(Phase.REQUESTING_CHUNK, failed.resumePhase)
        assertEquals(Phase.REQUESTING_CHUNK, transition(failed, SessionEvent.Retry).phase)
    }

    @Test fun `pauses active work and resumes the exact prior phase`() {
        val planning = transition(initialState(), SessionEvent.SubmitGoal("Add login"))
        val paused = transition(planning, SessionEvent.Pause)
        assertEquals(Phase.PAUSED, paused.phase)
        assertEquals(Phase.PLANNING, paused.resumePhase)
        assertEquals(Phase.PLANNING, transition(paused, SessionEvent.Resume).phase)
    }

    @Test fun `can cancel paused work without erasing its state`() {
        val paused = transition(transition(initialState(), SessionEvent.SubmitGoal("Add login")), SessionEvent.Pause)
        val canceled = transition(paused, SessionEvent.Cancel)
        assertEquals(Phase.CANCELED, canceled.phase)
        assertEquals("Add login", canceled.goal)
    }

    @Test fun `error messages use the TypeScript names`() {
        val error = assertFailsWith<IllegalStateException> { transition(initialState(), SessionEvent.ApproveChunk) }
        assertEquals("Event APPROVE_CHUNK is not allowed while idle", error.message)
    }
}

package dev.pairflow.core

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class SessionRepositoryTest {
    private class MemoryStore : SessionFileStore {
        val files = mutableMapOf<String, String>()
        override fun read(name: String) = files[name]
        override fun write(name: String, value: String) { files[name] = value }
        override fun delete(name: String) { files.remove(name) }
    }

    private fun session(id: String, phase: Phase, status: SessionStatus, at: String) =
        PersistedSession(id = id, title = "Goal $id", status = status, updatedAt = at, state = SessionState(phase = phase, goal = "Goal $id"), history = emptyList(), pendingOperation = PendingOperation.PlanOp("Goal $id"))

    @Test fun `restores an interrupted session as paused`() {
        val store = MemoryStore()
        SessionRepository(store).save(session("a", Phase.PLANNING, SessionStatus.ACTIVE, "2026-01-01T00:00:00Z"))
        val restored = SessionRepository(store).loadActive()!!
        assertEquals(Phase.PAUSED, restored.state.phase)
        assertEquals(Phase.PLANNING, restored.state.resumePhase)
        assertEquals(PendingOperation.PlanOp("Goal a"), restored.pendingOperation)
    }

    @Test fun `a new active session supersedes the old one`() {
        val store = MemoryStore()
        val repository = SessionRepository(store)
        repository.save(session("a", Phase.AWAITING_PLAN_APPROVAL, SessionStatus.ACTIVE, "2026-01-01T00:00:00Z"))
        repository.save(session("b", Phase.AWAITING_PLAN_APPROVAL, SessionStatus.ACTIVE, "2026-01-02T00:00:00Z"))
        assertEquals(listOf("b" to SessionStatus.ACTIVE, "a" to SessionStatus.CANCELED), repository.list().map { it.id to it.status })
        assertNull(store.files["session-a.json"])
    }

    @Test fun `finished sessions keep only their summary`() {
        val store = MemoryStore()
        val repository = SessionRepository(store)
        repository.save(session("a", Phase.COMPLETED, SessionStatus.DONE, "2026-01-01T00:00:00Z"))
        assertNull(repository.loadActive())
        assertEquals(1, repository.list().size)
    }

    @Test fun `persisted JSON uses the TypeScript field names`() {
        val json = PairFlowJson.encodeToString(PersistedSession.serializer(), session("a", Phase.AWAITING_PLAN_APPROVAL, SessionStatus.ACTIVE, "t"))
        assert(json.contains("\"phase\":\"awaitingPlanApproval\"")) { json }
        assert(json.contains("\"pendingOperation\":{\"type\":\"plan\",\"goal\":\"Goal a\"}")) { json }
    }
}

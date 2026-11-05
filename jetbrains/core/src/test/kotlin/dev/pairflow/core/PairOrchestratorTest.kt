package dev.pairflow.core

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.async
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.yield
import java.nio.file.Path
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse

class PairOrchestratorTest {
    private open class FakeModel(val steps: List<String> = listOf("A")) : ModelClient {
        val requests = mutableListOf<Pair<Int, String?>>()
        var chunkCount = 0
        override suspend fun requestPlan(goal: String, context: String) = Plan("S", steps)
        override suspend fun requestChunk(goal: String, plan: Plan, stepIndex: Int, context: String, feedback: String?): Chunk {
            requests += stepIndex to feedback
            chunkCount++
            return Chunk(stepIndex, if (feedback != null) "Replacement" else "Chapter $chunkCount", "E", listOf(ProposedEdit("chapter-$chunkCount.ts", "x")))
        }
    }

    private class FakeWorkspace : Workspace {
        val calls = mutableListOf<String>()
        val applied = mutableListOf<List<String>>()
        var gate: CompletableDeferred<Unit>? = null
        override suspend fun context() = ""
        override suspend fun prepare(edits: List<ProposedEdit>): List<PreparedEdit> {
            calls += "prepare"
            return edits.map { PreparedEdit(it.path, it.content, it.originalHash, Path.of(it.path), EditValidation.hash(null), "") }
        }
        override suspend fun apply(prepared: List<PreparedEdit>) { calls += "apply"; applied += prepared.map { it.path }; gate?.await() }
    }

    @Test fun `does not prepare or apply edits until approvals`() = runTest {
        val workspace = FakeWorkspace()
        val flow = PairOrchestrator(FakeModel(), workspace, {})
        flow.submitGoal("goal"); assertEquals(emptyList(), workspace.calls)
        flow.approvePlan(); assertEquals(listOf("prepare"), workspace.calls)
        flow.approveChunk(); assertEquals(listOf("prepare", "apply"), workspace.calls)
        assertEquals(Phase.COMPLETED, flow.current.phase)
    }

    @Test fun `accepts one chapter, applies it once, and advances to the next review`() = runTest {
        val workspace = FakeWorkspace()
        val flow = PairOrchestrator(FakeModel(listOf("A", "B")), workspace, {})
        flow.submitGoal("goal"); flow.approvePlan(); flow.approveChunk()
        assertEquals(listOf(listOf("chapter-1.ts")), workspace.applied)
        assertEquals(Phase.AWAITING_CHUNK_APPROVAL, flow.current.phase)
        assertEquals(1, flow.current.currentStep)
        assertEquals("Chapter 2", flow.current.chunk?.title)
        assertEquals(2, flow.snapshot.history.count { it.type == HistoryType.APPROVAL })
        assertEquals(1, flow.snapshot.history.count { it.type == HistoryType.APPLIED })
    }

    @Test fun `rejects without applying and requests a replacement for the same chapter`() = runTest {
        val model = FakeModel()
        val workspace = FakeWorkspace()
        val flow = PairOrchestrator(model, workspace, {})
        flow.submitGoal("goal"); flow.approvePlan(); flow.rejectChunk("Use a smaller change")
        assertFalse("apply" in workspace.calls)
        assertEquals(0, flow.current.currentStep)
        assertEquals("Replacement", flow.current.chunk?.title)
        assertEquals(listOf(0 to null, 0 to "Use a smaller change"), model.requests)
        assertEquals(1, flow.snapshot.history.count { it.type == HistoryType.REVISION })
    }

    @Test fun `ignores a duplicate accept while the chapter apply is still running`() = runTest {
        val workspace = FakeWorkspace()
        val flow = PairOrchestrator(FakeModel(), workspace, {})
        flow.submitGoal("goal"); flow.approvePlan()
        workspace.gate = CompletableDeferred()
        val first = async { flow.approveChunk() }
        yield()
        flow.approveChunk()
        assertEquals(1, workspace.applied.size)
        workspace.gate!!.complete(Unit); first.await()
        assertEquals(Phase.COMPLETED, flow.current.phase)
        assertEquals(1, flow.snapshot.history.count { it.title == "Chunk approved" })
    }

    @Test fun `a timeout pauses the session so it can be resumed`() = runTest {
        var fail = true
        val model = object : FakeModel() {
            override suspend fun requestPlan(goal: String, context: String): Plan { if (fail) throw IllegalStateException("openai request timed out"); return super.requestPlan(goal, context) }
        }
        val flow = PairOrchestrator(model, FakeWorkspace(), {})
        flow.submitGoal("goal")
        assertEquals(Phase.PAUSED, flow.current.phase)
        fail = false
        flow.resume()
        assertEquals(Phase.AWAITING_PLAN_APPROVAL, flow.current.phase)
    }

    @Test fun `other failures move to error and retry runs the pending operation`() = runTest {
        var fail = true
        val model = object : FakeModel() {
            override suspend fun requestPlan(goal: String, context: String): Plan { if (fail) throw IllegalStateException("offline"); return super.requestPlan(goal, context) }
        }
        val flow = PairOrchestrator(model, FakeWorkspace(), {})
        flow.submitGoal("goal")
        assertEquals(Phase.ERROR, flow.current.phase)
        assertEquals("offline", flow.current.error)
        fail = false
        flow.retry()
        assertEquals(Phase.AWAITING_PLAN_APPROVAL, flow.current.phase)
    }

    @Test fun `snapshot records preview hashes so a restored session detects edits`() = runTest {
        val flow = PairOrchestrator(FakeModel(), FakeWorkspace(), {})
        flow.submitGoal("goal"); flow.approvePlan()
        assertEquals(EditValidation.hash(null), flow.snapshot.state.chunk!!.edits.single().originalHash)
    }
}

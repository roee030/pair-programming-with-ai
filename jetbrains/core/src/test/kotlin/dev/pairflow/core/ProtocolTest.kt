package dev.pairflow.core

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

class ProtocolTest {
    @Test fun `parses a fenced plan response`() {
        assertEquals(listOf("A"), Protocol.parsePlanResponse("```json\n{\"summary\":\"S\",\"steps\":[\"A\"]}\n```").steps)
    }

    @Test fun `rejects malformed and oversized chunks`() {
        assertTrue(assertFailsWith<IllegalArgumentException> { Protocol.parsePlanResponse("nope") }.message!!.contains("JSON"))
        val edits = (1..4).joinToString(",") { "{\"path\":\"a$it.ts\",\"content\":\"\"}" }
        val error = assertFailsWith<IllegalArgumentException> { Protocol.parseChunkResponse("{\"stepIndex\":0,\"title\":\"x\",\"explanation\":\"x\",\"edits\":[$edits]}") }
        assertTrue(error.message!!.contains("three"))
    }

    @Test fun `rejects missing chunk fields`() {
        assertTrue(assertFailsWith<IllegalArgumentException> { Protocol.parseChunkResponse("{}") }.message!!.contains("chunk"))
    }

    @Test fun `parses a full chunk`() {
        val chunk = Protocol.parseChunkResponse("{\"stepIndex\":1,\"title\":\"T\",\"explanation\":\"E\",\"edits\":[{\"path\":\"a.kt\",\"content\":\"x\"}],\"verification\":\"./gradlew test\"}")
        assertEquals(1, chunk.stepIndex)
        assertEquals("a.kt", chunk.edits.single().path)
        assertEquals("./gradlew test", chunk.verification)
    }
}

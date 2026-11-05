package dev.pairflow.core

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class PanelMessageTest {
    @Test fun `parses the messages main js sends`() {
        assertEquals(PanelMessage.SubmitGoal("Add login"), PanelMessage.parse("{\"type\":\"submitGoal\",\"goal\":\" Add login \"}"))
        assertEquals(PanelMessage.OpenFile(2), PanelMessage.parse("{\"type\":\"openFile\",\"index\":2}"))
        assertEquals(PanelMessage.Simple("approveChunk"), PanelMessage.parse("{\"type\":\"approveChunk\"}"))
    }

    @Test fun `drops invalid messages`() {
        assertNull(PanelMessage.parse("{\"type\":\"submitGoal\",\"goal\":\"  \"}"))
        assertNull(PanelMessage.parse("{\"type\":\"openFile\",\"index\":-1}"))
        assertNull(PanelMessage.parse("{\"type\":\"deleteEverything\"}"))
        assertNull(PanelMessage.parse("not json"))
    }

    @Test fun `clamps file selection`() {
        assertEquals(0, PanelMessage.moveFileSelection(0, -1, 3))
        assertEquals(2, PanelMessage.moveFileSelection(2, 1, 3))
        assertEquals(0, PanelMessage.moveFileSelection(5, 0, 0))
    }
}

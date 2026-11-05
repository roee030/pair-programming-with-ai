package dev.pairflow.core

import java.nio.file.Path
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class EditValidationTest {
    private val root = Path.of("workspace").toAbsolutePath().normalize()

    @Test fun `accepts text edits inside the workspace`() {
        assertEquals(root.resolve("src").resolve("a.ts"), EditValidation.validateEdits(root, listOf(ProposedEdit("src/a.ts", "ok")))[0].absolutePath)
    }

    @Test fun `rejects unsafe paths`() {
        for (unsafe in listOf("../secret", "/tmp/x", "C:\\secret.txt", "src/../../x", "")) {
            assertFailsWith<IllegalArgumentException>(unsafe) { EditValidation.validateEdits(root, listOf(ProposedEdit(unsafe, "x"))) }
        }
    }

    @Test fun `rejects null bytes`() {
        assertFailsWith<IllegalArgumentException> { EditValidation.validateEdits(root, listOf(ProposedEdit("a.txt", "a\u0000b"))) }
    }

    @Test fun `detects files that changed since preview`() {
        val before = EditValidation.hash("old")
        assertEquals(ApplyDecision.APPLY, EditValidation.decidePreparedApply("old", "new", before, before, null))
        assertEquals(ApplyDecision.ALREADY_APPLIED, EditValidation.decidePreparedApply("new", "new", EditValidation.hash("new"), before, null))
        assertFailsWith<IllegalStateException> { EditValidation.decidePreparedApply("other", "new", EditValidation.hash("other"), before, null) }
    }

    @Test fun `hash matches the VS Code extension`() {
        // node -e "console.log(require('crypto').createHash('sha256').update('<missing>').digest('hex'))"
        assertEquals("769b8995b8bf4407c89e906d67601a46266d34922a63ab1754440eecb0657aab", EditValidation.hash(null))
    }
}

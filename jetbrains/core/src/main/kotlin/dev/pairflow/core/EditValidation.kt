package dev.pairflow.core

import java.nio.file.Path
import java.security.MessageDigest

data class ValidatedEdit(val path: String, val content: String, val originalHash: String?, val absolutePath: Path)

data class PreparedEdit(
    val path: String,
    val content: String,
    val originalHash: String?,
    val absolutePath: Path,
    val currentHash: String,
    val currentContent: String,
)

enum class ApplyDecision { APPLY, ALREADY_APPLIED }

/** Port of src/workspace/editValidation.ts. Never lets the model write outside the project root. */
object EditValidation {
    private val windowsDrive = Regex("^[A-Za-z]:[\\\\/]")

    fun validateEdits(root: Path, edits: List<ProposedEdit>): List<ValidatedEdit> {
        val resolvedRoot = root.toAbsolutePath().normalize()
        return edits.map { edit ->
            if (edit.path.isEmpty() || edit.path.startsWith("/") || edit.path.startsWith("\\") || windowsDrive.containsMatchIn(edit.path)) {
                throw IllegalArgumentException("Unsafe path: ${edit.path}")
            }
            val absolute = resolvedRoot.resolve(edit.path.replace('\\', '/')).normalize()
            if (!absolute.startsWith(resolvedRoot) || absolute == resolvedRoot) throw IllegalArgumentException("Path escapes workspace: ${edit.path}")
            if (edit.content.contains('\u0000')) throw IllegalArgumentException("Binary content is not supported: ${edit.path}")
            ValidatedEdit(edit.path, edit.content, edit.originalHash, absolute)
        }
    }

    fun decidePreparedApply(currentContent: String?, proposedContent: String, actualHash: String, previewHash: String, originalHash: String?, path: String = "file"): ApplyDecision {
        if (currentContent == proposedContent) return ApplyDecision.ALREADY_APPLIED
        if (actualHash != previewHash || (originalHash != null && originalHash != actualHash)) throw IllegalStateException("File changed since preview: $path")
        return ApplyDecision.APPLY
    }

    fun hash(value: String?): String {
        val digest = MessageDigest.getInstance("SHA-256").digest((value ?: "<missing>").toByteArray(Charsets.UTF_8))
        return digest.joinToString("") { "%02x".format(it) }
    }
}

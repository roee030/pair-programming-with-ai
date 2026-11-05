package dev.pairflow.intellij

import com.intellij.openapi.application.EDT
import com.intellij.openapi.application.readAction
import com.intellij.openapi.command.WriteCommandAction
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.roots.ProjectFileIndex
import com.intellij.openapi.util.text.StringUtil
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.openapi.vfs.VfsUtil
import com.intellij.openapi.vfs.VfsUtilCore
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.openapi.vfs.VirtualFileVisitor
import dev.pairflow.core.ApplyDecision
import dev.pairflow.core.EditValidation
import dev.pairflow.core.PreparedEdit
import dev.pairflow.core.ProposedEdit
import dev.pairflow.core.Workspace
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.nio.file.Path

/** IntelliJ implementation of the workspace port (src/workspace/workspaceAdapter.ts in VS Code). */
class IntellijWorkspace(private val project: Project, private val root: Path, private val maxContextFiles: Int) : Workspace {

    override suspend fun context(): String {
        val rootFile = withContext(Dispatchers.IO) { LocalFileSystem.getInstance().refreshAndFindFileByNioFile(root) } ?: return ""
        return readAction {
            val index = ProjectFileIndex.getInstance(project)
            val parts = mutableListOf<String>()
            VfsUtilCore.visitChildrenRecursively(rootFile, object : VirtualFileVisitor<Unit>() {
                override fun visitFileEx(file: VirtualFile): VirtualFileVisitor.Result {
                    if (parts.size >= maxContextFiles) return VirtualFileVisitor.SKIP_CHILDREN
                    if (file.isDirectory) return if (file.name in SKIPPED_DIRS || index.isExcluded(file)) VirtualFileVisitor.SKIP_CHILDREN else VirtualFileVisitor.CONTINUE
                    if ((file.extension?.lowercase() ?: "") in CONTEXT_EXTENSIONS && file.length < MAX_FILE_BYTES && !file.fileType.isBinary) {
                        val text = textOf(file)
                        if (text != null && !text.contains('\u0000') && text.length < MAX_FILE_CHARS) {
                            parts += "--- ${VfsUtilCore.getRelativePath(file, rootFile, '/') ?: file.name}\n$text"
                        }
                    }
                    return VirtualFileVisitor.CONTINUE
                }
            })
            parts.joinToString("\n\n")
        }
    }

    override suspend fun prepare(edits: List<ProposedEdit>): List<PreparedEdit> {
        val validated = EditValidation.validateEdits(root, edits)
        return validated.map { edit ->
            val current = read(edit.absolutePath)
            PreparedEdit(edit.path, edit.content, edit.originalHash, edit.absolutePath, EditValidation.hash(current), current ?: "")
        }
    }

    override suspend fun apply(prepared: List<PreparedEdit>) {
        if (prepared.isEmpty()) return
        // Refresh outside the write action so external changes are visible to the freshness check.
        withContext(Dispatchers.IO) { prepared.forEach { LocalFileSystem.getInstance().refreshAndFindFileByNioFile(it.absolutePath) } }
        withContext(Dispatchers.EDT) {
            var failure: Throwable? = null
            WriteCommandAction.runWriteCommandAction(project, "Apply Pair Flow Chunk", "Pair Flow", Runnable {
                try {
                    // Check every file before writing any, so a stale file leaves the whole chunk unapplied.
                    val pending = prepared.filter { edit ->
                        val current = LocalFileSystem.getInstance().findFileByNioFile(edit.absolutePath)?.let(::textOf)
                        EditValidation.decidePreparedApply(current, normalize(edit.content), EditValidation.hash(current), edit.currentHash, edit.originalHash, edit.path) == ApplyDecision.APPLY
                    }
                    for (edit in pending) write(edit)
                } catch (error: Throwable) {
                    failure = error
                }
            })
            failure?.let { throw it }
        }
    }

    private fun write(edit: PreparedEdit) {
        val target = edit.absolutePath
        val file = LocalFileSystem.getInstance().findFileByNioFile(target) ?: run {
            val parent = VfsUtil.createDirectoryIfMissing(target.parent.toString()) ?: throw IllegalStateException("Could not create folder for ${edit.path}")
            parent.createChildData(this, target.fileName.toString())
        }
        val manager = FileDocumentManager.getInstance()
        val document = manager.getDocument(file) ?: throw IllegalStateException("IntelliJ could not open ${edit.path} for editing")
        document.setText(normalize(edit.content))
        manager.saveDocument(document)
    }

    private suspend fun read(path: Path): String? {
        val file = withContext(Dispatchers.IO) { LocalFileSystem.getInstance().refreshAndFindFileByNioFile(path) } ?: return null
        return readAction { if (file.isValid && !file.isDirectory) textOf(file) else null }
    }

    /** Text as the editor sees it (unsaved changes included), always with \n line separators. */
    private fun textOf(file: VirtualFile): String? {
        FileDocumentManager.getInstance().getCachedDocument(file)?.let { return it.text }
        return try { normalize(VfsUtilCore.loadText(file)) } catch (_: Exception) { null }
    }

    private fun normalize(text: String): String = StringUtil.convertLineSeparators(text)

    companion object {
        private val SKIPPED_DIRS = setOf("node_modules", "dist", "build", "out", "target", ".git", ".idea", ".gradle", ".venv", "__pycache__")
        private val CONTEXT_EXTENSIONS = setOf("ts", "tsx", "js", "jsx", "json", "md", "py", "go", "rs", "java", "cs", "kt", "kts")
        private const val MAX_FILE_CHARS = 50_000
        private const val MAX_FILE_BYTES = 200_000L
    }
}

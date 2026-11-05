package dev.pairflow.intellij

import com.intellij.diff.DiffContentFactory
import com.intellij.diff.DiffManager
import com.intellij.diff.chains.SimpleDiffRequestChain
import com.intellij.diff.requests.SimpleDiffRequest
import com.intellij.openapi.fileTypes.FileTypeManager
import com.intellij.openapi.project.Project
import dev.pairflow.core.PreparedEdit

/** Shows proposed edits in IntelliJ's native diff viewer (the VS Code version uses `vscode.diff`). */
object DiffPresenter {
    fun show(project: Project, edits: List<PreparedEdit>, selected: Int) {
        if (edits.isEmpty() || project.isDisposed) return
        val factory = DiffContentFactory.getInstance()
        val requests = edits.mapIndexed { index, edit ->
            val type = FileTypeManager.getInstance().getFileTypeByFileName(edit.path)
            SimpleDiffRequest(
                "Pair Flow ${index + 1}/${edits.size} — ${edit.path}",
                factory.create(project, edit.currentContent, type),
                factory.create(project, edit.content, type),
                if (edit.currentContent.isEmpty()) "New file" else "Current",
                "Proposed",
            )
        }
        val chain = SimpleDiffRequestChain(requests)
        chain.index = selected.coerceIn(0, requests.size - 1)
        DiffManager.getInstance().showDiff(project, chain, com.intellij.diff.DiffDialogHints.DEFAULT)
    }
}

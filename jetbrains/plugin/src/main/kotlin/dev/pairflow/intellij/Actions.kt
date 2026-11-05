package dev.pairflow.intellij

import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.components.service
import com.intellij.openapi.project.DumbAwareAction
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.Messages
import com.intellij.openapi.wm.ToolWindowManager

class StartSessionAction : DumbAwareAction() {
    override fun getActionUpdateThread() = ActionUpdateThread.BGT
    override fun update(event: AnActionEvent) { event.presentation.isEnabled = event.project != null }
    override fun actionPerformed(event: AnActionEvent) {
        val project = event.project ?: return
        val window = ToolWindowManager.getInstance(project).getToolWindow(TOOL_WINDOW_ID) ?: return
        window.show { project.service<PairFlowProjectService>().panel?.startSession() }
    }
}

class SetApiKeyAction : AnAction() {
    override fun getActionUpdateThread() = ActionUpdateThread.BGT
    override fun actionPerformed(event: AnActionEvent) { promptForApiKey(event.project) }
}

/** Asks for the API key of the selected provider. Must run on the EDT. Returns true when a key was saved. */
fun promptForApiKey(project: Project?): Boolean {
    val provider = PairFlowSettings.getInstance().provider
    if (!provider.needsApiKey) {
        Messages.showInfoMessage(project, "Ollama runs locally and does not require an API key.", "Pair Flow")
        return false
    }
    val key = Messages.showPasswordDialog(project, "${provider.label} API key (stored in the IDE password safe):", "Pair Flow ${provider.label} API Key", null)
    if (key.isNullOrBlank()) return false
    ApiKeys.set(provider, key)
    return true
}

const val TOOL_WINDOW_ID = "Pair Flow"

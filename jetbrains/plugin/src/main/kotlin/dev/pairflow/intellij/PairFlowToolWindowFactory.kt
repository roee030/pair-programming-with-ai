package dev.pairflow.intellij

import com.intellij.openapi.components.service
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowFactory
import com.intellij.ui.components.JBLabel
import com.intellij.ui.content.ContentFactory
import com.intellij.ui.jcef.JBCefApp
import javax.swing.SwingConstants

class PairFlowToolWindowFactory : ToolWindowFactory, DumbAware {
    override fun createToolWindowContent(project: Project, toolWindow: ToolWindow) {
        val factory = ContentFactory.getInstance()
        if (!JBCefApp.isSupported()) {
            val label = JBLabel("Pair Flow needs JCEF, which is not available in this IDE runtime.", SwingConstants.CENTER)
            toolWindow.contentManager.addContent(factory.createContent(label, "", false))
            return
        }
        val service = project.service<PairFlowProjectService>()
        val panel = PairFlowPanel(project, service.scope)
        service.panel = panel
        Disposer.register(toolWindow.disposable, panel)
        Disposer.register(panel) { if (service.panel === panel) service.panel = null }
        toolWindow.contentManager.addContent(factory.createContent(panel.component, "", false))
    }
}

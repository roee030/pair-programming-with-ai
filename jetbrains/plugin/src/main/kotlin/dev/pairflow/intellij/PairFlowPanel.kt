package dev.pairflow.intellij

import com.intellij.notification.NotificationGroupManager
import com.intellij.notification.NotificationType
import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.EDT
import com.intellij.openapi.application.PathManager
import com.intellij.openapi.editor.colors.EditorColorsManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.Messages
import com.intellij.openapi.util.Disposer
import com.intellij.ui.JBColor
import com.intellij.ui.jcef.JBCefBrowser
import com.intellij.ui.jcef.JBCefBrowserBase
import com.intellij.ui.jcef.JBCefJSQuery
import com.intellij.util.ui.UIUtil
import dev.pairflow.core.Chunk
import dev.pairflow.core.DirectorySessionFileStore
import dev.pairflow.core.HistoryEntry
import dev.pairflow.core.PairFlowJson
import dev.pairflow.core.PairOrchestrator
import dev.pairflow.core.PanelMessage
import dev.pairflow.core.Phase
import dev.pairflow.core.PreparedEdit
import dev.pairflow.core.ProviderClient
import dev.pairflow.core.ProviderOptions
import dev.pairflow.core.SessionRepository
import dev.pairflow.core.SessionState
import dev.pairflow.core.SessionSummary
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.awt.Color
import java.nio.file.Path
import javax.swing.JComponent
import javax.swing.UIManager

/**
 * The Pair Flow tool window: a JCEF browser that renders the exact same panel UI as the
 * VS Code webview (renderBody + main.js + main.css), driven by the Kotlin port of the core.
 * Counterpart of src/ui/PairFlowPanel.ts.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class PairFlowPanel(private val project: Project, private val scope: CoroutineScope) : Disposable {
    private val browser = JBCefBrowser.createBuilder().build()
    private val query = JBCefJSQuery.create(browser as JBCefBrowserBase)

    /** Every orchestrator call runs here, one at a time, like the single-threaded VS Code extension host. */
    private val serial = Dispatchers.Default.limitedParallelism(1)

    private val repository = SessionRepository(DirectorySessionFileStore(Path.of(PathManager.getSystemPath(), "pair-flow", project.locationHash)))
    private var orchestrator: PairOrchestrator? = null
    private var state: SessionState = SessionState()
    private var selectedFile = 0
    private var lastChunk: Chunk? = null
    private var restored = false

    @Volatile private var pageReady = false

    val component: JComponent get() = browser.component

    init {
        Disposer.register(this, browser)
        Disposer.register(this, query)
        query.addHandler { raw ->
            PanelMessage.parse(raw)?.let { message -> scope.launch(serial) { handle(message) } }
            null
        }
        browser.loadHTML(hostHtml())
    }

    /** Called by "Pair Flow: Start Session". */
    fun startSession() { scope.launch(serial) { ensureSession() } }

    private suspend fun handle(message: PanelMessage) {
        try {
            dispatch(message)
        } catch (error: Throwable) {
            if (error is kotlinx.coroutines.CancellationException) throw error
            notify(error.message ?: error.toString(), NotificationType.ERROR)
        }
    }

    private suspend fun dispatch(message: PanelMessage) {
        if (message is PanelMessage.Ready) {
            pageReady = true
            ensureRestored()
            draw()
            return
        }
        var flow = orchestrator
        when (message) {
            is PanelMessage.OpenFile -> { selectFile(message.index, 0); return }
            is PanelMessage.Simple -> when (message.type) {
                "previousFile" -> { selectFile(selectedFile, -1); return }
                "nextFile" -> { selectFile(selectedFile, 1); return }
            }
            else -> Unit
        }
        if (message is PanelMessage.SubmitGoal && flow == null) flow = ensureSession()
        if (flow == null) return
        when (message) {
            is PanelMessage.SubmitGoal -> flow.submitGoal(message.goal)
            is PanelMessage.SendMessage -> flow.rejectChunk(message.message)
            is PanelMessage.Simple -> when (message.type) {
                "stop" -> flow.stop()
                "approvePlan" -> flow.approvePlan()
                "approveChunk" -> flow.approveChunk()
                "rejectChunk" -> flow.rejectChunk()
                "retry" -> flow.retry()
                "resume" -> flow.resume()
                "cancelSession" -> flow.cancel()
                "reset" -> startNewStory(flow)
            }
            else -> Unit
        }
    }

    private suspend fun ensureSession(): PairOrchestrator? {
        ensureRestored()
        orchestrator?.let { return it }
        return createOrchestrator(initial = null, promptForKey = true)
    }

    private suspend fun ensureRestored() {
        if (restored) return
        restored = true
        val session = withContext(Dispatchers.IO) { repository.loadActive() } ?: return
        if (orchestrator != null) return
        val flow = createOrchestrator(session, promptForKey = false) ?: return
        flow.restorePrepared()
    }

    private suspend fun createOrchestrator(initial: dev.pairflow.core.PersistedSession?, promptForKey: Boolean): PairOrchestrator? {
        val basePath = project.basePath
        if (basePath == null) { notify("Open a project before starting Pair Flow.", NotificationType.ERROR); return null }
        val settings = PairFlowSettings.getInstance()
        val provider = settings.provider
        var apiKey = withContext(Dispatchers.IO) { ApiKeys.get(provider) }
        if (provider.needsApiKey && apiKey.isBlank() && promptForKey) {
            val saved = withContext(Dispatchers.EDT) { promptForApiKey(project) }
            if (!saved) return null
            apiKey = withContext(Dispatchers.IO) { ApiKeys.get(provider) }
        }
        val data = settings.state
        val client = ProviderClient(ProviderOptions(provider, apiKey, data.model, data.baseUrl, settings.timeoutSeconds * 1000L))
        val workspace = IntellijWorkspace(project, Path.of(basePath), settings.maxContextFiles)
        val flow = PairOrchestrator(client, workspace, { render(it) }, initial = initial, persist = { repository.save(it) })
        orchestrator = flow
        render(flow.current)
        return flow
    }

    private suspend fun startNewStory(flow: PairOrchestrator) {
        val active = flow.current.phase !in setOf(Phase.IDLE, Phase.COMPLETED, Phase.CANCELED)
        if (active) {
            val confirmed = withContext(Dispatchers.EDT) {
                Messages.showOkCancelDialog(project, "Cancel the current Pair Flow session and start a new story?", "Pair Flow", "Cancel Session", "Keep Working", Messages.getWarningIcon()) == Messages.OK
            }
            if (!confirmed) return
            flow.cancel()
        }
        orchestrator = null
        state = SessionState()
        selectedFile = 0
        lastChunk = null
        draw()
    }

    /** Orchestrator render callback; always invoked on [serial]. */
    private fun render(next: SessionState) {
        state = next
        val chunk = next.chunk
        if (chunk != null && chunk != lastChunk) {
            lastChunk = chunk
            selectedFile = 0
            draw()
            openSelected()
            return
        }
        if (chunk == null) lastChunk = null
        draw()
    }

    private fun selectFile(start: Int, delta: Int) {
        val count = orchestrator?.getPrepared()?.size ?: 0
        selectedFile = PanelMessage.moveFileSelection(start, delta, count)
        execute("window.postMessage({ type: 'fileSelection', index: $selectedFile, count: $count }, '*');")
        openSelected()
    }

    private fun openSelected() {
        val prepared: List<PreparedEdit> = orchestrator?.getPrepared() ?: return
        if (prepared.isEmpty()) return
        val index = selectedFile
        ApplicationManager.getApplication().invokeLater({ DiffPresenter.show(project, prepared, index) }, project.disposed)
    }

    private fun draw() {
        val history: List<HistoryEntry> = orchestrator?.getHistory() ?: emptyList()
        val sessions: List<SessionSummary> = repository.list()
        val payload = buildJsonObject {
            put("state", PairFlowJson.encodeToJsonElement(SessionState.serializer(), state))
            put("selectedFile", selectedFile)
            put("history", PairFlowJson.encodeToJsonElement(ListSerializer(HistoryEntry.serializer()), history))
            put("sessions", PairFlowJson.encodeToJsonElement(ListSerializer(SessionSummary.serializer()), sessions))
            put("timeoutSeconds", PairFlowSettings.getInstance().timeoutSeconds)
        }.toString()
        val script = "window.__pairFlowRender(${JsonPrimitive(payload)});"
        // Before the page reports ready, the ready handler draws the latest state.
        if (pageReady) execute(script)
    }

    private fun execute(script: String) {
        val cef = browser.cefBrowser
        cef.executeJavaScript(script, cef.url, 0)
    }

    private fun notify(message: String, type: NotificationType) {
        NotificationGroupManager.getInstance().getNotificationGroup("Pair Flow").createNotification(message, type).notify(project)
    }

    private fun hostHtml(): String {
        val css = resource("main.css")
        val ui = resource("pair-flow-ui.js")
        val main = resource("main.js")
        val send = query.inject("payload")
        return """<!doctype html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width">
<style>${themeCss()}</style>
<style>$css</style>
</head><body>
<script>
window.acquireVsCodeApi = function () {
  return { postMessage: function (message) { var payload = JSON.stringify(message); $send } };
};
window.__pairFlowRender = function (json) {
  var data = JSON.parse(json);
  document.body.innerHTML = window.PairFlowUI.renderBody(data.state, data.selectedFile, data.history, data.sessions, data.timeoutSeconds);
  var focus = document.querySelector('[autofocus]');
  if (focus) focus.focus();
  if (window.pairFlowAfterRender) window.pairFlowAfterRender();
};
</script>
<script>${inline(ui)}</script>
<script>${inline(main)}</script>
<script>acquireVsCodeApi().postMessage({ type: 'ready' });</script>
</body></html>"""
    }

    /** Maps the VS Code theme variables main.css relies on to the current IntelliJ theme. */
    private fun themeCss(): String {
        fun hex(color: Color) = "#%02x%02x%02x".format(color.red, color.green, color.blue)
        fun ui(key: String, fallback: Color): String = hex(UIManager.getColor(key) ?: fallback)
        val background = UIUtil.getPanelBackground()
        val foreground = UIUtil.getLabelForeground()
        val accent = JBColor(0x3574F0, 0x3574F0)
        val font = UIUtil.getLabelFont()
        val editorFont = EditorColorsManager.getInstance().globalScheme.editorFontName
        val vars = mapOf(
            "--vscode-foreground" to hex(foreground),
            "--vscode-sideBar-background" to hex(background),
            "--vscode-descriptionForeground" to hex(UIUtil.getContextHelpForeground()),
            "--vscode-list-hoverBackground" to ui("List.hoverBackground", UIUtil.getListSelectionBackground(false)),
            "--vscode-input-background" to hex(UIUtil.getTextFieldBackground()),
            "--vscode-input-foreground" to hex(UIUtil.getTextFieldForeground()),
            "--vscode-focusBorder" to ui("Component.focusColor", accent),
            "--vscode-button-background" to ui("Button.default.startBackground", accent),
            "--vscode-button-hoverBackground" to ui("Button.default.endBackground", accent),
            "--vscode-button-foreground" to ui("Button.default.foreground", Color.WHITE),
            "--vscode-button-secondaryBackground" to ui("Button.startBackground", background),
            "--vscode-button-secondaryForeground" to ui("Button.foreground", foreground),
            "--vscode-font-family" to "'${font.family}', system-ui, sans-serif",
            "--vscode-editor-font-family" to "'$editorFont', ui-monospace, monospace",
        )
        return ":root { ${vars.entries.joinToString(" ") { "${it.key}: ${it.value};" }} font-size: ${font.size}px; } body { background: var(--vscode-sideBar-background); }"
    }

    private fun resource(name: String): String =
        javaClass.getResourceAsStream("/webview/$name")?.use { it.readBytes().toString(Charsets.UTF_8) }
            ?: throw IllegalStateException("Missing bundled UI file webview/$name. Run `npm ci` at the repository root before building.")

    private fun inline(script: String) = script.replace("</script", "<\\/script")

    override fun dispose() {
        orchestrator?.let { flow -> if (flow.current.phase.isRunning) scope.launch(serial) { flow.stop() } }
    }
}

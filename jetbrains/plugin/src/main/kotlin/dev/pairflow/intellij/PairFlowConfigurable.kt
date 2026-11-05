package dev.pairflow.intellij

import com.intellij.openapi.options.Configurable
import com.intellij.openapi.ui.ComboBox
import com.intellij.ui.components.JBPasswordField
import com.intellij.ui.components.JBTextField
import com.intellij.util.ui.FormBuilder
import dev.pairflow.core.Provider
import javax.swing.JComponent
import javax.swing.JPanel
import javax.swing.JSpinner
import javax.swing.SpinnerNumberModel

/** Settings | Tools | Pair Flow. */
class PairFlowConfigurable : Configurable {
    private val provider = ComboBox(Provider.entries.toTypedArray())
    private val model = JBTextField()
    private val baseUrl = JBTextField()
    private val apiKey = JBPasswordField()
    private val timeout = JSpinner(SpinnerNumberModel(120, 30, 600, 10))
    private val maxFiles = JSpinner(SpinnerNumberModel(12, 1, 30, 1))

    override fun getDisplayName(): String = "Pair Flow"

    override fun createComponent(): JComponent {
        provider.renderer = com.intellij.ui.SimpleListCellRenderer.create("") { it.label }
        provider.addActionListener { updateHints() }
        apiKey.emptyText.text = "Stored in the IDE password safe. Leave empty to keep the saved key."
        updateHints()
        return FormBuilder.createFormBuilder()
            .addLabeledComponent("Provider:", provider)
            .addLabeledComponent("API key:", apiKey)
            .addLabeledComponent("Model:", model)
            .addLabeledComponent("Base URL:", baseUrl)
            .addLabeledComponent("Request timeout (seconds):", timeout)
            .addLabeledComponent("Max context files:", maxFiles)
            .addComponentFillVertically(JPanel(), 0)
            .panel
    }

    private fun updateHints() {
        val selected = provider.selectedItem as? Provider ?: Provider.OPENAI
        model.emptyText.text = selected.defaultModel
        baseUrl.emptyText.text = selected.defaultBaseUrl
        apiKey.isEnabled = selected.needsApiKey
    }

    override fun isModified(): Boolean {
        val data = PairFlowSettings.getInstance().state
        return (provider.selectedItem as Provider).id != data.provider || model.text.trim() != data.model || baseUrl.text.trim() != data.baseUrl ||
            timeout.value as Int != data.requestTimeoutSeconds || maxFiles.value as Int != data.maxContextFiles || apiKey.password.isNotEmpty()
    }

    override fun apply() {
        val data = PairFlowSettings.getInstance().state
        val selected = provider.selectedItem as Provider
        data.provider = selected.id
        data.model = model.text.trim()
        data.baseUrl = baseUrl.text.trim()
        data.requestTimeoutSeconds = timeout.value as Int
        data.maxContextFiles = maxFiles.value as Int
        val key = String(apiKey.password)
        if (key.isNotBlank()) ApiKeys.set(selected, key)
        apiKey.text = ""
    }

    override fun reset() {
        val settings = PairFlowSettings.getInstance()
        val data = settings.state
        provider.selectedItem = settings.provider
        model.text = data.model
        baseUrl.text = data.baseUrl
        timeout.value = settings.timeoutSeconds
        maxFiles.value = settings.maxContextFiles
        apiKey.text = ""
        updateHints()
    }
}

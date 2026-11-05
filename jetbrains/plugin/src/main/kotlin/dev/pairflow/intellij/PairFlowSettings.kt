package dev.pairflow.intellij

import com.intellij.credentialStore.CredentialAttributes
import com.intellij.credentialStore.generateServiceName
import com.intellij.ide.passwordSafe.PasswordSafe
import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
import com.intellij.openapi.components.service
import dev.pairflow.core.Provider

/** IDE-level settings; the JetBrains counterpart of the `pairFlow.*` VS Code settings. */
@Service(Service.Level.APP)
@State(name = "PairFlowSettings", storages = [Storage("pairFlow.xml")])
class PairFlowSettings : PersistentStateComponent<PairFlowSettings.Data> {
    class Data {
        var provider: String = Provider.OPENAI.id
        var model: String = ""
        var baseUrl: String = ""
        var requestTimeoutSeconds: Int = 120
        var maxContextFiles: Int = 12
    }

    private var data = Data()

    override fun getState(): Data = data
    override fun loadState(state: Data) { data = state }

    val provider: Provider get() = Provider.fromId(data.provider)
    val timeoutSeconds: Int get() = data.requestTimeoutSeconds.coerceIn(30, 600)
    val maxContextFiles: Int get() = data.maxContextFiles.coerceIn(1, 30)

    companion object {
        fun getInstance(): PairFlowSettings = service()
    }
}

/** API keys live in the IDE password safe (OS keychain), one per provider. */
object ApiKeys {
    private fun attributes(provider: Provider) = CredentialAttributes(generateServiceName("Pair Flow", "apiKey.${provider.id}"))

    fun get(provider: Provider): String = PasswordSafe.instance.getPassword(attributes(provider)).orEmpty()

    fun set(provider: Provider, key: String?) {
        PasswordSafe.instance.setPassword(attributes(provider), key?.trim()?.takeIf { it.isNotEmpty() })
    }
}

package dev.pairflow.core

/** What the orchestrator needs from the IDE. The IntelliJ implementation lives in the plugin module. */
interface Workspace {
    suspend fun context(): String
    suspend fun prepare(edits: List<ProposedEdit>): List<PreparedEdit>
    suspend fun apply(prepared: List<PreparedEdit>)
}

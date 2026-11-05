package dev.pairflow.core

import kotlinx.serialization.builtins.ListSerializer
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.StandardCopyOption

/** Storage seam so the repository can be tested without the IDE. */
interface SessionFileStore {
    fun read(name: String): String?
    fun write(name: String, value: String)
    fun delete(name: String)
}

/** Stores session files in a directory (the plugin uses the IDE system directory, per project). */
class DirectorySessionFileStore(private val directory: Path) : SessionFileStore {
    override fun read(name: String): String? = directory.resolve(name).takeIf { Files.isRegularFile(it) }?.let { Files.readString(it) }
    override fun write(name: String, value: String) {
        Files.createDirectories(directory)
        val target = directory.resolve(name)
        val temp = Files.createTempFile(directory, "$name.", ".tmp")
        Files.writeString(temp, value)
        Files.move(temp, target, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE)
    }
    override fun delete(name: String) { Files.deleteIfExists(directory.resolve(name)) }
}

/** Port of src/session/sessionRepository.ts. The index is kept in `sessions.json` inside the same store. */
class SessionRepository(private val files: SessionFileStore) {
    private var summaries: List<SessionSummary> = loadIndex()

    fun list(): List<SessionSummary> = summaries

    fun loadActive(): PersistedSession? {
        val summary = summaries.firstOrNull { it.status == SessionStatus.ACTIVE || it.status == SessionStatus.PAUSED } ?: return null
        return try {
            val raw = files.read(fileName(summary.id)) ?: return null
            val session = parseSession(raw) ?: return null
            if (session.status == SessionStatus.ACTIVE && session.state.phase.isRunning) {
                val restored = session.copy(status = SessionStatus.PAUSED, state = session.state.copy(phase = Phase.PAUSED, resumePhase = session.state.phase))
                save(restored)
                restored
            } else session
        } catch (_: Exception) { null }
    }

    fun save(session: PersistedSession) {
        if (session.status == SessionStatus.ACTIVE || session.status == SessionStatus.PAUSED) {
            val superseded = summaries.filter { it.id != session.id && (it.status == SessionStatus.ACTIVE || it.status == SessionStatus.PAUSED) }
            superseded.forEach { files.delete(fileName(it.id)) }
            val supersededIds = superseded.map { it.id }.toSet()
            summaries = summaries.map { if (it.id in supersededIds) it.copy(status = SessionStatus.CANCELED) else it }
            files.write(fileName(session.id), PairFlowJson.encodeToString(PersistedSession.serializer(), session))
        } else {
            files.delete(fileName(session.id))
        }
        val summary = SessionSummary(session.id, session.title, session.status, session.updatedAt)
        summaries = (listOf(summary) + summaries.filter { it.id != session.id }).sortedByDescending { it.updatedAt }.take(LIMIT)
        writeIndex()
    }

    fun delete(id: String) {
        files.delete(fileName(id))
        summaries = summaries.filter { it.id != id }
        writeIndex()
    }

    private fun loadIndex(): List<SessionSummary> = try {
        files.read(INDEX_FILE)?.let { PairFlowJson.decodeFromString(ListSerializer(SessionSummary.serializer()), it).take(LIMIT) } ?: emptyList()
    } catch (_: Exception) { emptyList() }

    private fun writeIndex() = files.write(INDEX_FILE, PairFlowJson.encodeToString(ListSerializer(SessionSummary.serializer()), summaries))

    private fun parseSession(raw: String): PersistedSession? = try {
        PairFlowJson.decodeFromString(PersistedSession.serializer(), raw).takeIf { it.version == 1 }
    } catch (_: Exception) { null }

    private fun fileName(id: String) = "session-${id.replace(Regex("[^A-Za-z0-9_-]"), "_")}.json"

    companion object {
        private const val INDEX_FILE = "sessions.json"
        private const val LIMIT = 20
    }
}

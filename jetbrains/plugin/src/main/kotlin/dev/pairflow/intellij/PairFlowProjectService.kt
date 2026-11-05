package dev.pairflow.intellij

import com.intellij.openapi.components.Service
import com.intellij.openapi.project.Project
import kotlinx.coroutines.CoroutineScope

/** Per-project owner of the panel and its coroutine scope (cancelled when the project closes). */
@Service(Service.Level.PROJECT)
class PairFlowProjectService(val project: Project, val scope: CoroutineScope) {
    @Volatile var panel: PairFlowPanel? = null
}

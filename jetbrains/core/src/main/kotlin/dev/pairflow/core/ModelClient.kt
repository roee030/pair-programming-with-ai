package dev.pairflow.core

interface ModelClient {
    suspend fun requestPlan(goal: String, context: String): Plan
    suspend fun requestChunk(goal: String, plan: Plan, stepIndex: Int, context: String, feedback: String? = null): Chunk
    fun cancel() {}
}

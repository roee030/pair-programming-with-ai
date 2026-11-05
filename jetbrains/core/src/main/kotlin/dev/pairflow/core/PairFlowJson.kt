package dev.pairflow.core

import kotlinx.serialization.json.Json

/** Shared JSON settings: field names match the TypeScript types so the webview renderer can be reused as-is. */
val PairFlowJson: Json = Json {
    ignoreUnknownKeys = true
    explicitNulls = false
    encodeDefaults = true
}

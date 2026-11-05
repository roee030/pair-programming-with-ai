// Browser bundle of the panel renderer, used by the JetBrains plugin so both IDEs render the same UI.
// Built by scripts/build-jetbrains-ui.mjs into the JetBrains plugin resources.
import { renderBody } from './webviewHtml';

(globalThis as unknown as { PairFlowUI: { renderBody: typeof renderBody } }).PairFlowUI = { renderBody };

/* Script-tag build of the Sarvam browser SDK.
   The journey has no bundler, so the one npm dependency the assistant needs is
   bundled here into a plain global and served from ./vendor/ — which is also what
   keeps `script-src 'self'` intact. Rebuild with `npm run build:vendor`. */
import { ConversationAgent, InteractionType } from "sarvam-conv-ai-sdk/browser";
window.SarvamConvAI = { ConversationAgent, InteractionType };

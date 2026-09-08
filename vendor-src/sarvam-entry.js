/* Script-tag build of the Sarvam browser SDK.
   The journey has no bundler, so the one npm dependency the assistant needs is
   bundled here into a plain global and served from ./vendor/ — which is also what
   keeps `script-src 'self'` intact. Rebuild with `npm run build:vendor`. */
import { ConversationAgent, InteractionType, BrowserAudioInterface } from "sarvam-conv-ai-sdk/browser";
/* BrowserAudioInterface is not optional for a CALL: without it the SDK refuses to start
   with "audioInterface is required for CALL interactions", which surfaces to the
   customer as the help button failing for no visible reason. */
window.SarvamConvAI = { ConversationAgent, InteractionType, BrowserAudioInterface };

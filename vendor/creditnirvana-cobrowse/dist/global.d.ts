/**
 * Script-tag build. Exposes window.CoBrowse and self-initialises from data attributes, so a
 * server-rendered application needs no bundler and no JavaScript of its own:
 *
 *   <script src=".../cobrowse.global.js" data-tenant="fingpay"
 *           data-token-url="/api/cobrowse/token"
 *           data-mask-selectors="[data-pii],.vpa" defer></script>
 */
import { CoBrowse } from "./index.js";
declare global {
    interface Window {
        CoBrowse: typeof CoBrowse & {
            instance?: unknown;
        };
    }
}

/**
 * @creditnirvana/cobrowse
 *
 * Guided assistance for web journeys. The assistant sees the STRUCTURE of the page, never its
 * contents, and highlights the next step for the customer.
 *
 * Design rule that outranks every other consideration in this file: the SDK must never break
 * the host application. Every public entry point is wrapped so that an internal failure
 * disables assistance and leaves the page untouched.
 */
import type { CoBrowseConfig, CoBrowseHandle, PrivacyRules, UiOptions } from "./types.js";
import { Overlay } from "./overlay.js";
export * from "./types.js";
import { VERSION } from "./version.js";
export { VERSION };
/** Read a session reference from the URL: the link the assistant sent by SMS or email. */
export declare function sessionRefFromUrl(param?: string, href?: string): string | null;
export declare const CoBrowse: {
    /**
     * What the page model currently sees, for the integrator to inspect. Runs a scan with
     * default privacy rules and starts nothing — no session, no network, no consent prompt.
     * Useful for checking that your controls are actually visible to the assistant before
     * you author a journey against them.
     */
    __scanForTest(): Array<{
        label: string;
        role: string;
        filled?: boolean;
    }>;
    /**
     * The WHOLE model the assistant would receive, optionally under a given set of privacy
     * rules. Use this to check what your own configuration actually does — including which
     * parts of your page the SDK has to report as blind, such as a payment iframe.
     * Starts nothing: no session, no network, no consent prompt.
     */
    __scanModelForTest(rules?: PrivacyRules): import("./page-model.js").PageModel;
    /**
     * A standalone overlay, for checking how highlights render on YOUR page without starting a
     * session. Draws only; no network, no consent, no data leaves the browser.
     */
    __overlayForTest(opts?: UiOptions): Overlay;
    /**
     * Initialise the SDK. Resolves to a handle; never rejects and never throws, so a failure
     * here cannot take your application down with it.
     *
     * If the customer arrived from an assistant-sent link, assistance is offered automatically:
     * the session reference is read from the URL and consent is requested straight away.
     */
    init(config: CoBrowseConfig): Promise<CoBrowseHandle>;
    sessionRefFromUrl: typeof sessionRefFromUrl;
    VERSION: string;
};
export default CoBrowse;

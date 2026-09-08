import type { PrivacyRules } from "./types.js";
export interface ModelElement {
    /** Stable-per-scan index used to address the element in a highlight request. */
    eid: string;
    label: string;
    role: string;
    tag: string;
    /** Present for inputs. TRUE means "has user content", never what that content is. */
    filled?: boolean;
    sensitive?: boolean;
    disabled?: boolean;
    /** The form will not submit without this one. Lets the assistant say what is missing. */
    required?: boolean;
    /**
     * FALSE when the page is currently rejecting this field. Present only when a field is
     * actually invalid, so the common case costs nothing on the wire.
     */
    valid?: boolean;
    /**
     * The rejection text the customer can see — "Enter a valid IFSC". It is the page's own
     * words, not the customer's, and it goes through the redactor like every other string.
     * Without it the assistant knows something is wrong but not what, which on a voice call
     * is barely better than knowing nothing.
     */
    error?: string;
    /** The field the customer is on right now. */
    focused?: boolean;
    /**
     * What KIND of thing this field wants, and in what shape.
     *
     * A label tells the assistant a field exists; it does not say that a card number is
     * sixteen digits, that this OTP box takes six, or that an IFSC is four letters, a
     * zero, then six characters. A chat agent can afford to be vague and correct itself.
     * A voice agent has to say the right thing first time — "enter your 16-digit card
     * number" — or the customer types something wrong and has to start over.
     *
     * Derived from what the page already declares: autocomplete, inputmode, maxlength,
     * pattern, type. `data-cobrowse-semantic` overrides it where the markup is silent.
     */
    semantic?: {
        kind: string;
        expects?: string;
    };
    /**
     * The customer is entering this value RIGHT NOW — a keystroke, paste or IME event
     * landed on it within the settle window.
     *
     * The single fact that decides whether guidance may move on, and the one nothing in
     * the DOM reports. `filled` is true after the FIRST character, so an assistant that
     * advances on it advances while someone is four digits into a ten-digit number — and
     * the highlight leaves the box they are still typing in.
     */
    typing?: boolean;
    /**
     * Is the entry FINISHED? Three-valued, and deliberately distinct from `valid`:
     *  • `true`  — done: the declared shape is satisfied, the box is full, or they have
     *              left it. It may still be WRONG; `valid` says that.
     *  • `false` — there is content, but it is not a finished entry yet.
     *  • absent  — nothing to judge.
     *
     * Why both: a page calls a field invalid from the first keystroke (every prefix of a
     * correct answer fails a pattern), so `valid` alone cannot tell "unfinished" from
     * "wrong" — and an assistant that confuses them interrupts people mid-entry.
     */
    complete?: boolean;
    /** Why `complete` reads as it does: "matches_format" | "typing" | "blurred" | … */
    completeReason?: string;
    /** Characters a finished entry has, when the shape is known (OTP 6, PAN 10). */
    expectedChars?: number;
    /**
     * A consent control — Terms & Conditions, a declaration, an "I Agree".
     *
     * The one control a form will not submit without, and the one that is invisible to a
     * label-driven assistant: its own label is empty, and the wording lives in a long
     * paragraph beside it. Marked here so the guidance side can surface it before a
     * submit that needs it, without any per-site authoring.
     */
    consent?: boolean;
    inView: boolean;
    rect: {
        x: number;
        y: number;
        w: number;
        h: number;
    };
}
/**
 * The screen the page is actually being rendered on.
 *
 * The same journey is a different journey on a phone: controls stack, a table becomes
 * cards, and "click the button on the right" is nonsense. `type` is the LAYOUT the site
 * chose (viewport width), not the hardware — a narrow desktop window renders the mobile
 * layout and has to be guided as one. `pointer` is the input modality, which is what
 * decides whether the assistant says "tap" or "click".
 */
export interface DeviceContext {
    type: "mobile" | "tablet" | "desktop";
    pointer: "coarse" | "fine";
    browser: string;
    os: string;
    vw: number;
    vh: number;
    dpr: number;
    orientation: "portrait" | "landscape";
    touch?: boolean;
}
/**
 * A region of the page the SDK is structurally unable to describe.
 *
 * Almost always a cross-origin payment iframe — Razorpay, PayU, Billdesk — which is how
 * essentially every Indian checkout takes card details. `querySelectorAll` cannot cross
 * an origin boundary, and no amount of SDK code changes that.
 *
 * What matters is that the assistant is TOLD. Silence here is the worst outcome: the
 * page model simply looks like a page with nothing on it, so the assistant cheerfully
 * says "enter your card number" and the customer says "where?" — during the one step
 * where they most needed help. Reported as a blind region, the assistant can instead say
 * "I can't see inside the payment window, tell me what you see".
 */
export interface BlindRegion {
    kind: "cross-origin-frame";
    /** Origin of the frame, when the browser will tell us. Never a full URL. */
    origin?: string;
    /** Whether it is on screen right now — a hidden prefetch frame is not the story. */
    inView: boolean;
    rect: {
        x: number;
        y: number;
        w: number;
        h: number;
    };
}
export interface PageModel {
    url: string;
    title: string;
    elements: ModelElement[];
    /** Present only when something on the page cannot be described. See BlindRegion. */
    blindRegions?: BlindRegion[];
    /** The screen this is being rendered on. See DeviceContext. */
    device?: DeviceContext;
    /** Which field currently has focus, by label. Helps the assistant say "you are on X". */
    activeFieldLabel?: string;
    /**
     * Signature of the visible controls AND their filled/valid state. Distinguishes one screen from
     * the next in a single-URL application, and — critically — changes when a field becomes
     * filled. Keying on labels alone meant typing into a field produced an identical signature,
     * the re-publish was skipped, and the assistant never learned the step was completed.
     * Validity is in for the same reason: a field turning red is a change the assistant has
     * to hear about, or the customer sits looking at an error nobody is helping them fix.
     */
    signature: string;
}
/**
 * How long to wait before the re-scan that can finally report an entry as FINISHED.
 *
 * "Still typing" is a time-based fact, so the scan that sees it settle has to happen
 * after the last keystroke has aged out. Every input-driven rescan fires well inside the
 * window, so without one extra scan at the boundary the only one that ever says "done"
 * is the periodic heartbeat — the customer finishes a field and nothing happens for
 * seconds, which reads as the assistant having stopped working.
 */
export declare const SETTLE_RESCAN_MS: number;
export declare class PageScanner {
    private redactor;
    private maskSelectors;
    private excludeRegions;
    private maskInputTypes;
    private maskSensitiveLabels;
    constructor(rules?: PrivacyRules);
    update(rules?: PrivacyRules): void;
    private matches;
    /** Excluded regions and opted-out subtrees are removed from the model ENTIRELY. */
    private isExcluded;
    private isVisible;
    /**
     * Query that pierces open shadow roots.
     *
     * `document.querySelectorAll` stops at every shadow boundary, so an application built on
     * web components — Shoelace, Ionic, Salesforce Lightning, most modern design systems —
     * is entirely invisible to it. The assistant would report a page with no controls on it.
     */
    private deepQuery;
    /**
     * Accessible name, in the order a screen reader would resolve it. The host can override with
     * data-cobrowse-label. Note what is NOT consulted: the element's value.
     */
    private labelFor;
    private roleFor;
    /** Has the user put something in this field? A boolean, never the content. */
    private isFilled;
    /**
     * Is the page currently rejecting this field, and what is it saying?
     *
     * Three independent signals, because no single one is reliable across frameworks:
     * `aria-invalid` is what accessible component libraries set, `checkValidity()` is what
     * native constraint validation knows, and an `.error`/`.invalid` container is what
     * everything else does. Returns undefined for a field that is fine, so a healthy page
     * adds nothing to the payload.
     */
    private validity;
    /**
     * Clickable elements that the selector above cannot see.
     *
     * React attaches click handlers synthetically, so `<div onClick={...}>` carries no
     * `onclick` attribute, no role and no tabindex — it is invisible to any attribute-based
     * selector. That is not an edge case: card pickers, tiles and list rows are written this
     * way in most React applications, and an assistant that cannot see them cannot guide
     * anyone through them.
     *
     * An explicit `cursor: pointer` is the one signal such elements reliably carry. Two rules
     * keep it from flooding the model: `cursor` inherits, so we take only the OUTERMOST
     * pointer element in a subtree, and we skip anything that contains a real control — there
     * the inner button is the better target.
     */
    private pointerClickables;
    scan(): PageModel;
    /**
     * The label we are permitted to REPORT for an element, applying the same rules as the page
     * model. Returns null when the element must not be described at all. Event emission goes
     * through here so an interaction can never leak what the model itself would have masked.
     */
    reportableLabel(el: HTMLElement): string | null;
    /**
     * What kind of value this field wants, and its shape, in words an assistant can say.
     *
     * Reads only what the page already declares about ITSELF — never anything the customer
     * typed. An explicit `data-cobrowse-semantic` wins, because the integrator knows their
     * own markup better than any heuristic does.
     */
    private semanticFor;
    /**
     * Frames whose contents we cannot read.
     *
     * Reachability is decided by trying, not by comparing URLs: a same-origin frame is
     * readable and needs no report, and the SecurityError a cross-origin one throws is the
     * only honest test. Excluded and hidden frames are skipped — a blind region the
     * customer cannot see is not something the assistant should mention.
     */
    private blindRegions;
    /**
     * The labels of the fields standing between the customer and a successful submit:
     * required-and-empty, or currently invalid.
     *
     * Scoped to one form when we know which; otherwise the whole document, because a
     * JavaScript-validated "form" is frequently not a <form> at all. Masked and excluded
     * fields contribute nothing — reportableLabel is the same gate the events use, so a
     * blocked submit can never name a control the model itself would have hidden.
     */
    blockers(form?: HTMLFormElement): string[];
    /** Resolve a target label to a live element, for highlighting. Mirrors the service's scoring. */
    resolve(target: string): HTMLElement | null;
}

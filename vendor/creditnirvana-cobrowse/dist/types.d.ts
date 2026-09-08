/** Public types for @creditnirvana/cobrowse. Everything a host application can pass or receive. */
/** Built-in redaction pattern names. All are enabled unless `redact` is given explicitly. */
export type RedactPattern = "PAN" | "AADHAAR" | "IFSC" | "OTP" | "CARD";
export interface PrivacyRules {
    /** Elements matching these selectors are reported as present but UNLABELLED. */
    maskSelectors?: string[];
    /** Input types that are never labelled and never fillable. password/OTP are always included. */
    maskInputTypes?: string[];
    /**
     * Destroy the LABEL of automatically-detected sensitive fields (card, OTP, PIN,
     * password), not just their contents. Defaults to FALSE.
     *
     * The default is deliberate. A field's contents are never readable either way; this
     * only decides whether the assistant may know the box is called "Card number". Keeping
     * it is what lets the assistant say "tap the highlighted Card number field" — with it
     * destroyed, guidance on the most confusing part of a payment becomes "tap the
     * highlighted field", which on a phone call is close to useless.
     *
     * Set it to true where a compliance review requires that the assistant cannot know
     * which sensitive fields exist on the page. Expect voice guidance to get vaguer.
     */
    maskSensitiveLabels?: boolean;
    /** Regions removed from the model entirely. The assistant is not told they exist. */
    excludeRegions?: string[];
    /** Built-in patterns to destroy in every emitted string. Defaults to all of them. */
    redact?: RedactPattern[];
    /** Additional caller-supplied patterns, for example your own customer identifiers. */
    redactCustom?: RegExp[];
}
export interface UiOptions {
    /** "builtin" shows our consent dialog; "custom" delegates to onConsentRequired. */
    consent?: "builtin" | "custom";
    /** "builtin" shows the persistent active-session badge; "custom" means YOU must show one. */
    indicator?: "builtin" | "custom";
    /** CSS colour for the highlight ring, to match your brand. */
    highlightColor?: string;
    /** Base z-index for SDK overlays. Raise it if your own overlays sit very high. */
    zIndex?: number;
    /**
     * Play a short tone when a highlight appears. Off by default; turn it on when the
     * assistance is paired with a PHONE CALL, where the customer may have the handset to
     * their ear or the phone on speaker on the desk, and never sees the ring appear.
     * "Click the Pay Now button" — "where?" is the failure this prevents.
     */
    audioCue?: boolean;
    /**
     * Announce what is being highlighted to screen readers, via an ARIA live region.
     * On by default: a customer using a screen reader cannot see a ring at all, so
     * without this the entire product is invisible to them.
     */
    announce?: boolean;
}
export type SessionEndReason = "completed" | "ended_by_user" | "idle" | "disconnected" | "error"
/**
 * The page went away (tab closed, navigated off). Reported to the service but never
 * used as a local end reason: bfcache and back-navigation fire it on pages the customer
 * is still using, so it is a hint that they may have left, not a finished session.
 */
 | "pagehide";
export interface SessionInfo {
    /** Opaque session reference. Quote this when reporting an issue. */
    id: string;
    startedAt: number;
    endedAt?: number;
    reason?: SessionEndReason;
}
export type CoBrowseErrorCode = "token_invalid" | "token_forbidden" | "network_unavailable" | "consent_declined" | "unsupported_browser" | "internal";
export interface CoBrowseError {
    code: CoBrowseErrorCode;
    message: string;
    /** True when the SDK has disabled itself. Your application is unaffected either way. */
    fatal: boolean;
}
export interface CoBrowseConfig {
    /** Your tenant identifier, issued during onboarding. */
    tenant: string;
    /**
     * A session token minted by YOUR backend, or a function returning one. Prefer the function
     * form: the SDK then requests a fresh token only when it actually needs one.
     * Optional when the session arrives by link (see `linkParam`).
     */
    sessionToken?: string | (() => string | Promise<string>);
    /** Data region. Defaults to your tenant's configured region. */
    region?: string;
    /** Service origin. Defaults to the managed endpoint; set this for a self-hosted deployment. */
    endpoint?: string;
    /**
     * Query parameter carrying a session reference when the customer arrives from an emailed or
     * texted link. Default "cb". Set to null to disable link binding entirely.
     */
    linkParam?: string | null;
    privacy?: PrivacyRules;
    ui?: UiOptions;
    /** Provide your own consent UI. Resolve true to proceed. */
    onConsentRequired?: (ctx: {
        tenant: string;
        sessionId: string;
    }) => boolean | Promise<boolean>;
    onSessionStart?: (session: SessionInfo) => void;
    onSessionEnd?: (session: SessionInfo) => void;
    /**
     * The connection dropped but the session is still alive and being retried. Use this to
     * tell the assistant it has lost sight of the page — on a voice call the customer is
     * usually still talking, and "I've lost my view of your screen for a moment" is a far
     * better answer than guidance based on a page model that has stopped updating.
     */
    onSessionDegraded?: (session: SessionInfo) => void;
    /** The connection came back. The page model that follows is fresh. */
    onSessionRecovered?: (session: SessionInfo) => void;
    /** Non-fatal diagnostics. The SDK never throws into your application. */
    onError?: (error: CoBrowseError) => void;
    /** Verbose console logging. Non-production only. */
    debug?: boolean;
}
/**
 * `degraded` is the state that matters on a voice call: the socket dropped but the
 * session is still valid and the SDK is still reconnecting. Mobile data and the cellular
 * voice channel fail independently, so the customer is very often still on the line and
 * talking while the assistant has gone blind. Treating that as "ended" — which is what
 * the SDK used to do — makes the assistant confidently guide a page it can no longer see.
 */
export type CoBrowseStatus = "idle" | "connecting" | "active" | "degraded" | "ended";
export interface CoBrowseHandle {
    /** Request assistance. Triggers consent if not already granted. */
    start(): Promise<void>;
    /** End the session immediately. Safe to call at any time. */
    end(reason?: SessionEndReason): void;
    status(): CoBrowseStatus;
    /** Replace masking rules at runtime, for example on entering a sensitive area. */
    updatePrivacy(rules: PrivacyRules): void;
    /** Current session, when one is active. */
    session(): SessionInfo | null;
    readonly version: string;
}

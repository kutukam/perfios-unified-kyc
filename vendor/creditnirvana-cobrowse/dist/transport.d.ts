/**
 * Inbound frames, as the guidance service actually emits them. Note the nested `annotation`:
 * a highlight and a clear are BOTH t:"annotate", distinguished by annotation.kind.
 */
export type Annotation = {
    kind: "highlightEl";
    label?: string;
    sel?: string;
    highlightId?: string;
}
/**
 * Ring several controls at once. A journey step that is a CHOICE — pick a card, pick a
 * bank — must show the whole set, otherwise highlighting one of six silently steers the
 * customer. The service sends the set; it still decides which, and the agent never does.
 */
 | {
    kind: "highlightMany";
    labels: string[];
    highlightId?: string;
} | {
    kind: "clear";
};
export type Inbound = {
    t: "annotate";
    annotation: Annotation;
} | {
    t: "done";
} | {
    t: "error";
    message: string;
} | {
    t: "pong";
};
export interface TransportEvents {
    onMessage: (m: Inbound) => void;
    onOpen: () => void;
    /** An established connection dropped. Not fatal — a retry is already scheduled. */
    onDrop?: () => void;
    onFail: (why: "network" | "rejected") => void;
}
export declare class Transport {
    private endpoint;
    private sessionId;
    private ev;
    private debug;
    private ws?;
    private attempts;
    private closed;
    private ping;
    /**
     * Whether to present the token as a subprotocol. Starts true and flips permanently to
     * false the first time a handshake fails, because a server that predates subprotocol
     * auth ignores the offer, names no protocol in its 101, and the browser then tears the
     * connection down. A self-hosted deployment can be older than the SDK in front of it,
     * so we degrade to the query string rather than refusing to work.
     */
    private subprotocol;
    constructor(endpoint: string, sessionId: string, ev: TransportEvents, debug?: boolean);
    connect(): void;
    /**
     * Decide whether the failed handshake was a dead session or a dead network, then
     * either give up or resume the normal backoff.
     *
     * A 401/404 is the service saying this token will never work — retrying is pure noise
     * and leaves the customer staring at nothing for half a minute. Anything else,
     * including the probe itself failing, is treated as a network problem: when in doubt
     * we retry, because falsely killing a live session is the worse error.
     */
    private classify;
    send(payload: unknown): void;
    close(): void;
}

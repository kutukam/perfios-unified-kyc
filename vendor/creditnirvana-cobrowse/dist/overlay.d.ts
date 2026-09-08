export interface OverlayOptions {
    highlightColor?: string;
    zIndex?: number;
    audioCue?: boolean;
    announce?: boolean;
}
export declare class Overlay {
    private host?;
    private root?;
    /** One ring per highlighted control; a step may point at several at once. */
    private rings;
    /** The element each ring is following, index-aligned with `rings`. */
    private trackedAll;
    private indicatorEl?;
    private raf;
    private color;
    private z;
    private cue;
    private announces;
    private liveEl?;
    private audio?;
    /** The "scroll this way" pill, shown only while every ring is off the screen. */
    private finder?;
    /** Last reported on-screen state, so the service hears about changes and not about frames. */
    private lastVisible?;
    /** Told when the ring enters or leaves the customer's screen. See onVisibility. */
    private visibilityCb?;
    /** What we last announced, so a re-assert of the same target does not repeat itself. */
    private lastAnnounced;
    constructor(opts?: OverlayOptions);
    private ensure;
    /** Built-in consent dialog. Resolves true when the customer accepts. */
    consent(): Promise<boolean>;
    /** Persistent "assistance is active" badge with a way to end the session. */
    showIndicator(onEnd: () => void): void;
    hideIndicator(): void;
    /**
     * A short, quiet tone. Two hundred milliseconds at 880Hz with an eased tail, because a
     * square-edged beep on a payment page reads as an error sound.
     *
     * Everything here is best-effort: autoplay policy blocks audio until the customer has
     * interacted with the page, older browsers lack the constructor, and neither is worth
     * a broken session — the ring is the primary signal and the tone is the reminder.
     */
    private chime;
    /**
     * Tell assistive technology what is being pointed at.
     *
     * The ring is a purely visual affordance: a customer using a screen reader gets
     * nothing from it, and a customer on a phone call may not be looking at the screen at
     * all. `role="status"` is polite, so it waits for a gap rather than interrupting.
     */
    private announce;
    /** Draw a ring around one element. Convenience wrapper over `highlightAll`. */
    highlight(el: HTMLElement | null): void;
    /**
     * Ring EVERY element in `els`, and nothing else.
     *
     * A step is not always one control. "Pick a card category" and "choose your bank" are
     * choices among five or six tiles, and ringing only the first silently steers the customer
     * toward it — on a regulated journey that is mis-selling by interface. So the overlay
     * carries a SET of rings, and the caller decides whether that set has one member or six.
     *
     * Scroll-into-view targets the first element only: with several rings on screen the
     * customer needs to see the group, and yanking the page to each in turn is worse than
     * leaving it where the first one lands.
     */
    highlightAll(els: HTMLElement[]): void;
    /**
     * Register a callback for "is the ring actually on the customer's screen".
     *
     * `rendered: true` in a highlight ack means "we found the element and drew a ring
     * around it" — which was reported once, at the moment it was drawn, and never revised.
     * On a phone the customer then scrolls, the ring goes off the top of the screen, and
     * the assistant carries on saying "the highlighted box" about something nobody can see.
     * Visibility is a state, not an event, so it has to keep being reported.
     */
    onVisibility(cb: (visible: boolean) => void): void;
    /**
     * The customer's actual window onto the page, in layout-viewport coordinates.
     *
     * On a pinch-zoomed iPad, and on a phone with the soft keyboard up, this is a
     * substantially smaller rectangle than `innerWidth × innerHeight` — and a control that
     * is technically "in the viewport" while sitting behind the keyboard is, to the person
     * holding the phone, not on screen.
     */
    private screenBox;
    /**
     * WHERE DOES `position: fixed` ACTUALLY LAND?
     *
     * Every ring is placed from `getBoundingClientRect()`, which reports layout-viewport
     * coordinates, onto an element that is `position: fixed`. That only lines up while the
     * fixed frame starts at the layout viewport's origin, and it does not always:
     *
     *   - iOS Safari with the keyboard up moves the visual viewport, and a fixed element can
     *     end up measured against that instead;
     *   - any ancestor with a transform, filter, perspective, `will-change` or `contain`
     *     becomes the containing block for fixed descendants, so the frame origin follows
     *     that element — and therefore the scroll position.
     *
     * Either way the ring is drawn a constant distance from the control it is naming. It was
     * reported from an iPad mid-journey: the ring floating in blank space, the field it named
     * a few hundred pixels below it.
     *
     * So don't reason about which case this is — measure it. The host is already a zero-size
     * element pinned at `fixed; top:0; left:0`, and it shares its frame with the rings, so its
     * own rect IS the offset: 0 when the two frames agree, the discrepancy when they do not.
     * Subtracting it fixes both causes at once, and where it reads 0 the arithmetic below is
     * unchanged.
     */
    private fixedOrigin;
    /** Put every ring where its target currently is. Cheap, idempotent, safe to call often. */
    private place;
    /**
     * Show (or hide) the "it is this way" pill.
     *
     * Pinned to the visual viewport's own edge rather than the layout viewport's, so on a
     * zoomed iPad it sits at the edge of what the customer can see instead of somewhere off
     * past it. Tapping it goes to the ring — the one place in this overlay that accepts a
     * click, and it is the customer's own click on our own control, never the page's.
     */
    private showFinder;
    /**
     * Put the session badge in whichever corner is not covering the highlight.
     *
     * Bottom-right is where a form puts its primary action, and top-right is where a phone
     * form puts its first field — so either corner can end up sitting on the very control
     * the customer is being told to look at. Which one is safe depends on where the ring is
     * RIGHT NOW, not on the viewport width, so both candidate boxes are computed and the
     * clashing one is rejected. When both clash the default is kept: there is no third
     * corner, and moving the badge somewhere unexpected every frame would be worse than a
     * partial overlap.
     *
     * Cheap by construction: the ring rects are the ones place() already measured, and the
     * badge is measured once for its size only.
     */
    private positionBadge;
    /** A phone-width layout, where the primary action sits at the bottom of the screen. */
    private narrow;
    private startFollow;
    clearHighlight(): void;
    destroy(): void;
}

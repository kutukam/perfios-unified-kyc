/**
 * Source-side redaction. Every string the SDK is about to emit passes through here FIRST,
 * inside the browser, so a sensitive value can never reach the wire even when it appears
 * inside an otherwise harmless label (a masked account number in a heading, a reference
 * containing a PAN).
 *
 * Length is preserved so the assistant can still reason about the shape of a field, and
 * SHORT numbers are deliberately left intact: amounts are what guidance is usually about.
 */
import type { PrivacyRules } from "./types.js";
export declare class Redactor {
    private patterns;
    private custom;
    constructor(rules?: PrivacyRules);
    update(rules?: PrivacyRules): void;
    /** Redact a single string. Safe on undefined. Never throws. */
    text(s: string | undefined | null): string;
}
/** Input types that can never be labelled or filled, regardless of configuration. */
export declare const ALWAYS_SENSITIVE_TYPES: Set<string>;
/** Is this element one whose value must never be observable or fillable? */
export declare function isSensitiveField(el: Element, maskInputTypes: Set<string>): boolean;

# One SDK Mobile Journey

A complete, responsive Unified KYC frontend built from the supplied One SDK Mobile Journey Figma/PDF screens. It uses plain HTML, CSS, and JavaScript with local images and fonts. No installation, build step, API keys, or external services are required.

## Run

Extract this ZIP, open a terminal in this folder, and run:

```sh
npm start
```

Open **http://localhost:3000**. Node.js 18 or later is sufficient; there are no npm dependencies to install.

Alternatively, use Python:

```sh
python3 -m http.server 3000 --directory dist
```

You can also open `dist/index.html` directly. The local server gives the most consistent font loading across browsers.

## Interactions

- Tap an empty field to insert its prepared value. It remains editable; tapping an already filled field never replaces your changes.
- Tap any empty OTP box to fill all six digits. The prepared code is **603720**. You can type or paste a different code to exercise error and retry states.
- The first tap on Gender chooses Male; subsequent taps let you select another option. Tap the date field to fill it or its calendar icon to choose a date.
- Check “Same as the previously filled Current Address” to copy the current address. Later changes to the current address stay synchronized while this checkbox is selected.
- Both username/password and x-karza-key login lead into the same journey.
- **The camera is real.** The selfie and video-liveness steps open the device camera and microphone, the liveness step records an actual clip, and the review screen plays that clip back with its own audio. A frame is kept from the capture and is what the recording bar and the report's “on Application Form” photograph show. Nothing is uploaded: the clip and the frame live in the browser for the length of the journey and are dropped on “Done”. Where there is no camera — no webcam, a refused permission, an older browser — every one of those screens falls back to the supplied artwork and the journey still runs end to end.
- Location, verification, OTPs and the reports remain simulated locally. No location, authentication, KYC or OTP service is contacted.
- Selfie capture advances through framing and capture states automatically. For the video step, press **Start**, then **Stop** within ten seconds, review, and confirm. Waiting more than ten seconds shows the retry state.
- The review screen plays the clip that was just recorded, with real play, pause, scrub and mute. Its length is the real recording's, not a fixed twelve seconds.
- PAN consent must be checked before continuing. Expand the recording bar to see the portrait and application number. Expand/collapse report sections to inspect comparisons.
- **Done** starts a new journey and clears entered values. Refreshing also clears entered values. Browser back/forward follows the screen history.

## Included flow

Login / x-karza-key → Applicant Details → Mobile OTP → Email OTP → Terms & Conditions → Instructions → Location → Selfie → Video Liveness → PAN → CKYC Report → KYC Report → Completion.

The phone’s status bar, Wi-Fi/battery strip, on-screen keyboard, and home indicator are omitted. The recording and network row inside the KYC application is retained because it is part of the application design. No demo badges or fill-value controls are displayed in the interface.

## Direct screen links

Append these fragments to the local URL to inspect a particular screen. Screens are accessible directly for frontend review; they do not implement authentication gates.

| Fragment | Screen |
| --- | --- |
| `#/login` | Username/password login |
| `#/key` | x-karza-key login |
| `#/applicant` | Applicant details |
| `#/mobile-otp` | Mobile OTP verification |
| `#/email-otp` | Email verification |
| `#/terms` | Terms & Conditions |
| `#/instructions` | Preparation instructions |
| `#/selfie-intro` | Selfie instructions |
| `#/selfie-capture` | Three-stage face framing |
| `#/video-intro` | Video instructions |
| `#/recording-consent` | Video recording consent |
| `#/video-ready` | Start recording |
| `#/video-confirm` | Captured video review |
| `#/pan` | PAN and date of birth |
| `#/ckyc-report` | CKYC report |
| `#/kyc-report` | Full, expandable KYC report |
| `#/complete` | Completed journey |
| `#/location-denied` | Location permission denied |
| `#/camera-denied` | Camera/microphone permission denied |
| `#/selfie-error/no-face` | No face detected |
| `#/selfie-error/poor-quality` | Poor image quality |
| `#/selfie-error/not-live` | Photo is not live |
| `#/selfie-error/multiple-faces` | Multiple faces detected |
| `#/selfie-error/framing` | Incorrect framing |
| `#/failed/pan` | PAN failure |
| `#/failed/liveness` | Liveness failure |

## Guided assistance (co-browse + voice)

The journey is wired to **@creditnirvana/cobrowse**, so a support assistant can watch the
customer's screen and ring the control they need next.

What the assistant receives is only the **structure** of the page: each visible control's
label, role, geometry, and whether it is filled — plus the page URL without its query
string. It never receives values, keystrokes, pixels, or a DOM mirror, and it cannot type,
click, or navigate. Check that claim rather than trusting it: open the console and run
`CoBrowse.__scanModelForTest()`, which prints the exact payload and starts nothing.

Nothing is transmitted until the customer accepts the SDK's own consent dialog, and
`init()` never throws — a co-browse failure cannot take the KYC journey down.

- **How a session starts.** The assistant sends a link carrying `?cb=<code>`; opening it
  prompts for consent and, on approval, connects. Without that parameter the SDK is inert.
- **The help button.** The microphone button above the footer starts the Perfios voice
  assistant in the page. The Sarvam API key never reaches this bundle: the page asks the
  co-browse worker for a short-lived session token and sends every runtime call through
  `/api/sarvam/*`, which injects the key server-side.
- **The button is invisible to the assistant.** It sits behind `data-cobrowse-ignore`, so
  the assistant can never guide someone to press the assistant.
- **Screen headings are focusable** (`h1[tabindex="0"]`, focused on each route change).
  That is the usual single-page a11y pattern, and it is also what lets the assistant tell
  the screens apart: Terms and Instructions are otherwise identical — a lone "Proceed".
- **Content-Security-Policy.** `connect-src` names the co-browse service with **both**
  `https:` and `wss:`, and Sarvam for the voice socket. Dropping the `wss:` origin is the
  classic silent failure: the script loads, `init()` resolves, no error is thrown, and the
  socket is blocked. `npm test` asserts the exact allow-list.

### Running against a local worker

Flow authoring records the journey against a co-browse worker on this machine, which the
production CSP correctly refuses. `npm run start:authoring` serves the same files with
`connect-src` widened to localhost, and the page accepts `?cb_endpoint=http://localhost:PORT`
— localhost only, so a crafted link cannot repoint a real customer's session.

```sh
npm run start:authoring
open 'http://localhost:3000/?cb=<code>&cb_endpoint=http://localhost:8788'
```

### Vendored dependencies

`dist/vendor/` holds the two script-tag builds the page loads, so `script-src` stays
`'self'` and the journey still needs no build step to run. Refresh them after bumping
either dependency:

```sh
npm run build:vendor
```

## Source files

- `dist/index.html` — accessible application shell.
- `dist/styles.css` — responsive layouts, design colors, components, local font declarations, and reduced-motion support.
- `dist/content.js` — prepared values, reference copy, and report data.
- `dist/app.js` — routing, forms, validation, tap-to-fill, OTPs, capture states, and reports.
- `dist/assets/` — original artwork and photographs extracted from the supplied PDFs, plus webfont subsets reconstructed from their original outlined glyphs. Additional characters fall back to the browser’s sans-serif font.
- `dist/assist.js` — co-browse start-up and the voice help button.
- The camera lives in `dist/app.js` (`camera`): one stream, opened when a capture screen
  needs it and released the moment the journey leaves one, so the recording light is never
  on for a screen that is not recording.
- `dist/vendor/` — script-tag builds of `@creditnirvana/cobrowse` and the Sarvam browser SDK.
- `server.mjs` — optional static local server.
- `tests/journey.test.mjs` — dependency-free checks of state transitions, validation, field behavior, and screen wiring.

The implementation follows the supplied exports. Obvious inconsistencies were corrected where necessary for interaction: the email string in the date-of-birth field is replaced with a valid date, the key-login return link switches back to username/password, and verification destinations reflect the entered phone/email. Terminal screens include a usable retry or completion action. Branding and source artwork belong to their respective owners.

## Checks

```sh
npm test
```

These are source and logic checks using a lightweight document fixture, not a browser rendering test. All artwork and font assets are bundled locally. The page’s Content Security Policy blocks network connections; the application sends no personal data anywhere and stores no personal data persistently.

This ZIP contains code only. It has not been deployed.

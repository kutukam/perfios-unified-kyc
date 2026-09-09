/* ============================================================
   Guided assistance for the Unified KYC journey
   ------------------------------------------------------------
   Two independent pieces, in this order:

   1. The co-browse SDK. The assistant sees the STRUCTURE of this
      page — each control's label, role, geometry and whether it
      is filled — never its contents, and rings the control the
      flow engine says is next. Nothing starts without the
      customer accepting the SDK's own consent dialog, and
      init() never throws, so a co-browse failure cannot take
      the KYC journey down.

   2. The help button. Press it and the Perfios voice assistant
      joins the same session and guides the rest of the journey.
      The Sarvam API key NEVER reaches this bundle: the page asks
      the worker for a short-lived session token and sends every
      runtime call through /api/sarvam/*, which injects the key
      server-side.

   Both are inert until used, and both live behind
   data-cobrowse-ignore so the assistant never guides the
   customer to its own button.
   ============================================================ */
(() => {
  'use strict';

  const WORKER = 'https://cobrowse-do.harshkhandelwal8553.workers.dev';
  const TENANT = 'perfios';
  const SITE = 'perfios-unified-kyc';   // which published journey the assistant guides

  /* Values from the agent's Deploy-with-code panel. `version` is pinned on purpose:
     Samvaad serves the older committed default when it is unset, which presents as a
     404 "App not found for the interaction type" or, worse, as a different agent
     answering. Re-pin after every commit. */
  const AGENT = {
    orgId: '019ec301-92a0-7a28-846c-b1afafcdf30d',
    workspaceId: '019ec301-92a7-7f33-81f2-14326ae2265e',
    appId: 'One-SDK-GFF-e5422ef4-af74',
    version: 7
  };

  /* An authoring escape hatch, not a customer-facing feature: ?cb_endpoint=http://localhost:8787
     points the SDK at a local worker while a journey flow is being recorded and verified.
     Only ever honoured for a localhost endpoint, so a crafted link cannot redirect a real
     customer's page model somewhere else. */
  function endpointOverride() {
    try {
      const raw = new URLSearchParams(location.search).get('cb_endpoint') || '';
      return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(raw) ? raw : undefined;
    } catch { return undefined; }
  }

  /** The co-browse code this page was opened with, so the agent can see the screen. */
  function cobrowseCode() {
    try {
      return (new URLSearchParams(location.search).get('cb') || '').split('_')[0] || '';
    } catch { return ''; }
  }

  // ── 1. Co-browse ────────────────────────────────────────────────────────────
  //
  // Two ways in, and they start assistance at different moments:
  //
  //   ?cb=<code>  the assistant sent this link, so the session already exists and the
  //               SDK binds to it on load. Consent is asked for immediately.
  //   no ?cb=     the customer came here on their own. NOTHING starts on load — the
  //               page mints a session only when they press the help button, so a
  //               visitor who never asks for help is never asked for consent and never
  //               publishes a page model.
  //
  // Either way `code` is what the assistant is given, and it is the only thing that
  // lets it see this screen.
  const endpoint = endpointOverride() || WORKER;
  const initialReference = (() => {
    try {
      const value = new URLSearchParams(location.search).get('cb') || '';
      return /^[A-Za-z0-9_-]{4,64}$/.test(value) ? value : '';
    } catch { return ''; }
  })();
  let code = initialReference;
  let browse = null;
  let browseReady = null;
  let rejectBrowse = null;
  let browseGeneration = 0;
  let sharing = false;
  let reconnecting = false;
  let agent = null;
  let phase = 'idle';
  let generation = 0;
  let requestController = null;
  let rejectVoice = null;

  const mount = document.createElement('div');
  mount.className = 'assist';
  mount.setAttribute('data-cobrowse-ignore', '');
  const sharingNode = document.createElement('div');
  sharingNode.className = 'assist__status';
  sharingNode.hidden = true;
  const sharingLabel = document.createElement('span');
  const endSharing = document.createElement('button');
  endSharing.type = 'button';
  endSharing.textContent = 'End';
  endSharing.setAttribute('aria-label', 'End guided assistance');
  sharingNode.append(sharingLabel, endSharing);
  const errorNode = document.createElement('p');
  errorNode.className = 'assist__error';
  errorNode.setAttribute('role', 'status');
  errorNode.setAttribute('aria-live', 'polite');
  errorNode.hidden = true;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'assist__btn';
  mount.append(sharingNode, errorNode, btn);

  const MIC = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2Z"/></svg>';
  const BARS = '<span class="assist__bars" aria-hidden="true"><i></i><i></i><i></i></span>';

  function paint(message = '') {
    const live = phase === 'live';
    btn.className = `assist__btn${live ? ' is-live' : ''}${phase === 'connecting' ? ' is-busy' : ''}`;
    btn.innerHTML = live ? BARS : MIC;
    const label = live ? 'End assistance' : phase === 'connecting' ? 'Cancel connecting assistance' : 'Talk to an assistant';
    btn.setAttribute('aria-label', label);
    btn.setAttribute('aria-pressed', String(live));
    btn.title = label;
    errorNode.textContent = message;
    errorNode.hidden = !message;
    sharingNode.hidden = !sharing || !!message;
    sharingLabel.textContent = reconnecting ? 'Reconnecting guided assistance…' : 'Guided assistance active';
    document.documentElement.classList.toggle('is-guided', live);
  }

  function deadline(promise, ms, message) {
    let timer;
    return Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
    })]).finally(() => clearTimeout(timer));
  }

  async function postJSON(url, body, signal) {
    const controller = new AbortController();
    const cancel = () => controller.abort();
    if (signal?.aborted) controller.abort();
    else signal?.addEventListener('abort', cancel, { once: true });
    const timer = setTimeout(cancel, 15000);
    try {
      const response = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body), signal: controller.signal
      });
      if (!response.ok) throw new Error('The assistant service is unavailable. Please try again.');
      return await response.json();
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
    }
  }

  function releaseVoice(current) {
    if (!current) return Promise.resolve();
    return deadline(Promise.resolve().then(() => current.stop()), 4000, 'stop_timeout').catch(() => {});
  }

  async function stop(message = '') {
    // Invalidate callbacks before ending either SDK: teardown itself can emit end
    // events, and an old microphone permission prompt can finish after a retry.
    generation++;
    browseGeneration++;
    const currentVoice = agent;
    const currentBrowse = browse;
    agent = null;
    browse = null;
    browseReady = null;
    code = '';
    sharing = false;
    reconnecting = false;
    phase = 'idle';
    requestController?.abort();
    requestController = null;
    rejectBrowse?.(new Error('cancelled'));
    rejectVoice?.(new Error('cancelled'));
    rejectBrowse = null;
    rejectVoice = null;
    paint(message);
    if (window.CoBrowse?.instance === currentBrowse) window.CoBrowse.instance = null;
    try { currentBrowse?.end('ended_by_user'); } catch { /* already ended */ }
    await releaseVoice(currentVoice);
  }

  function startCoBrowse(reference) {
    if (browseReady) return browseReady;
    if (!window.CoBrowse?.init) return Promise.reject(new Error('Screen assistance is unavailable. Please reload and try again.'));
    const attempt = ++browseGeneration;
    let resolveReady;
    const ready = new Promise((resolve, reject) => {
      resolveReady = resolve;
      rejectBrowse = reject;
    });
    // CoBrowse.init() only creates the handle. The socket and page model are ready
    // after onSessionStart, which happens only AFTER consent is accepted.
    browseReady = deadline(ready, 60000, 'Screen assistance did not connect. Please try again.');
    const connectionReady = browseReady;
    connectionReady.catch(() => {});
    const active = info => {
      if (attempt !== browseGeneration) return;
      sharing = true;
      reconnecting = false;
      code = String(info?.id || reference);
      paint();
      resolveReady(code.split('_')[0]);
    };
    Promise.resolve().then(() => {
      if (attempt !== browseGeneration) return null;
      return window.CoBrowse.init({
      tenant: TENANT,
      endpoint,
      // An explicit reference avoids resuming another journey's stored session.
      linkParam: null,
      sessionToken: () => Promise.resolve(reference),
      // The SDK's builtin indicator occupies the bottom-right corner. The same
      // active status and End action live in the reserved action dock instead.
      ui: { indicator: 'custom' },
      onSessionStart: active,
      onSessionRecovered: active,
      onSessionDegraded() {
        if (attempt !== browseGeneration) return;
        reconnecting = true;
        browseReady = deadline(new Promise((resolve, reject) => { resolveReady = resolve; rejectBrowse = reject; }), 30000, 'Screen assistance did not reconnect. Please try again.');
        browseReady.catch(error => { if (attempt === browseGeneration) void stop(error.message); });
        paint();
      },
      onError(error) {
        if (attempt !== browseGeneration) return;
        if (error?.fatal || error?.code === 'consent_declined') {
          const message = error.code === 'consent_declined'
            ? 'Guided assistance was not started.'
            : 'Screen assistance could not connect. Please try again.';
          rejectBrowse?.(new Error(message));
          if (phase === 'idle' || sharing) void stop(message);
        }
      },
      onSessionEnd(info) {
        if (attempt !== browseGeneration) return;
        void stop(info?.reason === 'disconnected' ? 'Screen assistance disconnected. Tap the microphone to reconnect.' : '');
      }
      });
    }).then(handle => {
      if (attempt !== browseGeneration) { try { handle?.end('ended_by_user'); } catch {} return; }
      browse = handle;
      window.CoBrowse.instance = handle;
      if (handle?.status() === 'active') active(handle.session());
    }).catch(() => {
      if (attempt === browseGeneration) rejectBrowse?.(new Error('Screen assistance could not connect. Please try again.'));
    });
    return connectionReady;
  }

  async function openSession(signal) {
    if (browse?.status() === 'active') return code.split('_')[0];
    if (browseReady) return browseReady;
    if (!code) code = initialReference;
    if (!code) {
      const created = await postJSON(`${endpoint}/api/session`, { site: SITE }, signal);
      if (signal.aborted) throw new Error('cancelled');
      code = String(created.key || created.sessionId || '');
      if (!code) throw new Error('The assistant could not open a screen session.');
    }
    return startCoBrowse(code);
  }

  async function start(micPrimed) {
    if (!window.SarvamConvAI) { paint('The assistant is unavailable on this page. Please reload and try again.'); return; }
    const attempt = ++generation;
    requestController = new AbortController();
    const signal = requestController.signal;
    phase = 'connecting';
    paint();
    let conversation;
    try {
      // Let the permission settle first: the SDK's getUserMedia comes several
      // awaits later, far outside the tap that could have prompted for it.
      if (micPrimed) {
        const mic = await micPrimed;
        if (mic === 'denied') {
          // Nothing in this page can reopen a permission the browser has blocked, so
          // say where the switch is instead of asking them to tap again forever.
          await stop("Microphone is blocked for this site. In Chrome tap the icon left of the address bar, turn Microphone on, then tap again.");
          return;
        }
      }
      const screenCode = await openSession(signal);
      if (attempt !== generation) return;
      const session = await postJSON(`${WORKER}/api/extension/session`, { scope: 'perfios' }, signal);
      if (attempt !== generation) return;
      if (!session.token || !session.user_id || !session.session_id) throw new Error('The assistant session could not be opened. Please try again.');
      let acknowledge;
      const connected = new Promise((resolve, reject) => { acknowledge = resolve; rejectVoice = reject; });
      connected.catch(() => {});
      const isCurrent = () => attempt === generation && agent === conversation;
      conversation = new window.SarvamConvAI.ConversationAgent({
        apiKey: '',
        audioInterface: new window.SarvamConvAI.BrowserAudioInterface(),
        baseUrl: `${WORKER}/api/sarvam/`,
        platform: 'browser',
        customHeaders: {
          Authorization: `Bearer ${session.token}`,
          'X-User-Id': session.user_id,
          'X-Session-Id': session.session_id
        },
        config: {
          org_id: AGENT.orgId,
          workspace_id: AGENT.workspaceId,
          app_id: AGENT.appId,
          version: AGENT.version,
          user_identifier: session.session_id,
          user_identifier_type: 'custom',
          interaction_type: window.SarvamConvAI.InteractionType.CALL,
          input_sample_rate: 16000,
          output_sample_rate: 16000,
          agent_variables: { cobrowse_code: screenCode }
        },
        stateCallback(next) {
          if (!isCurrent()) return;
          if (['connected', 'listening', 'speaking'].includes(next)) acknowledge();
          if (next === 'error') void stop('The voice connection failed. Tap the microphone to reconnect.');
        },
        endCallback() { if (isCurrent()) void stop(); },
        telemetryCallback(event) {
          if (!isCurrent() || event?.name !== 'ws_disconnected') return;
          void stop(event.properties?.wasClean ? '' : 'The voice connection ended. Tap the microphone to reconnect.');
        }
      });
      agent = conversation;
      const started = Promise.resolve().then(() => conversation.start());
      // A late permission grant must release its microphone even after Cancel or
      // a timeout. It must never reconnect an abandoned attempt.
      started.then(() => { if (!isCurrent()) void releaseVoice(conversation); }, () => {});
      /*
       * TWO WAYS TO LEARN THE SAME FACT.
       *
       * This used to accept only the status callback reporting connected/listening/
       * speaking. On a laptop that event always arrives; on mobile it does not, and the
       * page then sat here until the 20s deadline and reported a failure for a call that
       * had actually connected. The personal loan journey never had the bug because it
       * asks the SDK directly (waitForConnect) instead of waiting to be told.
       *
       * So take whichever answers first. The event stays primary; polling is the floor.
       */
      const polled = (typeof conversation.waitForConnect === 'function')
        ? Promise.resolve().then(() => conversation.waitForConnect(15)).then(
            (ok) => { if (!ok) throw new Error('not_connected'); }, () => { throw new Error('not_connected'); })
        : new Promise(() => {});
      polled.catch(() => {});
      const acknowledged = Promise.any ? Promise.any([connected, polled]) : connected;
      await deadline(Promise.all([started, acknowledged]), 20000, 'Could not reach the assistant. Tap the microphone to try again.');
      if (!isCurrent()) { await releaseVoice(conversation); return; }
      phase = 'live';
      paint();
    } catch (error) {
      if (attempt !== generation) return;
      const message = error?.name === 'AbortError'
        ? 'The assistant connection timed out. Please try again.'
        : /failed to fetch/i.test(String(error?.message))
          ? 'Could not reach the assistant service. Please try again.'
          : String(error?.message || 'The assistant could not connect. Please try again.');
      await stop(message);
    }
  }

  /**
   * ASK FOR THE MICROPHONE INSIDE THE TAP.
   *
   * getUserMedia only prompts while the tap that triggered it still counts as user
   * activation. Everything this button does before the voice SDK starts — opening the
   * screen session, waiting for the consent dialog, fetching a Sarvam token — is
   * asynchronous, and by the time the SDK finally asks, the activation has expired.
   * A desktop browser never notices, because the first grant is remembered per origin.
   * A phone that has never granted it gets NO PROMPT AT ALL and a bare rejection, which
   * reads as "it never even asked me". Reported from mobile Chrome.
   *
   * So ask here, while the tap is still live. The tracks are stopped immediately: this
   * exists only to turn the permission into a decision. Once granted, the SDK's own
   * call needs no prompt.
   */
  var __audioUnlock = null;
  /**
   * UNLOCK AUDIO IN THE SAME TAP.
   *
   * Chrome on Android starts every AudioContext suspended until the page has had a user
   * gesture, and it does NOT resume one created later in an async chain. The voice SDK
   * builds its context several awaits after the tap, so on Chrome it comes up suspended:
   * the socket connects, the agent is live, and no audio moves in either direction. It
   * presents as "the microphone does not respond" even though permission was granted.
   * Safari is laxer here, which is why the same page works there.
   *
   * Creating and resuming one context inside the tap marks the document as unlocked, so
   * the SDK's own context starts running. It is closed on stop.
   */
  function unlockAudio() {
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      if (!__audioUnlock) __audioUnlock = new Ctx();
      if (__audioUnlock.state === 'suspended') __audioUnlock.resume();
    } catch (e) { /* audio stays locked; the SDK will report it */ }
  }

  function primeMicrophone() {
    try {
      const ask = navigator.mediaDevices && navigator.mediaDevices.getUserMedia
        ? navigator.mediaDevices.getUserMedia({ audio: true }) : null;
      if (!ask) return Promise.resolve(false);
      return ask.then(function (stream) {
        stream.getTracks().forEach(function (t) { try { t.stop(); } catch (e) { /* gone */ } });
        return 'granted';
      }).catch(function (e) {
        // NotAllowedError covers both "they just said no" and "this site is already
        // blocked in settings". Only the second one cannot be prompted for again, and
        // the Permissions API is the only way to tell them apart.
        return (e && e.name === 'NotAllowedError') ? 'denied' : 'unavailable';
      });
    } catch (e) { return Promise.resolve(false); }
  }

  btn.addEventListener('click', () => {
    if (phase === 'live' || phase === 'connecting') void stop();
    // Prime the permission in the gesture, then start. See primeMicrophone.
    else { unlockAudio(); const mic = primeMicrophone(); void start(mic); }
  });
  endSharing.addEventListener('click', () => { void stop(); });
  window.addEventListener('pagehide', () => { void stop(); });

  paint();
  const dock = document.querySelector('#action-dock');
  dock.append(mount);
  const measureDock = () => document.documentElement.style.setProperty('--action-dock-height', `${Math.ceil(dock.getBoundingClientRect().height)}px`);
  measureDock();
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(measureDock).observe(dock);
  else window.addEventListener('resize', measureDock);

  /* Deliberately nothing here. Arriving on an assistant's ?cb= link supplies the
     session reference but does NOT start assistance: the customer presses the
     microphone first, so no page ever begins highlighting itself unprompted. The
     reference is still honoured — openSession() binds to it instead of minting. */
})();

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
    version: 1
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
  let code = cobrowseCode();

  function startCoBrowse(sessionRef) {
    if (!window.CoBrowse) return Promise.resolve(null);
    return window.CoBrowse.init({
      tenant: TENANT,
      endpoint,
      linkParam: 'cb',
      // Only meaningful for a session this page minted; on a ?cb= link the SDK reads the
      // reference out of the URL and never calls this.
      ...(sessionRef ? { sessionToken: () => Promise.resolve(sessionRef) } : {})
    }).then(handle => { window.CoBrowse.instance = handle; return handle; });
  }

  if (code) void startCoBrowse(null);

  /** Mint a session for a customer who arrived without a link, and bind this page to it. */
  async function openSession() {
    if (code) return code;
    const res = await fetch(`${endpoint || WORKER}/api/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Without `site` the session runs another journey's flow entirely, and every
      // instruction the assistant gives is confidently about the wrong application.
      body: JSON.stringify({ site: SITE })
    });
    if (!res.ok) throw new Error(`session ${res.status}`);
    const created = await res.json();
    code = String(created.key || created.sessionId || '');
    if (!code) throw new Error('The assistant could not open a screen session.');
    await startCoBrowse(code);
    return code;
  }

  // ── 2. The help button ──────────────────────────────────────────────────────
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

  const mount = document.createElement('div');
  mount.className = 'assist';
  mount.setAttribute('data-cobrowse-ignore', '');
  const errorNode = document.createElement('p');
  errorNode.className = 'assist__error';
  errorNode.hidden = true;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'assist__btn';
  mount.append(errorNode, btn);

  const MIC = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2Z"/></svg>';
  const BARS = '<span class="assist__bars" aria-hidden="true"><i></i><i></i><i></i></span>';

  let agent = null;
  let phase = 'idle'; // idle | connecting | live

  function paint(message) {
    const live = phase === 'live';
    btn.className = `assist__btn${live ? ' is-live' : ''}${phase === 'connecting' ? ' is-busy' : ''}`;
    btn.innerHTML = live ? BARS : MIC;
    const label = live ? 'End assistance' : 'Talk to an assistant';
    btn.setAttribute('aria-label', label);
    btn.title = label;
    errorNode.textContent = message || '';
    errorNode.hidden = !message;
    // The page's own guidance ring belongs to the assistant, so it appears when the
    // assistant does and goes when it goes.
    document.documentElement.classList.toggle('is-guided', live);
  }

  async function stop() {
    const current = agent;
    agent = null;
    phase = 'idle';
    paint('');
    // Never let a stalled teardown freeze the button.
    if (current) { try { await Promise.race([current.stop(), wait(4000)]); } catch { /* already gone */ } }
  }

  async function start() {
    if (!window.SarvamConvAI) { phase = 'idle'; paint('The assistant is unavailable on this page.'); return; }
    phase = 'connecting';
    paint('');
    try {
      // Before anything else: make sure there IS a screen to show the assistant. Starting
      // the voice agent first would put it on the line with no idea what the customer is
      // looking at, which reads to them as a broken assistant rather than a missing session.
      const screenCode = await openSession();

      const res = await fetch(`${WORKER}/api/extension/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // `scope` picks which Sarvam org's key the worker injects; this agent lives in
        // its own org and the default key would 404 against it.
        body: JSON.stringify({ scope: 'perfios' })
      });
      if (!res.ok) throw new Error(`session ${res.status}`);
      const session = await res.json();

      const conversation = new window.SarvamConvAI.ConversationAgent({
        apiKey: '',
        // Not optional for a CALL. Without it the SDK refuses to start at all, and the
        // customer just sees the help button give up.
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
          /* Language, voice and pace belong to the published agent version — overriding
             them here made in-page calls behave unlike dashboard calls. */
          agent_variables: {
            // What lets the agent SEE this screen. Without it every screen tool answers
            // session_unavailable and it guides blind.
            cobrowse_code: screenCode
          }
        }
      });
      agent = conversation;

      // A blocked or undecided microphone permission would otherwise sit on
      // "Connecting…" forever.
      await Promise.race([
        conversation.start(),
        wait(12000).then(() => { throw new Error('__mic_timeout__'); })
      ]);
      if (!await conversation.waitForConnect(8)) throw new Error('The assistant did not answer. Please try again.');
      phase = 'live';
      paint('');
    } catch (e) {
      const raw = String(e && e.message ? e.message : e);
      await stop();
      phase = 'idle';
      paint(
        raw === '__mic_timeout__' ? 'Allow microphone access, then tap again.'
          : /failed to fetch/i.test(raw) ? 'Could not reach the assistant service.'
            : raw
      );
    }
  }

  btn.addEventListener('click', () => {
    if (phase === 'connecting') return;
    if (phase === 'live') void stop(); else void start();
  });

  paint('');
  document.querySelector('#application').append(mount);
})();

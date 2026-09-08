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

  const WORKER = 'https://cobrowse.unikernel.ai';
  const TENANT = 'perfios';

  /* Values from the agent's Deploy-with-code panel. `version` is pinned on purpose:
     Samvaad serves the older committed default when it is unset, which presents as a
     404 "App not found for the interaction type" or, worse, as a different agent
     answering. Re-pin after every commit. */
  const AGENT = {
    orgId: '019ec301-92a0-7a28-846c-b1afafcdf30d',
    workspaceId: '019ec301-92a7-7f33-81f2-14326ae2265e',
    appId: '',      // filled from the dashboard — see journeys/perfios-unified-kyc/README
    version: 0
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
  if (window.CoBrowse) {
    window.CoBrowse.init({
      tenant: TENANT,
      endpoint: endpointOverride(),
      linkParam: 'cb'
    }).then(handle => { window.CoBrowse.instance = handle; });
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
            cobrowse_code: cobrowseCode()
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

/* Unified KYC interactive frontend. No fetch, API clients, device permissions,
   camera streams, authentication requests, cookies, or persistent personal data. */
(() => {
  'use strict';
  const content = window.JourneyContent;
  const main = document.querySelector('#main');
  const footer = document.querySelector('#footer');
  const bar = document.querySelector('#recording-bar');
  const dialog = document.querySelector('#dialog');
  const toastNode = document.querySelector('#toast');
  const data = {};
  const state = {
    route: 'login', recordingExpanded: false, otp: '', otpError: '',
    otpAttempts: { mobile: 0, email: 0 }, otpSentAt: { mobile: 0, email: 0 },
    captureAttempts: 0, videoAttempts: 0, locationAllowed: false,
    cameraAllowed: false, microphoneAllowed: false, playing: false,
    playTime: 0, muted: false, failureReason: 'liveness', calendarField: '',
    calendarYear: new Date().getFullYear(), calendarMonth: new Date().getMonth(), hasVideo: false,
    applicationNumber: String(Date.now())
  };
  let timers = [];
  let toastTimer;
  let returnFocus;

  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const asset = (file, alt = '', extra = '') => `<img src="./assets/${file}" alt="${esc(alt)}" ${extra}>`;
  const title = (heading, subtitle = '') => `<div class="title"><h1 tabindex="0">${heading}</h1>${subtitle ? `<p>${subtitle}</p>` : ''}</div>`;
  const powered = () => `<div class="powered">Powered by ${asset('perfios-logo.png','Perfios','width="36" height="11"')}</div>`;
  const button = (label, action = '', options = {}) => `<button class="button ${options.className || ''}" type="${options.form ? 'submit' : 'button'}" ${options.form ? `form="${options.form}" data-submit` : `data-action="${action}"`} ${options.disabled ? 'disabled' : ''}>${label}</button>`;
  const field = (name, label, options = {}) => {
    const value = data[name] ?? '';
    const attrs = `name="${name}" id="field-${name}" aria-label="${esc(label.replace('*',''))}" aria-describedby="error-${name}" ${options.required ? 'required' : ''}`;
    const control = options.multiline
      ? `<textarea ${attrs} placeholder=" " rows="2" autocomplete="off">${esc(value)}</textarea>`
      : options.items
        ? `<select ${attrs}><option value=""></option>${options.items.map(item => `<option ${value === item ? 'selected' : ''}>${esc(item)}</option>`).join('')}</select>`
        : `<input ${attrs} type="${options.type || 'text'}" placeholder=" " value="${esc(value)}" autocomplete="off" ${options.max ? `maxlength="${options.max}"` : ''} ${options.inputmode ? `inputmode="${options.inputmode}"` : ''} ${name === 'pan' ? 'autocapitalize="characters" spellcheck="false"' : ''}>`;
    const icon = options.calendar
      ? `<button type="button" class="icon-action" data-action="calendar" data-field="${name}" aria-label="Choose date">${asset('calendar.png')}</button>`
      : options.info
        ? `<button type="button" class="icon-action" data-action="pan-info" aria-label="About PAN number">${asset('info.png')}</button>`
        : options.items ? asset('chevron.png','','class="field-icon"') : '';
    return `<div class="field-wrap"><div class="field ${value ? 'filled' : ''}">${control}<label for="field-${name}">${esc(label).replace('*','<em>*</em>')}</label>${icon}</div><span class="field-error" id="error-${name}" aria-live="polite"></span></div>`;
  };
  const check = (name, copy, className = '') => `<label class="check-label ${className}"><input type="checkbox" name="${name}" ${data[name] ? 'checked' : ''}><span>${copy}</span></label>`;
  const divider = () => '<div class="divider">OR</div>';
  const form = (name, html) => `<form id="form-${name}" data-form="${name}" novalidate><div class="form-fields">${html}</div></form>`;
  const phoneMask = () => data.mobile ? `XXXXXX${esc(data.mobile.slice(-4))}` : '';
  const emailMask = () => {
    const value = data.email || '';
    const at = value.lastIndexOf('@');
    if (at < 1) return esc(value);
    return esc(`${value.slice(0, Math.min(3, at))}***${value.slice(at)}`);
  };
  const activeChannel = () => state.route === 'email-otp' ? 'email' : 'mobile';

  function setFooter(html = '', quiet = false) {
    footer.className = quiet ? 'quiet' : '';
    footer.innerHTML = html + powered();
  }

  function renderLogin(keyMode = false) {
    main.innerHTML = `<section class="screen login">${title('Unified KYC', keyMode ? 'Please enter your x-karza-key to proceed' : 'Please enter your login details to proceed')}${form(keyMode ? 'key' : 'login', keyMode ? field('karzaKey','Enter x-karza-key',{required:true}) : field('username','Username',{required:true}) + field('password','Password',{type:'password',required:true}))}${divider()}<div class="center"><button class="text-link" data-action="${keyMode ? 'login-mode' : 'key-mode'}">${keyMode ? 'Click here to login using username and password' : 'Click here to login using x-karza-key'}</button></div></section>`;
    setFooter(button('Proceed','',{form:`form-${keyMode ? 'key' : 'login'}`,disabled:true}));
  }

  function renderApplicant() {
    main.innerHTML = `<section class="screen applicant">${title('Applicant Details','Please fill in the below details to proceed')}${form('applicant',
      field('firstName','First Name*',{required:true}) + field('lastName','Last Name*',{required:true}) +
      field('birthDate','Date of Birth',{calendar:true,inputmode:'numeric',max:10,required:true}) +
      field('gender','Gender',{items:['Male','Female','Other'],required:true}) +
      field('mobile','Mobile Number',{type:'tel',inputmode:'numeric',max:10,required:true}) +
      field('email','Email ID',{type:'email',required:true}) +
      field('currentAddress','Current Address',{multiline:true,required:true}) +
      check('sameAddress','Same as the previously filled Current Address') +
      field('permanentAddress','Permanent Address',{multiline:true,required:true})
    )}</section>`;
    setFooter(button('Proceed','',{form:'form-applicant',disabled:true}));
  }

  function renderOTP() {
    const channel = activeChannel();
    if (!state.otpSentAt[channel]) state.otpSentAt[channel] = Date.now();
    const isEmail = channel === 'email';
    main.innerHTML = `<section class="screen otp-screen">${title(isEmail ? 'Email Verification' : 'Mobile OTP Verification',`Please enter the OTP sent to your ${isEmail ? 'email ID' : 'mobile number'}<br>${isEmail ? emailMask() : phoneMask()}`)}<form id="form-otp" data-form="otp" novalidate><div class="otp-boxes" role="group" aria-label="Six digit verification code">${Array.from({length:6},(_,i) => `<input type="text" name="otp${i}" data-otp="${i}" aria-label="Digit ${i+1}" inputmode="numeric" pattern="[0-9]" maxlength="1" autocomplete="off" value="${state.otp[i] || ''}">`).join('')}</div><div class="otp-help" ${state.otpError ? 'hidden' : ''}>Didn’t receive the code? <button type="button" data-action="resend" disabled>Resend code <b id="resend-time"></b></button></div><div class="otp-feedback" role="status" aria-live="polite">${state.otpError ? `${esc(state.otpError)}<span class="attempts">${attemptCopy(3-state.otpAttempts[channel])}</span>` : ''}</div></form></section>`;
    setFooter(button('Verify','',{form:'form-otp',disabled:!/^\d{6}$/.test(state.otp)}));
    tickOTP();
    repeat(tickOTP,1000);
  }

  function renderTerms() {
    main.innerHTML = `<section class="screen terms">${title('Terms & Conditions','Please read the given below terms carefully')}<div class="terms-copy">${content.terms.map(part => `${part.title ? `<h2>${esc(part.title)}</h2>` : ''}${part.subtitle ? `<h3>${esc(part.subtitle)}</h3>` : ''}<p>${esc(part.text).replace(/\n/g,'<br>')}</p>`).join('')}</div></section>`;
    setFooter(`<p class="footer-note">By proceeding you agree with the Terms & Conditions and the privacy policies</p>${button('Proceed','accept-terms')}`);
  }

  function renderInstructions() {
    main.innerHTML = `<section class="screen">${title('Instructions','Please carefully read all the given below instructions')}<ul class="instruction-list">${content.instructions.map(([image,heading,copy]) => `<li>${asset(image,'','width="48" height="48"')}<div><h2>${heading}</h2><p>${copy}</p></div></li>`).join('')}</ul></section>`;
    setFooter(button('Proceed','location-permission'));
  }

  function renderSelfieIntro() {
    main.innerHTML = `<section class="screen">${title('Help us verify it’s you','We will be capturing a selfie via your camera for your<br>Offline KYC verification')}${asset('selfie-illustration.png','Person on a video call','class="intro-visual" width="200" height="358"')}</section>`;
    setFooter(button(`${asset('camera-white.png')}Open Camera`,'selfie-permission'));
  }

  function renderVideoIntro() {
    main.innerHTML = `<section class="screen video-intro">${title('Help us verify it’s you','We will be recording a video via your camera for your<br>Liveness verification')}${asset('video-illustration.png','Person positioned for a video verification','class="intro-visual" width="282" height="255"')}<ul class="tip-list">${[['instruction-sun.png','Be in a well lit environment'],['instruction-phone.png','Hold your device upright for the video'],['instruction-face.png','Do not block your face with anything']].map(([image,text]) => `<li>${asset(image)}${text}</li>`).join('')}</ul></section>`;
    setFooter(button(`${asset('camera-white.png')}Open Camera`,'video-permission'));
  }

  /* ── The camera ───────────────────────────────────────────────────────────
     The selfie and liveness steps use the real device camera. One stream,
     opened when a capture screen needs it and released the moment the journey
     leaves one, so the recording light is never on for a screen that is not
     recording. The clip the customer confirms is the clip they just recorded,
     played back with its own audio.

     Every entry point is guarded and every failure is silent: where there is no
     camera API — an older browser, a machine without a webcam, the test fixture
     — the screens fall back to the supplied artwork and the journey still runs
     end to end. A demo that dies because a laptop has no camera is worse than
     one that shows a photograph. */
  const CAPTURE_ROUTES = new Set(['selfie-capture','recording-consent','video-ready','video-recording']);
  const CLIP_TYPES = ['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm','video/mp4'];
  const camera = {
    stream:null, recorder:null, chunks:[], clip:'', still:'',
    live() {
      return typeof navigator !== 'undefined'
        && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    },
    async open() {
      if (!this.live()) return false;
      if (this.stream) return true;
      try {
        // Audio too: the liveness step asks them to read digits out loud, and the
        // permission sheet this app shows says camera AND microphone.
        this.stream = await navigator.mediaDevices.getUserMedia({video:{facingMode:'user'},audio:true});
      } catch {
        return false;
      }
      return true;
    },
    /** Point every preview on the current screen at the live stream. */
    show() {
      if (!this.stream) return;
      main.querySelectorAll('.camera-view').forEach(node => {
        if (node.srcObject === this.stream) return;
        node.srcObject = this.stream;
        const started = node.play && node.play();
        if (started && started.catch) started.catch(() => {});
      });
    },
    /** Keep one frame, so the recording bar and the report show the face that was
     *  actually captured rather than a stock portrait. */
    grabStill() {
      try {
        const node = main.querySelector('.camera-view');
        if (!node || !node.videoWidth) return;
        const canvas = document.createElement('canvas');
        canvas.width = node.videoWidth;
        canvas.height = node.videoHeight;
        const context = canvas.getContext('2d');
        // The preview is mirrored so it reads like a mirror; the saved frame is not.
        context.translate(canvas.width,0);
        context.scale(-1,1);
        context.drawImage(node,0,0);
        this.still = canvas.toDataURL('image/jpeg',.82);
      } catch { /* keep the supplied artwork */ }
    },
    record() {
      if (!this.stream || typeof MediaRecorder === 'undefined') return;
      const type = CLIP_TYPES.find(candidate => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(candidate));
      try {
        this.recorder = new MediaRecorder(this.stream, type ? {mimeType:type} : undefined);
      } catch {
        this.recorder = null;
        return;
      }
      const recorder = this.recorder;
      this.chunks = [];
      recorder.ondataavailable = event => {if (event.data && event.data.size) this.chunks.push(event.data);};
      recorder.onstop = () => {
        try {
          if (this.clip) URL.revokeObjectURL(this.clip);
          this.clip = this.chunks.length
            ? URL.createObjectURL(new Blob(this.chunks,{type:recorder.mimeType || 'video/webm'}))
            : '';
        } catch {
          this.clip = '';
        }
        this.chunks = [];
      };
      try {recorder.start();} catch {this.recorder = null;}
    },
    stopRecording() {
      try {
        if (this.recorder && this.recorder.state === 'recording') this.recorder.stop();
      } catch { /* already stopped */ }
      this.recorder = null;
    },
    release() {
      this.stopRecording();
      try {
        if (this.stream) this.stream.getTracks().forEach(track => track.stop());
      } catch { /* already gone */ }
      this.stream = null;
    },
    forget() {
      this.release();
      try {if (this.clip) URL.revokeObjectURL(this.clip);} catch { /* nothing to revoke */ }
      this.clip = '';
      this.still = '';
    }
  };
  /** The frame this journey actually captured, or the supplied artwork. */
  const capturedFrame = (alt,extra) => camera.still
    ? `<img src="${esc(camera.still)}" alt="${esc(alt)}" ${extra || ''}>`
    : asset('portrait.jpg',alt,extra);

  function renderSelfie() {
    main.innerHTML = `<section class="screen selfie-screen"><div class="selfie-oval">${camera.live()
      ? '<video class="camera-view" playsinline muted autoplay aria-label="Camera preview"></video>'
      : asset('selfie-frame.png','Face positioned inside the capture frame','width="288" height="400"')}</div><p class="selfie-status" role="status" aria-live="polite">Ensure your face is<br>inside the frame</p></section>`;
    setFooter('',true);
    later(() => {
      main.querySelector('.selfie-oval').classList.add('aligned');
      main.querySelector('.selfie-status').innerHTML = 'Please place your face<br>perfectly in frame';
    },1300);
    later(() => {
      main.querySelector('.selfie-oval').classList.add('ready');
      main.querySelector('.selfie-status').innerHTML = 'Perfect! Stay still<br>for 3 seconds...';
    },2600);
    later(() => {camera.grabStill();go('selfie-processing');},5600);
  }

  function renderConsent() {
    main.innerHTML = `<section class="screen consent-screen">${title('Video Recording Consent','We will be recording you during the KYC journey for audit purposes, so position it correctly within the frame throughout the journey.')}${camera.live()
      ? '<video class="portrait camera-view" playsinline muted autoplay aria-label="Camera preview"></video>'
      : asset('portrait.jpg','Captured portrait preview','class="portrait" width="320" height="440"')}</section>`;
    setFooter(button('Continue','video-ready'));
  }

  function renderVideo(ready = false) {
    main.innerHTML = `<section class="screen recording-screen">${camera.live()
      ? '<video class="recording-image camera-view" playsinline muted autoplay aria-label="Camera preview"></video>'
      : asset('portrait.jpg','Video recording preview','class="recording-image" width="320" height="440"')}${ready ? '' : '<span class="recording-badge" id="record-time">Rec 00:00</span>'}</section>`;
    setFooter(`<div class="recording-controls">${ready ? '<h2>Help us verify it’s you</h2><p>We will be recording you for this, click on start and read the number out loud in 10 seconds</p>' : '<h1>4-8-7-6</h1><p>Please click on the stop button once you are done reading the numbers</p>'}</div>${button(ready ? 'Start' : 'Stop',ready ? 'start-recording' : 'stop-recording',{className:ready ? '' : 'stop'})}`);
    if (!ready) {
      const started = Date.now();
      repeat(() => {
        const elapsed = Math.min(10,Math.floor((Date.now()-started)/1000));
        document.querySelector('#record-time').textContent = `Rec 00:${String(elapsed).padStart(2,'0')}`;
        footer.style.setProperty('--record-progress',`${elapsed*10}%`);
      },200);
      later(videoTimeout,10500);
    }
  }

  function renderConfirmVideo() {
    state.playing = false;
    state.playTime = 0;
    main.innerHTML = `<section class="screen video-confirm">${title('Confirm Captured Video','Please make sure the audio and video captured is clear to understand')}<div class="video-player">${camera.clip
      ? `<video id="clip" playsinline preload="metadata" src="${esc(camera.clip)}" aria-label="Captured video"></video>`
      : asset('portrait.jpg','Captured video preview','width="320" height="456"')}<button class="sound-button" data-action="mute" aria-label="Mute audio" aria-pressed="false">${asset('sound.png','','width="18" height="18"')}</button><button class="play-button" data-action="play" aria-label="Play captured video">${asset('play.png','','width="12" height="12"')}</button><div class="player-controls"><span id="play-time">00:00</span><input id="play-progress" type="range" min="0" max="12" step="0.1" value="0" aria-label="Video position"><span id="play-total">00:12</span></div></div></section>`;
    setFooter(`<div class="row">${button('Retake','retake-video',{className:'outline'})}${button('Confirm','confirm-video')}</div>`);
    const clip = main.querySelector('#clip');
    if (clip) {
      clip.muted = state.muted;
      // The element owns the clock now; the simulated ticker below is only for the
      // fallback still, which has no clock of its own.
      ['loadedmetadata','timeupdate','play','pause','ended'].forEach(event => clip.addEventListener(event,updatePlayer));
      updatePlayer();
      return;
    }
    repeat(() => {
      if (!state.playing) return;
      state.playTime = Math.min(12,state.playTime+.1);
      if (state.playTime>=12) state.playing=false;
      updatePlayer();
    },100);
  }

  function renderPan() {
    main.innerHTML = `<section class="screen pan-screen">${title('PAN Details','Please fill in the below details to proceed')}${form('pan',field('pan','Enter PAN Number',{info:true,max:10,required:true}) + field('panBirthDate','Date of Birth',{inputmode:'numeric',max:10,required:true}) + check('ckycConsent','By proceeding, you consent to OneBank downloading your CKYC records to complete the Offline KYC process','justified'))}</section>`;
    setFooter(`${button('Proceed','',{form:'form-pan',disabled:true})}${divider()}<button class="text-link" data-action="no-pan">I don’t have a PAN card</button>`);
  }

  const reportTable = rows => `<table class="report-table"><tbody>${rows.map(([label,value]) => `<tr><th scope="row">${esc(label)}</th><td>${esc(value)}</td></tr>`).join('')}</tbody></table>`;
  const reportCard = (name,body) => `<section class="report-card"><h2>${name}</h2><div class="report-body">${body}</div></section>`;
  const fullName = () => [data.firstName, data.lastName].filter(Boolean).join(' ') || '—';
  const entered = name => data[name] || '—';

  function renderCKYC() {
    main.innerHTML = `<section class="screen report-screen">${title('CKYC Report','Please check the report to proceed ahead')}${reportCard('APPLICANT CKYC DETAILS',`<div class="report-photo">${camera.still ? `<img src="${camera.still}" alt="Applicant photograph" width="84" height="116">` : ''}</div>${reportTable([['Entity Type','Individual'],['Account Type','New'],['Application Number',state.applicationNumber],['Applicant’s Name',fullName()]])}`)}${reportCard('APPLICANT DETAILS',reportTable([['Applicant Name',fullName()],['Date of Birth',entered('birthDate')],['Gender',entered('gender')]]))}${reportCard('CONTACT DETAILS',reportTable([['Mobile Number',entered('mobile')],['Email ID',entered('email')],['Current Address',entered('currentAddress')],['Permanent Address',entered('permanentAddress')]]))}${reportCard('IDENTITY DETAILS',reportTable([['PAN Number',entered('pan')],['CKYC Status','Completed']]))}</section>`;
    setFooter(button('Proceed','kyc-report'));
  }

  function renderKYC() {
    const submitted = [
      ['Full Name',fullName()],['Date of Birth',entered('birthDate')],['Gender',entered('gender')],
      ['Current Address',entered('currentAddress')],['Permanent Address',entered('permanentAddress')],
      ['Mobile Number',entered('mobile')],['Email ID',entered('email')]
    ];
    main.innerHTML = `<section class="screen report-screen">${title('KYC Report','Please check the report to proceed ahead')}${reportCard('CUSTOMER DETAILS',reportTable(submitted))}${reportCard('IDENTITY DETAILS',reportTable([['PAN Number',entered('pan')],['Date of Birth',entered('panBirthDate')]]))}${camera.still ? reportCard('APPLICANT PHOTOGRAPH',`<div class="report-images"><figure><img src="${camera.still}" alt="Photo captured during this journey" width="136" height="110"></figure></div>`) : ''}${reportCard('ADDRESS DETAILS',reportTable([['Current Address',entered('currentAddress')],['Permanent Address',entered('permanentAddress')]]))}${reportCard('VERIFICATION',reportTable([['Liveness Status','Completed'],['CKYC Status','Completed']]))}</section>`;
    setFooter(button('Proceed','complete'));
  }

  function status(heading,copy = '',options = {}) {
    main.innerHTML = `<section class="screen status-screen ${options.success ? 'success-screen' : ''} ${options.failure ? 'failure-screen' : ''}">${options.loading ? '<div class="loader" aria-hidden="true"></div>' : ''}<h1 role="status" tabindex="0">${heading}</h1>${copy ? `<p>${copy}</p>` : ''}</section>`;
    setFooter(options.action ? button(options.label || 'Proceed',options.action) : '',!options.action);
    if (options.next) later(() => go(options.next), options.delay || 1600);
  }

  function recordingBar() {
    const active = ['pan','pan-processing','ckyc-success','ckyc-report','kyc-report'].includes(state.route);
    if (!active) {bar.innerHTML='';return;}
    bar.innerHTML = `<div class="recording-bar"><span class="recording-badge">Recording</span><button class="recording-toggle" data-action="toggle-recording" aria-label="${state.recordingExpanded ? 'Collapse' : 'Expand'} video recording frame" aria-expanded="${state.recordingExpanded}">${asset('collapse.png')}</button><span class="network">${asset('network.png')}Network</span></div>${state.recordingExpanded ? `<div class="recording-expanded">${capturedFrame('Video recording frame','width="60" height="76"')}<span>Application Number<strong>${state.applicationNumber}</strong></span><button data-action="toggle-recording" aria-label="Close video recording frame">×</button></div>` : ''}`;
  }

  const pages = {
    login: () => renderLogin(false), key: () => renderLogin(true), applicant: renderApplicant,
    'mobile-otp': renderOTP, 'email-otp': renderOTP, terms: renderTerms, instructions: renderInstructions,
    'location-processing': () => status('Checking a few details','We are checking your location details for a smoother<br>Offline KYC experience',{loading:true,next:'selfie-intro'}),
    'location-denied': () => status('Permission Denied','We could not access your Location permissions',{action:'location-permission'}),
    'selfie-intro': renderSelfieIntro, 'selfie-capture': renderSelfie,
    'selfie-processing': () => status('Please be patient','Uploading your Selfie at the best resolution possible',{loading:true,next:'selfie-success'}),
    'selfie-success': () => status('Selfie captured successfully','',{success:true,next:'video-intro',delay:1500}),
    'video-intro': renderVideoIntro, 'recording-consent': renderConsent,
    'video-ready': () => renderVideo(true), 'video-recording': () => renderVideo(false),
    'video-confirm': renderConfirmVideo,
    'video-processing': () => status('Please be patient','We are processing the video quality and clarity of the video that was captured',{loading:true,next:'video-success'}),
    'video-success': () => status('Video captured successfully','',{success:true,next:'pan',delay:1500}),
    pan: renderPan,
    'pan-processing': () => status('Please be patient','We are trying to fetch your PAN details for a smoother Offline KYC journey',{loading:true,next:'ckyc-success'}),
    'ckyc-success': () => status('CKYC details captured<br>successfully','',{success:true,next:'ckyc-report',delay:1700}),
    'ckyc-report': renderCKYC, 'kyc-report': renderKYC,
    'camera-denied': () => status('Permission Denied','We could not access your Camera & Microphone permissions. Your session has ended, please try again.',{failure:true,action:'restart-camera',label:'Retry'}),
    failed: () => status(state.failureReason==='pan' ? 'Offline KYC Failed' : 'KYC Failed',state.failureReason==='pan' ? 'You have entered an invalid PAN card number, please retry in some time.' : state.failureReason==='otp' ? 'Maximum attempts reached to verify your OTP. Please start again.' : 'Maximum attempts reached to perform liveness verification, please retry in some time.',{failure:true,action:'restart',label:'Start again'}),
    complete: () => {
      status('KYC completed successfully',`Your details have been verified.<br><span class="final-id">Application Number<strong>${state.applicationNumber}</strong></span>`,{success:true,action:'restart',label:'Done'});
    }
  };

  function later(fn,delay) {const id=setTimeout(fn,delay);timers.push(id);return id;}
  function repeat(fn,delay) {const id=setInterval(fn,delay);timers.push(id);return id;}
  function clearTimers() {timers.forEach(id => {clearTimeout(id);clearInterval(id);});timers=[];}
  function go(route) {
    closeDialog();
    if (location.hash === `#/${route}`) render();
    else location.hash = `/${route}`;
  }
  function render() {
    clearTimers();
    closeDialog();
    const route=location.hash.replace(/^#\/?/,'') || 'login';
    const [base,detail] = route.split('/');
    state.route = Object.hasOwn(pages,base) ? base : base==='selfie-error' ? 'selfie-error' : 'login';
    if(base==='failed' && ['pan','otp','liveness'].includes(detail))state.failureReason=detail;
    state.playing=false;
    footer.style.removeProperty('--record-progress');
    recordingBar();
    if (state.route==='selfie-error') {
      status('Please be patient','Uploading your Selfie at the best resolution possible');
      later(() => captureError(detail || 'no-face'),20);
    } else pages[state.route]();
    if (CAPTURE_ROUTES.has(state.route)) {
      if (camera.stream) camera.show();
      else camera.open().then(ok => {if (ok && CAPTURE_ROUTES.has(state.route)) camera.show();});
    } else camera.release();
    document.title = `${main.querySelector('h1')?.textContent || 'Unified KYC'} | Perfios`;
    main.scrollTop=0;
    (main.querySelector('h1') || main).focus({preventScroll:true});
    updateSubmit();
  }

  function toast(message) {
    clearTimeout(toastTimer);
    toastNode.textContent=message;
    toastNode.classList.add('visible');
    toastTimer=setTimeout(() => toastNode.classList.remove('visible'),2800);
  }

  function openDialog(heading,copy,buttons,extra='') {
    returnFocus = document.activeElement;
    dialog.innerHTML=`<h2 id="dialog-title">${heading}</h2>${copy ? `<p>${copy}</p>` : ''}${buttons}${extra}`;
    dialog.showModal();
  }
  function closeDialog() {
    if (!dialog.open) return;
    dialog.close();
    if (returnFocus?.isConnected) returnFocus.focus({preventScroll:true});
  }
  const attemptCopy = count => count <= 1 ? 'Last attempt' : `${count} attempts remaining`;

  function locationPermission() {
    openDialog('Allow Location','Allow us to take your location information?',button('Allow','allow-location') + '<button class="text-link" data-action="deny-location">Don’t allow</button>');
  }
  function cameraPermission(mode) {
    data.captureMode=mode;
    if (state.cameraAllowed && (mode==='selfie' || state.microphoneAllowed)) {go(mode==='selfie' ? 'selfie-capture' : 'recording-consent');return;}
    openDialog('Allow Camera & Microphone','Camera and Microphone access is required for Offline KYC verification. Please click on Allow to proceed ahead in the flow.',button('Allow','allow-camera') + '<button class="text-link" data-action="deny-camera">Don’t allow</button>');
  }
  function captureError(reason) {
    const error=content.captureErrors[reason] || content.captureErrors['no-face'];
    if (state.captureAttempts>=3) {state.failureReason='liveness';go('failed');return;}
    state.captureAttempts++;
    openDialog(error[0],error[1],button('Retry','retry-selfie'),`<span class="attempts">${attemptCopy(3-state.captureAttempts)}</span>`);
  }
  function videoTimeout() {
    clearTimers();
    camera.stopRecording();
    state.videoAttempts++;
    if (state.videoAttempts>=3) {state.failureReason='liveness';go('failed');return;}
    openDialog('Please try again','You took too long to read out the numbers, please try again',button('Retry','retry-video'),`<span class="attempts">${attemptCopy(3-state.videoAttempts)}</span>`);
  }

  function tickOTP() {
    const channel=activeChannel();
    const remaining=Math.max(0,23-Math.floor((Date.now()-state.otpSentAt[channel])/1000));
    const node=main.querySelector('#resend-time');
    const resend=main.querySelector('[data-action="resend"]');
    if (node) node.textContent=remaining ? `in ${remaining} seconds` : '';
    if (resend) resend.disabled=remaining>0;
  }
  function setOTP(value) {
    state.otp=String(value).replace(/\D/g,'').slice(0,6);
    main.querySelectorAll('[data-otp]').forEach((input,i) => {input.value=state.otp[i] || '';input.removeAttribute('aria-invalid');});
    clearOTPError();
    updateSubmit();
  }
  function clearOTPError() {
    state.otpError='';
    const feedback=main.querySelector('.otp-feedback');
    const help=main.querySelector('.otp-help');
    if(feedback)feedback.innerHTML='';
    if(help)help.hidden=false;
  }
  function verifyOTP() {
    const channel=activeChannel();
    if (!/^\d{6}$/.test(state.otp)) return;
    // This presentation journey accepts every six-digit code, including 123456.
    state.otp='';state.otpError='';
    if (channel==='mobile') {state.otpSentAt.email=Date.now();go('email-otp');}
    else go('terms');
  }

  function validDate(value) {
    const match=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value || '');
    if(!match)return false;
    const [,day,month,year]=match.map(Number);
    const date=new Date(year,month-1,day);
    return date.getFullYear()===year && date.getMonth()===month-1 && date.getDate()===day && year>=1900 && date<=new Date();
  }
  function validationError(name,value) {
    const text = String(value ?? '').trim();
    if (!text) return 'Please complete this field';
    if (name==='mobile' && !/^\d{10}$/.test(text)) return 'Please enter 10 digits';
    if (name==='aadhaar' && !/^\d{12}$/.test(text)) return 'Please enter 12 digits';
    if (name==='pan' && text.length!==10) return 'Please enter 10 characters';
    return '';
  }

  function showFieldError(input) {
    if(!input.name || input.type==='checkbox' || input.dataset.otp!==undefined)return;
    const message=validationError(input.name,input.value);
    const node=document.getElementById(`error-${input.name}`);
    if(node)node.textContent=message;
    input.setAttribute('aria-invalid',String(!!message));
  }
  function updateSubmit() {
    const submit=footer.querySelector('[data-submit]');
    if(!submit)return;
    const activeForm=main.querySelector('form');
    if(!activeForm)return;
    if(activeForm.dataset.form==='otp') {submit.disabled=!/^\d{6}$/.test(state.otp);return;}
    const complete=Array.from(activeForm.querySelectorAll('[required]')).every(input => !validationError(input.name,input.value));
    submit.disabled=!complete || (activeForm.dataset.form==='pan' && !data.ckycConsent);
  }

  function saveInput(input) {
    if(!input.name || input.dataset.otp!==undefined)return;
    data[input.name]=input.type==='checkbox' ? input.checked : input.value;
    input.closest('.field')?.classList.toggle('filled',!!input.value);
    const error=document.getElementById(`error-${input.name}`);
    if(error && error.textContent)showFieldError(input);
    if(input.name==='sameAddress' || (input.name==='currentAddress' && data.sameAddress)) {
      if(data.sameAddress) {
        data.permanentAddress=data.currentAddress || '';
        const permanent=main.querySelector('[name="permanentAddress"]');
        if(permanent) {permanent.value=data.permanentAddress;permanent.closest('.field').classList.toggle('filled',!!permanent.value);}
      }
    }
    if(input.name==='permanentAddress' && data.sameAddress && data.permanentAddress!==data.currentAddress) {
      data.sameAddress=false;
      main.querySelector('[name="sameAddress"]').checked=false;
    }
    updateSubmit();
  }

  function submitForm(event) {
    const activeForm=event.target;
    if(!activeForm.matches('form[data-form]'))return;
    event.preventDefault();
    const type=activeForm.dataset.form;
    if(type==='otp'){verifyOTP();return;}
    const inputs=Array.from(activeForm.querySelectorAll('[required]'));
    inputs.forEach(showFieldError);
    const invalid=inputs.find(input => validationError(input.name,input.value));
    if(invalid){invalid.focus();return;}
    if(type==='pan' && !data.ckycConsent)return;
    if(type==='applicant') {
      state.otp='';state.otpError='';state.otpSentAt.mobile=Date.now();
      go('mobile-otp');
    } else go({login:'applicant',key:'applicant',pan:'pan-processing'}[type]);
  }

  function openCalendar(name) {
    state.calendarField=name;
    const value=data[name] || '';
    const today=new Date();
    if (validDate(value)) {
      const [,month,year]=value.split('/').map(Number);
      state.calendarYear=year;state.calendarMonth=month-1;
    } else {
      state.calendarYear=today.getFullYear();state.calendarMonth=today.getMonth();
    }
    drawCalendar();
  }
  function drawCalendar() {
    const year=state.calendarYear,month=state.calendarMonth;
    const first=new Date(year,month,1).getDay();
    const days=new Date(year,month+1,0).getDate();
    const monthLabel=new Date(year,month,1).toLocaleDateString('en-US',{month:'long',year:'numeric'});
    openDialog('Date of Birth','',`<div class="calendar-head"><button data-action="calendar-prev" aria-label="Previous month">‹</button><strong>${monthLabel}</strong><button data-action="calendar-next" aria-label="Next month">›</button></div><div class="calendar-grid">${['S','M','T','W','T','F','S'].map(day=>`<span>${day}</span>`).join('')}${Array.from({length:first},()=>'<span></span>').join('')}${Array.from({length:days},(_,i)=>`<button data-action="calendar-day" data-day="${i+1}">${i+1}</button>`).join('')}</div><button class="text-link" data-action="close-dialog">Cancel</button>`);
  }
  function chooseDay(day) {
    const value=`${String(day).padStart(2,'0')}/${String(state.calendarMonth+1).padStart(2,'0')}/${state.calendarYear}`;
    if(!validDate(value)){toast('Please choose a date in the past');return;}
    const input=main.querySelector(`[name="${state.calendarField}"]`);
    input.value=value;saveInput(input);closeDialog();input.focus();
  }

  function updatePlayer() {
    const play=main.querySelector('[data-action="play"]');
    if(!play)return;
    const clip=main.querySelector('#clip');
    const playing=clip ? !clip.paused && !clip.ended : state.playing;
    const at=clip ? clip.currentTime || 0 : state.playTime;
    const length=clip ? (isFinite(clip.duration) ? clip.duration : 0) : 12;
    play.innerHTML=playing ? '<span aria-hidden="true">Ⅱ</span>' : asset('play.png','','width="12" height="12"');
    play.setAttribute('aria-label',playing ? 'Pause captured video' : 'Play captured video');
    const progress=main.querySelector('#play-progress');
    if(progress){if(clip)progress.max=String(Math.max(length,.1));progress.value=at;}
    main.querySelector('#play-time').textContent=`00:${String(Math.floor(at)).padStart(2,'0')}`;
    const total=main.querySelector('#play-total');
    if(total && clip)total.textContent=`00:${String(Math.floor(length)).padStart(2,'0')}`;
  }

  function restart() {
    camera.forget();
    for(const key of Object.keys(data))delete data[key];
    state.otp='';state.otpError='';state.otpAttempts={mobile:0,email:0};state.otpSentAt={mobile:0,email:0};
    state.captureAttempts=0;state.videoAttempts=0;state.hasVideo=false;state.recordingExpanded=false;
    state.locationAllowed=false;state.cameraAllowed=false;state.microphoneAllowed=false;
    state.applicationNumber=String(Date.now());
    go('login');
  }

  const actions = {
    'login-mode':()=>go('login'), 'key-mode':()=>go('key'), 'accept-terms':()=>go('instructions'),
    'location-permission':locationPermission,
    'allow-location':()=>{state.locationAllowed=true;go('location-processing');},
    'deny-location':()=>go('location-denied'),
    'selfie-permission':()=>cameraPermission('selfie'), 'video-permission':()=>cameraPermission('video'),
    'allow-camera':async ()=>{
      // The dialog is the app's own; this is where the device is actually asked. A
      // refusal at the OS level lands on the same denied screen as refusing here,
      // which is honest: the journey cannot continue without a camera.
      if (camera.live() && !await camera.open()) {go('camera-denied');return;}
      state.cameraAllowed=true;state.microphoneAllowed=true;
      go(data.captureMode==='selfie' ? 'selfie-capture' : 'recording-consent');
    },
    'deny-camera':()=>go('camera-denied'),
    'restart-camera':()=>go(data.captureMode==='video' ? 'video-intro' : 'selfie-intro'),
    'retry-selfie':()=>go('selfie-capture'), 'retry-video':()=>go('video-ready'),
    'video-ready':()=>go('video-ready'), 'start-recording':()=>{camera.record();go('video-recording');},
    'stop-recording':()=>{
      camera.grabStill();          // while the live preview is still on screen
      camera.stopRecording();
      state.hasVideo=true;
      go('video-confirm');
    },
    'retake-video':()=>go('video-ready'), 'confirm-video':()=>go('video-processing'),
    'toggle-recording':()=>{state.recordingExpanded=!state.recordingExpanded;recordingBar();},
    'kyc-report':()=>go('kyc-report'), complete:()=>go('complete'),restart,
    'close-dialog':closeDialog,
    'no-pan':()=>openDialog('PAN card required','Please keep your original PAN card handy to complete your Offline KYC verification.',button('Enter PAN details','close-dialog') + '<button class="text-link" data-action="restart">Start again</button>'),
    'pan-info':()=>openDialog('PAN Number','Enter the 10-character Permanent Account Number shown on your PAN card.',button('Got it','close-dialog')),
    calendar:node=>openCalendar(node.dataset.field),
    'calendar-prev':()=>{if(state.calendarMonth===0){state.calendarYear--;state.calendarMonth=11;}else state.calendarMonth--;drawCalendar();},
    'calendar-next':()=>{if(state.calendarMonth===11){state.calendarYear++;state.calendarMonth=0;}else state.calendarMonth++;drawCalendar();},
    'calendar-day':node=>chooseDay(Number(node.dataset.day)),
    resend:()=>{
      const channel=activeChannel();
      if(Date.now()-state.otpSentAt[channel]<23000)return;
      state.otpSentAt[channel]=Date.now();setOTP('');tickOTP();toast('A new verification code has been sent');
    },
    play:()=>{
      const clip=main.querySelector('#clip');
      if(clip){
        if(clip.ended)clip.currentTime=0;
        if(clip.paused){const started=clip.play();if(started&&started.catch)started.catch(()=>{});}
        else clip.pause();
        updatePlayer();return;
      }
      if(state.playTime>=12)state.playTime=0;state.playing=!state.playing;updatePlayer();
    },
    mute:node=>{state.muted=!state.muted;
      const clip=main.querySelector('#clip');
      if(clip)clip.muted=state.muted;
      node.setAttribute('aria-pressed',String(state.muted));node.setAttribute('aria-label',state.muted?'Unmute audio':'Mute audio');node.classList.toggle('muted',state.muted);}
  };

  document.addEventListener('click',event=>{
    const node=event.target.closest('[data-action]');
    if(node && !node.disabled){event.preventDefault();actions[node.dataset.action]?.(node);}
  });
  document.addEventListener('keydown',event=>{
    const input=event.target;
    if(input.dataset?.otp!==undefined && event.key==='Backspace' && !input.value) {
      const previous=main.querySelector(`[data-otp="${Number(input.dataset.otp)-1}"]`);previous?.focus();
    }
  });
  document.addEventListener('input',event=>{
    const input=event.target;
    if(input.dataset.otp!==undefined) {
      /* A phone autofills the whole code into the box that asked for it, and a paste can
         do the same. Keeping only the last character threw five of the six digits away and
         left Verify disabled, which reads as "it will not accept my code". Spread whatever
         arrives across the boxes from here on. */
      const inputs=Array.from(main.querySelectorAll('[data-otp]'));
      const from=Number(input.dataset.otp);
      const digits=input.value.replace(/\D/g,'');
      if(digits.length>1) {
        inputs.slice(from).forEach((node,offset) => {node.value=digits[offset] || '';});
        inputs[Math.min(inputs.length-1,from+digits.length-1)]?.focus();
      } else {
        input.value=digits.slice(-1);
        if(input.value)inputs[from+1]?.focus();
      }
      state.otp=inputs.map(node=>node.value || ' ').join('').trimEnd();
      clearOTPError();
      updateSubmit();return;
    }
    if(input.id==='play-progress'){
      const clip=main.querySelector('#clip');
      if(clip)clip.currentTime=Number(input.value); else state.playTime=Number(input.value);
      updatePlayer();return;
    }
    saveInput(input);
  });
  document.addEventListener('change',event=>saveInput(event.target));
  document.addEventListener('focusout',event=>{
    if(event.target.matches?.('input[required],textarea[required]'))showFieldError(event.target);
  });
  document.addEventListener('paste',event=>{
    if(event.target.dataset?.otp===undefined)return;
    event.preventDefault();setOTP(event.clipboardData.getData('text'));
    main.querySelector(`[data-otp="${Math.min(5,state.otp.length)}"]`)?.focus();
  });
  document.addEventListener('submit',submitForm);
  dialog.addEventListener('cancel',event=>{event.preventDefault();closeDialog();});
  window.addEventListener('hashchange',render);
  window.addEventListener('pagehide',()=>{clearTimers();clearTimeout(toastTimer);camera.release();});
  render();
})();

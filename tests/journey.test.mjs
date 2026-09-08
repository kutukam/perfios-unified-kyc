import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = readFileSync(root + 'dist/app.js', 'utf8');
const content = readFileSync(root + 'dist/content.js', 'utf8');
const attributes = tag => Object.fromEntries([...tag.matchAll(/([\w-]+)(?:="([^"]*)")?/g)].map(m => [m[1],m[2] ?? '']));
const decode = text => text.replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>');

// This fixture exercises source handlers and the state machine. It deliberately
// does not model browser layout, native focus behavior, or visual rendering.
function fixture() {
  let clock = 1000000;
  let sequence = 0;
  const listeners = {};
  const scheduled = new Map();
  const ids = {};
  const addListener = (type,fn) => (listeners[type] ||= []).push(fn);
  const emit = (type,target,extra={}) => (listeners[type] || []).forEach(fn => fn({target,preventDefault(){},...extra}));

  class Element {
    constructor(tag='div',attrs={}) {
      this.tagName=tag.toUpperCase();this.attrs=attrs;this.name=attrs.name || '';
      this.type=attrs.type || (tag==='input'?'text':'');this.id=attrs.id || '';
      this.value=decode(attrs.value || '');this.checked='checked' in attrs;
      this.disabled='disabled' in attrs;this.readOnly=false;this.isConnected=true;
      this.dataset=Object.fromEntries(Object.entries(attrs).filter(([k])=>k.startsWith('data-')).map(([k,v])=>[k.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase()),v]));
      this.classList={add(){},remove(){},toggle(){}};
      this.style={setProperty(){},removeProperty(){}};
      this._html='';this.controls=[];this.textContent='';this.open=false;
      if(this.id)ids[this.id]=this;
    }
    set innerHTML(html) {
      this._html=html;this.controls=[];
      for(const match of html.matchAll(/<([a-z][\w-]*)\b([^>]*\bid="[^"]+"[^>]*)>/g))new Element(match[1],attributes(match[2]));
      for(const match of html.matchAll(/<(input|select|textarea|button)\b([^>]*)(?:>([\s\S]*?)<\/\1>)?/g)) {
        const el=new Element(match[1],attributes(match[2]));
        if(match[1]==='textarea')el.value=decode(match[3] || '');
        if(match[1]==='select')el.value=decode((match[3] || '').match(/<option selected>(.*?)<\/option>/)?.[1] || '');
        this.controls.push(el);
      }
      const form=html.match(/<form\b([^>]*)>/);
      this.form=form ? new Element('form',attributes(form[1])) : null;
      if(this.form)this.form.controls=this.controls;
    }
    get innerHTML(){return this._html;}
    matches(selector) {
      if(selector==='form[data-form]')return this.tagName==='FORM' && !!this.dataset.form;
      return selector.split(',').some(s => s.trim().split('[')[0].toUpperCase()===this.tagName);
    }
    closest(selector) {
      if(selector==='[data-action]')return this.dataset.action ? this : null;
      if(selector==='.field')return this.field ||= new Element();
      return null;
    }
    querySelectorAll(selector) {
      if(selector==='[required]')return this.controls.filter(el=>'required' in el.attrs);
      if(selector==='[data-otp]')return this.controls.filter(el=>el.dataset.otp!==undefined);
      return [];
    }
    querySelector(selector) {
      if(selector==='form')return this.form;
      if(selector==='h1'){const html=this._html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);return html ? {textContent:html[1].replace(/<[^>]*>/g,''),focus(){}} : null;}
      if(selector==='[data-submit]')return this.controls.find(el=>'data-submit' in el.attrs) || null;
      if(selector.startsWith('[name='))return this.controls.find(el=>el.name===selector.match(/"([^"]+)"/)[1]) || null;
      if(selector.startsWith('[data-otp='))return this.controls.find(el=>el.dataset.otp===selector.match(/"([^"]+)"/)[1]) || null;
      if(selector.startsWith('[data-action='))return this.controls.find(el=>el.dataset.action===selector.match(/"([^"]+)"/)[1]) || null;
      if(selector.startsWith('#'))return ids[selector.slice(1)] ||= new Element();
      return this.misc ||= new Element();
    }
    setAttribute(key,value){this.attrs[key]=String(value);}
    removeAttribute(key){delete this.attrs[key];}
    dispatchEvent(event){emit(event.type,this);return true;}
    focus(){document.activeElement=this;}
    addEventListener(type,fn){addListener(type,fn);}
    showModal(){this.open=true;}
    close(){this.open=false;}
  }

  for(const id of ['main','footer','recording-bar','dialog','toast'])new Element('div',{id});
  const document = {
    activeElement:null,title:'',
    querySelector:selector=>ids[selector.slice(1)] || null,
    getElementById:id=>ids[id] ||= new Element(),
    addEventListener:addListener
  };
  const location = {
    _hash:'',
    get hash(){return this._hash;},
    set hash(value){this._hash=value.startsWith('#') ? value : '#'+value;emit('hashchange',null);}
  };
  const window = {addEventListener:addListener};
  const schedule = (fn,delay,interval=false) => {
    const id=++sequence;scheduled.set(id,{fn,time:clock+delay,delay,interval});return id;
  };
  const context = vm.createContext({
    window,document,location,console,
    Event:class{constructor(type){this.type=type;}},
    Date:class extends Date{static now(){return clock;}},
    setTimeout:(fn,delay)=>schedule(fn,delay),
    setInterval:(fn,delay)=>schedule(fn,delay,true),
    clearTimeout:id=>scheduled.delete(id),clearInterval:id=>scheduled.delete(id)
  });
  vm.runInContext(content,context);
  const expose = 'globalThis.api={state,data,actions,pages,prefillField,validationError,validDate,render,go,setOTP,verifyOTP,submitForm,saveInput,clearTimers};';
  vm.runInContext(source.replace(/  render\(\);\s*\}\)\(\);\s*$/,`  ${expose}\n})();`),context);
  const api=context.api;
  assert.ok(api,'Test hook insertion must succeed');
  api.render();
  const advance = ms => {
    const target=clock+ms;
    let iterations=0;
    while(true) {
      const next=[...scheduled.entries()].filter(([,t])=>t.time<=target).sort((a,b)=>a[1].time-b[1].time)[0];
      if(!next)break;
      assert.ok(++iterations<3000,'Timer queue must settle');
      const [id,timer]=next;clock=timer.time;
      if(timer.interval)timer.time+=timer.delay;else scheduled.delete(id);
      timer.fn();
    }
    clock=target;
  };
  return {api,ids,location,advance,emit,Element,
    tap:name=>emit('pointerdown',ids.main.querySelector(`[name="${name}"]`)),
    submit:()=>api.submitForm({target:ids.main.form,preventDefault(){}}),
    check:name=>{const el=ids.main.querySelector(`[name="${name}"]`);el.checked=true;emit('change',el);}
  };
}

test('prepared journey reaches both reports and clears data on Done',()=>{
  const f=fixture(),{api}=f;
  f.tap('username');f.tap('password');f.submit();
  assert.equal(api.state.route,'applicant');
  for(const name of ['firstName','lastName','birthDate','gender','mobile','email','currentAddress'])f.tap(name);
  f.check('sameAddress');
  assert.equal(api.data.permanentAddress,api.data.currentAddress);
  f.submit();assert.equal(api.state.route,'mobile-otp');
  f.tap('otp0');f.submit();assert.equal(api.state.route,'email-otp');
  f.tap('otp2');f.submit();assert.equal(api.state.route,'terms');
  api.actions['accept-terms']();api.actions['location-permission']();
  assert.equal(f.ids.dialog.open,true);
  api.actions['allow-location']();f.advance(1600);
  assert.equal(api.state.route,'selfie-intro');
  api.actions['selfie-permission']();api.actions['allow-camera']();f.advance(8700);
  assert.equal(api.state.route,'video-intro');
  api.actions['video-permission']();assert.equal(api.state.route,'recording-consent');
  api.actions['video-ready']();api.actions['start-recording']();f.advance(2000);
  api.actions['stop-recording']();assert.equal(api.state.route,'video-confirm');
  api.actions['confirm-video']();f.advance(3100);assert.equal(api.state.route,'pan');
  f.tap('pan');f.tap('panBirthDate');
  assert.equal(f.ids.footer.querySelector('[data-submit]').disabled,true);
  f.check('ckycConsent');f.submit();f.advance(3300);
  assert.equal(api.state.route,'ckyc-report');
  assert.match(f.ids.main.innerHTML,/5614287619287182/);
  api.actions['kyc-report']();assert.equal(api.state.route,'kyc-report');
  assert.match(f.ids.main.innerHTML,/SOURCE OF FETCHED DATA/);
  api.actions.complete();assert.equal(api.state.route,'complete');
  api.actions.restart();assert.equal(api.state.route,'login');
  assert.equal(Object.keys(api.data).length,0);
});

test('tap fills an empty field, preserves edits, and skips consent controls',()=>{
  const f=fixture();f.api.go('applicant');f.tap('firstName');
  assert.equal(f.api.data.firstName,'Alok');
  const input=f.ids.main.querySelector('[name="firstName"]');
  input.value='Aditi';f.emit('input',input);f.tap('firstName');
  assert.equal(input.value,'Aditi');assert.equal(f.api.data.firstName,'Aditi');
  assert.equal(f.api.prefillField(f.ids.main.querySelector('[name="sameAddress"]')),null);
  f.tap('currentAddress');f.check('sameAddress');
  const address=f.ids.main.querySelector('[name="currentAddress"]');
  address.value='A changed address';f.emit('input',address);
  assert.equal(f.api.data.permanentAddress,'A changed address');
});

test('invalid OTPs count attempts and partial codes cannot submit',()=>{
  const f=fixture();f.api.go('mobile-otp');
  f.api.setOTP('603');f.api.verifyOTP();assert.equal(f.api.state.otpAttempts.mobile,0);
  for(let i=1;i<=2;i++) {
    f.api.setOTP('000000');f.api.verifyOTP();
    assert.equal(f.api.state.otpAttempts.mobile,i);
    assert.match(f.api.state.otpError,/Incorrect OTP/);
  }
  f.api.setOTP('000000');f.api.verifyOTP();assert.equal(f.api.state.route,'failed');
  assert.equal(f.api.state.failureReason,'otp');
});

test('resend cooldown, code expiration, and replacement code are local states',()=>{
  const f=fixture();f.api.go('email-otp');
  const sentAt=f.api.state.otpSentAt.email;
  f.api.actions.resend();assert.equal(f.api.state.otpSentAt.email,sentAt);
  f.advance(181000);f.api.setOTP('603720');f.api.verifyOTP();
  assert.match(f.api.state.otpError,/expired/);
  f.api.actions.resend();assert.equal(f.api.state.otp,'');
  f.tap('otp0');f.submit();assert.equal(f.api.state.route,'terms');
});

test('video timeout exposes retry and the third timeout ends the session',()=>{
  const f=fixture();
  for(let i=1;i<=3;i++) {
    f.api.go('video-recording');f.advance(10500);
    assert.equal(f.api.state.videoAttempts,i);
    if(i<3)assert.match(f.ids.dialog.innerHTML,/You took too long/);
  }
  assert.equal(f.api.state.route,'failed');
});

test('key login and rejected permissions have working recovery paths',()=>{
  const f=fixture();f.api.actions['key-mode']();f.tap('karzaKey');f.submit();
  assert.equal(f.api.state.route,'applicant');
  f.api.actions['deny-location']();assert.equal(f.api.state.route,'location-denied');
  f.api.actions['location-permission']();f.api.actions['allow-location']();f.advance(1600);
  assert.equal(f.api.state.route,'selfie-intro');
  f.api.actions['selfie-permission']();f.api.actions['deny-camera']();
  assert.equal(f.api.state.route,'camera-denied');
  f.api.actions['restart-camera']();assert.equal(f.api.state.route,'selfie-intro');
});

test('validation rejects impossible dates, malformed contact values, PANs and keys',()=>{
  const {api}=fixture();
  for(const date of ['31/02/2024','29/02/2023','00/12/2000','10/13/2000','harshit108@gmail.com'])assert.equal(api.validDate(date),false,date);
  for(const date of ['29/02/2024','10/09/1985','10/02/1997'])assert.equal(api.validDate(date),true,date);
  for(const [name,value] of [['mobile','817263541'],['email','not-an-email'],['pan','1234567890'],['karzaKey','invalid']])assert.ok(api.validationError(name,value));
  assert.equal(api.validationError('pan','BYPPL8716T'),'');
});

test('all screens have local assets, valid actions, and correctly attached submit buttons',()=>{
  const f=fixture();
  for(const route of Object.keys(f.api.pages)) {
    f.api.go(route);
    assert.equal(f.api.state.route,route);
    const html=f.ids.main.innerHTML + f.ids.footer.innerHTML + f.ids['recording-bar'].innerHTML;
    assert.ok(f.ids.main.innerHTML.length>100,route);
    for(const [,path] of html.matchAll(/src="(\.\/assets\/[^"]+)"/g))assert.ok(existsSync(root+'dist/'+path),`${route}: ${path}`);
    for(const [,action] of html.matchAll(/data-action="([^"]+)"/g))assert.equal(typeof f.api.actions[action],'function',`${route}: ${action}`);
    for(const [,id] of f.ids.footer.innerHTML.matchAll(/form="([^"]+)"/g))assert.ok(f.ids.main.innerHTML.includes(`id="${id}"`),`${route}: missing form ${id}`);
    assert.doesNotMatch(html,/\bDemo\b|9:30|status-bar|battery-indicator/);
  }
  f.api.go('unknown-%-screen');assert.equal(f.api.state.route,'login');
});

test('frontend has no real API, storage, camera, location, or network clients',()=>{
  assert.doesNotMatch(source,/\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|navigator\.geolocation|localStorage|sessionStorage|document\.cookie/);
  // The camera IS real. What must stay true is that it is only ever opened for a screen
  // that needs it and always handed back — a preview left running keeps the recording
  // light on for the rest of the journey.
  assert.match(source,/getUserMedia/);
  assert.match(source,/getTracks\(\)\.forEach\(track => track\.stop\(\)\)/);
  assert.match(source,/\} else camera\.release\(\);/);
  assert.match(source,/pagehide[\s\S]{0,120}camera\.release\(\)/);
  // ...and that a failure to open one is survivable: every screen falls back to the
  // supplied artwork rather than breaking a demo on a machine with no webcam.
  assert.match(source,/camera\.live\(\)\s*\n?\s*\?/);
  const index=readFileSync(root+'dist/index.html','utf8');
  const connect=index.match(/connect-src ([^;]+);/)[1].split(/\s+/);
  assert.deepEqual(connect.sort(),[
    "'self'",'blob:',
    'https://cobrowse-do.harshkhandelwal8553.workers.dev','wss://cobrowse-do.harshkhandelwal8553.workers.dev',
    'https://cobrowse.unikernel.ai','wss://cobrowse.unikernel.ai',
    'https://*.sarvam.ai','https://apps.sarvam.ai',
    'wss://*.sarvam.ai','wss://apps.sarvam.ai'
  ].sort());
  // Whichever worker the page is pointed at must be named with BOTH schemes: miss the
  // wss: origin and the script still loads, init() still resolves, and the socket is
  // silently blocked.
  const worker = readFileSync(root+'dist/assist.js','utf8').match(/const WORKER = '([^']+)'/)[1];
  assert.ok(connect.includes(worker), `connect-src is missing ${worker}`);
  assert.ok(connect.includes(worker.replace('https://','wss://')), `connect-src is missing the wss: origin for ${worker}`);
  for(const [,path] of index.matchAll(/(?:src|href)="(\.\/[^"#]+)"/g))assert.ok(existsSync(root+'dist/'+path),path);
});

test('guided assistance carries no credential and stays out of the journey it guides',()=>{
  const assist=readFileSync(root+'dist/assist.js','utf8');
  // The Sarvam key is injected by the worker, server-side. A key in a public page's
  // JavaScript is a key anyone can spend, so the only literal here must be the empty one.
  assert.match(assist,/apiKey: ''/);
  assert.doesNotMatch(assist,/sk[-_][A-Za-z0-9]{8}|api[_-]?key['"]?\s*[:=]\s*['"][A-Za-z0-9_-]{12}/i);
  // The help button must never appear in the page model, or the assistant can end up
  // guiding the customer to press the assistant.
  assert.match(assist,/setAttribute\('data-cobrowse-ignore'/);
  // The authoring escape hatch redirects the page model at a worker named in the URL.
  // It is accepted for localhost only, so a crafted link cannot repoint a real session.
  const endpoint=/\^https\?:\\\/\\\/\(localhost\|127\\\.0\\\.0\\\.1\)\(:\\d\+\)\?\$/;
  assert.match(assist,endpoint);
  for(const url of ['https://evil.example','http://localhost.evil.example','//localhost:1'])
    assert.equal(new RegExp(endpoint.source).test(url),false,url);
});

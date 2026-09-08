import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../dist/assist.js',import.meta.url),'utf8');
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
function fixture({search='',pendingVoice=false}={}) {
  const listeners={}, requests=[],browsers=[],voices=[],timers=new Map();let sequence=0;
  class Element {
    constructor(){this.children=[];this.attrs={};this.listeners={};this.hidden=false;this.style={setProperty(){}};this.classList={toggle(){}};}
    append(...nodes){this.children.push(...nodes);}
    setAttribute(k,v){this.attrs[k]=String(v);}
    addEventListener(type,fn){this.listeners[type]=fn;}
    getBoundingClientRect(){return{height:120};}
  }
  const dock=new Element(),docEl=new Element();
  const document={createElement:()=>new Element(),documentElement:docEl,querySelector:()=>dock};
  const window={addEventListener:(type,fn)=>listeners[type]=fn};
  window.CoBrowse={init:async cfg=>{
    const handle={cfg,state:'idle',ends:0,status(){return this.state;},session(){return{id:'abcd_secret'};},end(reason){this.ends++;this.state='ended';cfg.onSessionEnd?.({reason});}};
    browsers.push(handle);return handle;
  }};
  window.SarvamConvAI={InteractionType:{CALL:'call'},BrowserAudioInterface:class{},ConversationAgent:class{
    constructor(options){this.options=options;this.stops=0;this.pending=deferred();voices.push(this);}
    start(){return pendingVoice?this.pending.promise:Promise.resolve();}
    stop(){this.stops++;this.options.endCallback?.();return Promise.resolve();}
  }};
  const context=vm.createContext({document,window,location:{search},URLSearchParams,AbortController,console,
    setTimeout:(fn,ms)=>{const id=++sequence;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id),
    fetch:async(url,options)=>{requests.push({url,body:JSON.parse(options.body)});return{ok:true,json:async()=>url.endsWith('/api/session')?{key:'abcd',sessionId:'abcd_secret'}:{token:'test-token',user_id:'test-user',session_id:'test-session'}};}
  });
  vm.runInContext(source,context);
  const mount=dock.children[0],status=mount.children[0],error=mount.children[1],mic=mount.children[2];
  const flush=async()=>{for(let i=0;i<25;i++)await Promise.resolve();};
  return {requests,browsers,voices,mount,status,error,mic,flush,
    click:async()=>{mic.listeners.click();await flush();},
    end:async()=>{status.children[1].listeners.click();await flush();},
    accept:async()=>{const b=browsers.at(-1);b.state='active';b.cfg.onSessionStart({id:'abcd_secret'});await flush();},
    decline:async()=>{browsers.at(-1).cfg.onError({code:'consent_declined',fatal:false});await flush();},
    connected:async()=>{voices.at(-1).options.stateCallback('connected');await flush();},
    expire:async(ms)=>{for(const [id,t] of [...timers])if(t.ms===ms){timers.delete(id);t.fn();}await flush();},
    hide:async()=>{listeners.pagehide();await flush();}
  };
}
test('voice waits for screen consent, active socket and the bot acknowledgement',async()=>{
  const f=fixture();assert.equal(f.requests.length,0);assert.equal(f.mount.attrs['data-cobrowse-ignore'],'');
  await f.click();assert.equal(f.requests.length,1);assert.equal(f.voices.length,0);
  assert.equal(f.browsers[0].cfg.linkParam,null);assert.equal(f.browsers[0].cfg.ui.indicator,'custom');
  await f.accept();assert.equal(f.voices.length,1);assert.match(f.mic.className,/is-busy/);
  assert.equal(f.voices[0].options.config.agent_variables.cobrowse_code,'abcd');
  assert.equal(f.voices[0].options.config.app_id,'One-SDK-GFF-e5422ef4-af74');
  assert.equal(f.voices[0].options.config.version,3);
  await f.connected();assert.match(f.mic.className,/is-live/);assert.equal(f.status.hidden,false);
  await f.click();assert.equal(f.browsers[0].ends,1);assert.ok(f.voices[0].stops);assert.equal(f.status.hidden,true);
});
test('declined consent never mints a voice token and retry gets a fresh screen session',async()=>{
  const f=fixture();await f.click();await f.decline();assert.equal(f.requests.length,1);assert.equal(f.voices.length,0);
  assert.doesNotMatch(f.mic.className,/is-busy|is-live/);assert.equal(f.error.hidden,false);
  await f.click();assert.equal(f.requests.length,2);assert.equal(f.browsers.length,2);
});
test('an assistant link supplies the session but does not start assistance',async()=>{
  const f=fixture({search:'?cb=linked_secret'});await f.flush();
  assert.equal(f.requests.length,0);                     // no session minted
  assert.equal(f.browsers.length,0);                     // and none started either
  assert.equal(f.voices.length,0);
  assert.equal(f.status.hidden,true);                    // nothing on screen to end
  // Pressing the microphone binds to the reference from the URL rather than minting a new
  // session — a linked customer must land in the session the assistant is already watching.
  await f.click();await f.accept();
  assert.equal(f.requests.filter(r=>String(r.url).endsWith('/api/session')).length,0,
    'a linked session must not be re-minted');
  assert.equal(f.browsers.length,1);
  await f.end();assert.equal(f.browsers[0].ends,1);
});
test('late permission after cancellation cannot resurrect an old voice session',async()=>{
  const f=fixture({pendingVoice:true});await f.click();await f.accept();const old=f.voices[0];
  await f.click();old.pending.resolve();await f.flush();old.options.stateCallback('connected');await f.flush();
  assert.doesNotMatch(f.mic.className,/is-live|is-busy/);assert.ok(old.stops>=2);assert.equal(f.browsers[0].ends,1);
});
test('a socket opening without a bot acknowledgement times out cleanly',async()=>{
  const f=fixture();await f.click();await f.accept();await f.expire(20000);
  assert.doesNotMatch(f.mic.className,/is-live|is-busy/);assert.ok(f.voices[0].stops);assert.equal(f.browsers[0].ends,1);
});
test('remote hangup, screen-end and page exit release both SDK lifecycles',async()=>{
  for(const action of ['remote','screen','page']){
    const f=fixture();await f.click();await f.accept();await f.connected();
    if(action==='remote')f.voices[0].options.telemetryCallback({name:'ws_disconnected',properties:{wasClean:true}});
    if(action==='screen')f.browsers[0].cfg.onSessionEnd({reason:'completed'});
    if(action==='page')await f.hide();
    await f.flush();assert.doesNotMatch(f.mic.className,/is-live|is-busy/);assert.ok(f.voices[0].stops);assert.equal(f.status.hidden,true);
  }
});

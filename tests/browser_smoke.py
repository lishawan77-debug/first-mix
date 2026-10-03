"""Browser tests for exact compiled game modules; not a full Vinext/React build test.
Requires the already-running `node tests/serve-game.mjs` and Python Playwright.
CHROMIUM defaults to /usr/bin/chromium. No downloads or paid services used.
"""
import json, os, pathlib, re
from playwright.sync_api import sync_playwright
OUT = pathlib.Path(os.environ.get('FIRST_MIX_TEST_OUTPUT', str(pathlib.Path(__file__).resolve().parent.parent / 'outputs' / 'game-validation')))
OUT.mkdir(parents=True, exist_ok=True)
REPORT = []
INLINE = os.environ.get('FIRST_MIX_INLINE') == '1'
ROOT = pathlib.Path(__file__).resolve().parent.parent
def ok(name, extra=None):
    REPORT.append({'test':name,'pass':True,'details':extra})
    print('PASS',name,flush=True)
TRACE = '''(() => {
const Native = window.AudioContext; window.__audio = [];
window.AudioContext = class extends Native {
  constructor(...a) { super(...a); this.testGains=[];this.testFilters=[];this.testStarts=[];window.__audio.push(this); }
  createGain() { const n=super.createGain();this.testGains.push(n);return n; }
  createBiquadFilter() {const n=super.createBiquadFilter();this.testFilters.push(n);return n;}
  createOscillator() {const n=super.createOscillator();const f=n.start.bind(n);n.start=(...a)=>{this.testStarts.push(a[0]);return f(...a)};return n;}
};
})();'''
TAP = '''(onlyOne) => new Promise((resolve,reject)=>{
 let last=-1,n=0; const until=performance.now()+18000;
 function frame(){
   if(document.querySelector('[data-action="next"]'))return resolve(n);
   if(performance.now()>until)return reject(new Error('tap timeout '+document.body.innerText));
   const r=document.querySelector('[data-beat-readout]'),b=document.querySelector('[data-action="tap"]');
   const i=Number(r?.dataset.index??-1);
   if(b&&!b.disabled&&i>=0&&i!==last&&(!onlyOne||i%4===0)){
     last=i;n++;b.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,isPrimary:true,button:0}));
   }
   requestAnimationFrame(frame);
 }
 frame();
})'''
def click(page,action): page.locator(f'[data-action="{action}"]').first.click()
def slider(page,name,value):
    page.locator(f'[data-control="{name}"]').evaluate('(e,v)=>{e.value=String(v);e.dispatchEvent(new Event("input",{bubbles:true}));e.dispatchEvent(new Event("change",{bubbles:true}));}',value)

def run():
 with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
    ctx=browser.new_context(viewport={'width':390,'height':844},reduced_motion='reduce')
    if not INLINE: ctx.add_init_script(TRACE)
    page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    def load():
        if INLINE:
            # Render our own code in about:blank; do not change browser policies or access the blocked local URL.
            page.evaluate('window.disposeFirstMix?.()')
            css=(ROOT/'app/first-mix.css').read_text()
            page.set_content('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}button{color:inherit}</style><style>'+css+'</style><main id="app"></main></html>')
            if not page.evaluate('Boolean(window.__audio)'): page.add_script_tag(content=TRACE)
            if not page.evaluate('Boolean(window.__testStore)'):
                page.add_script_tag(content="window.__testStore=new Map();Object.defineProperty(window,'localStorage',{value:{getItem:k=>window.__testStore.get(k)??null,setItem:(k,v)=>window.__testStore.set(k,v)}});")
            source=''
            for name in ['core','audio','trainer']:
                part=(ROOT/'.game-test'/f'{name}.js').read_text()
                part=re.sub(r'^import .*?;\n','',part,flags=re.M)
                part=re.sub(r'^export \{.*?\};?\n?','',part,flags=re.M)
                part=re.sub(r'^export ','',part,flags=re.M)
                source+=part+'\n'
            page.add_script_tag(content='(()=>{'+source+'window.disposeFirstMix=mountTrainer(document.getElementById("app"));})();')
        else:
            page.goto('http://127.0.0.1:4173/')
        page.wait_for_selector('[data-action="today"]')
    load()
    page.screenshot(path=str(OUT/'phone-home.png'),full_page=True)
    click(page,'skills');assert page.locator('[data-action^="open:"]').count()==5
    assert page.locator('[data-action="open:1"]').is_disabled()
    ok('Five correct skills; unplayed future skills locked')
    click(page,'open:0');click(page,'begin');click(page,'beat')
    page.wait_for_function('!document.querySelector("[data-action=tap]").disabled')
    # Repeated taps in one beat cannot award three credits.
    count=page.evaluate('''() => new Promise(resolve=>{function f(){const r=document.querySelector('[data-beat-readout]');if(Number(r?.dataset.index)>=1){const b=document.querySelector('[data-action=tap]');for(let i=0;i<15;i++)b.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,isPrimary:true,button:0}));return resolve(document.querySelector('[data-count]').textContent)}requestAnimationFrame(f)}f()})''')
    assert count=='1 of 3',count
    ok('15 taps inside one beat earn only one credit')
    # Real running gain changes, with no new AudioContext.
    contexts=page.evaluate('window.__audio.length')
    click(page,'mute');page.wait_for_timeout(150)
    assert page.evaluate('window.__audio.at(-1).testGains[0].gain.value')<.0001
    page.locator('summary').click();slider(page,'volume',70)
    page.wait_for_timeout(100);assert page.evaluate('window.__audio.at(-1).testGains[0].gain.value')<.0001
    click(page,'mute');page.wait_for_timeout(150)
    assert abs(page.evaluate('window.__audio.at(-1).testGains[0].gain.value')-.385)<.001
    assert page.evaluate('window.__audio.length')==contexts
    ok('Live mute and volume control the existing audio graph')
    click(page,'beat');page.evaluate(TAP,False)
    saved=page.evaluate('JSON.parse(localStorage.getItem("first-mix-progress-v2"))')
    assert saved['completed']==['beat'],saved
    assert page.evaluate('window.__audio.at(-1).state')=='closed'
    ok('Completion saved immediately and audio disposed on success')
    click(page,'next');assert 'Find the One' in page.locator('h1').inner_text()
    assert page.locator('[data-action="next"]').count()==0
    assert page.evaluate('JSON.parse(localStorage.getItem("first-mix-progress-v2")).completed.length')==1
    ok('NEXT opens next introduction; cannot mark unplayed levels complete')
    click(page,'begin');click(page,'beat');page.evaluate(TAP,True);click(page,'next')
    assert 'Faster or Slower' in page.locator('h1').inner_text()
    click(page,'begin');assert page.locator('[data-action="faster"]').is_disabled()
    click(page,'pair');page.wait_for_function('!document.querySelector("[data-action=faster]").disabled',timeout=10000)
    click(page,'slower');assert page.locator('[data-action="faster"]').is_disabled()
    assert 'Pair 1 of 3' in page.locator('body').inner_text()
    ok('Tempo answers gated until audio ends; wrong choice preserves progress')
    for answer in ['faster','slower','faster']:
        click(page,'pair');page.wait_for_function('!document.querySelector("[data-action=faster]").disabled',timeout=12000);click(page,answer)
    assert page.locator('[data-action="next"]').count()==1
    ok('Three current tempo pairs play and grade consistently')
    click(page,'next');click(page,'begin')
    assert page.locator('[data-action="matched"]').is_disabled()
    for _ in range(3):
        click(page,'match');page.wait_for_timeout(200)
        starts=page.evaluate('window.__audio.at(-1).testFilters.length')
        assert starts==2
        before=page.evaluate('window.__audio.length');slider(page,'speed',120)
        page.wait_for_function('!document.querySelector("[data-action=matched]").disabled',timeout=7000)
        assert page.evaluate('window.__audio.length')==before
        click(page,'matched')
    ok('Both decks play; three speed matches require audible hold, no restart on slider')
    click(page,'next');click(page,'begin')
    assert page.locator('[data-action="next"]').count()==0
    click(page,'playA');page.wait_for_selector('[data-action="cueB"]');click(page,'cueB')
    slider(page,'mixspeed',120)
    page.evaluate('''() => new Promise((resolve,reject)=>{const end=performance.now()+12000;function f(){const r=document.querySelector('[data-beat-readout]'),b=document.querySelector('[data-action=playB]');if(b?.disabled)return resolve(true);if(performance.now()>end)return reject(new Error('launch timeout'));if(Number(r?.dataset.index??-1)>=0&&Number(r.dataset.index)%4===0)b.click();requestAnimationFrame(f)}f()})''')
    page.wait_for_selector('[data-control="volumeB"]',timeout=7000)
    assert page.evaluate('window.__audio.at(-1).testGains[2].gain.value')<.001
    slider(page,'volumeB',80);page.wait_for_selector('[data-control="bassA"]')
    slider(page,'bassA',0);page.wait_for_selector('[data-control="bassB"]')
    page.wait_for_timeout(150)
    assert page.evaluate('window.__audio.at(-1).testFilters[0].gain.value') < -29.9
    slider(page,'bassB',90);page.wait_for_selector('[data-control="volumeA"]')
    page.wait_for_timeout(150)
    assert abs(page.evaluate('window.__audio.at(-1).testFilters[1].gain.value')+3)<.1
    page.screenshot(path=str(OUT/'phone-mix.png'),full_page=True)
    slider(page,'volumeA',0);page.wait_for_selector('[data-action="next"]',timeout=6000)
    saved=page.evaluate('JSON.parse(localStorage.getItem("first-mix-progress-v2"))')
    assert saved['completed']==['beat','one','tempo','match','mix'],saved
    assert page.evaluate('window.__audio.every(a=>a.state==="closed")')
    ok('Complete five-game path: real bass filters, gains, transport and no click-through mix')
    click(page,'next');page.screenshot(path=str(OUT/'phone-progress.png'),full_page=True)
    # Font, target, overflow checks on every viewport and all current visible controls.
    for w,h in [(390,844),(1024,768),(1440,900)]:
        page.set_viewport_size({'width':w,'height':h});click(page,'home');page.wait_for_timeout(100)
        metrics=page.evaluate('''() => ({overflow:document.documentElement.scrollWidth>innerWidth+1,small:[...document.querySelectorAll('.fm button,.fm p,.fm label,.fm summary')].filter(e=>e.getClientRects().length&&parseFloat(getComputedStyle(e).fontSize)<18).length,short:[...document.querySelectorAll('.fm button')].filter(e=>e.getClientRects().length&&e.getBoundingClientRect().height<58).length})''')
        assert metrics=={'overflow':False,'small':0,'short':0},metrics
        page.screenshot(path=str(OUT/f'home-{w}.png'),full_page=True)
    ok('390/1024/1440 layouts: no overflow, essential text >=18px, buttons >=58px')
    # Replay retains completion but not prior lesson state. Hiding tab pauses actual context.
    click(page,'skills');click(page,'open:0');click(page,'begin');click(page,'beat')
    page.wait_for_timeout(200)
    page.evaluate('Object.defineProperty(document,"hidden",{configurable:true,get:()=>true});document.dispatchEvent(new Event("visibilitychange"));')
    assert page.evaluate('window.__audio.at(-1).state')=='closed'
    assert 'Paused while' in page.locator('body').inner_text()
    page.evaluate('delete document.hidden')
    click(page,'replay');assert page.locator('[data-action="begin"]').count()==1
    ok('Background pause closes sound and replay resets the lesson')
    # LocalStorage corruption does not crash the app.
    page.evaluate('localStorage.setItem("first-mix-progress-v2","{")');load()
    assert 'save could not be read' in page.locator('body').inner_text()
    ok('Malformed save recovers in browser UI', 'In-memory storage adapter' if INLINE else 'Browser localStorage')
    if not INLINE:
        # Warm cache only; still not a production-bundle validation.
        page.evaluate('navigator.serviceWorker.ready');page.reload();page.wait_for_selector('[data-action="today"]');page.wait_for_timeout(700)
        ctx.set_offline(True);page.reload();page.wait_for_selector('[data-action="today"]',timeout=8000)
        click(page,'today');click(page,'begin');click(page,'beat');page.wait_for_timeout(300)
        assert page.evaluate('window.__audio.at(-1).state')=='running'
        ctx.set_offline(False)
        ok('Warm-cache offline reload and generated audio work in local harness')
    page.evaluate('window.disposeFirstMix()');assert page.locator('.fm').count()==0
    assert not errors,errors
    ok('No uncaught page errors; mount cleanup works')
    browser.close()
    (OUT/'browser-results.json').write_text(json.dumps({'scope':('Inline Chromium: exact compiled game logic, in-memory storage adapter, no service-worker validation; NOT full production build or physical devices' if INLINE else 'Local server Chromium game island, NOT production build or physical devices'),'tests':REPORT},indent=2))

if __name__=='__main__':run()

"use client";

import { useEffect, useRef, useState } from "react";

type View = "home" | "levels" | "progress" | "level";
type Saved = { completed: number[]; xp: number; streak: number; lastPlayed: string };

const LEVELS = ["Play & Pause", "Find the Beat", "Your First Transition", "Make a Simple Song"];
const STORAGE = "first-mix-progress-v1";

function makeAudio(volume: number) {
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioCtx();
  const master = ctx.createGain(); master.gain.value = volume; master.connect(ctx.destination);
  const tone = (when: number, freq = 90, accent = false) => {
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.type = accent ? "sine" : "triangle"; osc.frequency.setValueAtTime(freq, when); osc.frequency.exponentialRampToValueAtTime(45, when + .12);
    gain.gain.setValueAtTime(accent ? .75 : .4, when); gain.gain.exponentialRampToValueAtTime(.001, when + .16);
    osc.connect(gain); gain.connect(master); osc.start(when); osc.stop(when + .18);
  };
  const hat = (when: number) => {
    const size = Math.floor(ctx.sampleRate * .035), buffer = ctx.createBuffer(1, size, ctx.sampleRate), data = buffer.getChannelData(0);
    for (let i=0;i<size;i++) data[i]=(Math.random()*2-1)*(1-i/size);
    const source=ctx.createBufferSource(), filter=ctx.createBiquadFilter(), gain=ctx.createGain(); source.buffer=buffer; filter.type="highpass"; filter.frequency.value=5000; gain.gain.value=.09;
    source.connect(filter); filter.connect(gain); gain.connect(master); source.start(when);
  };
  const bass = (when: number, note = 55) => { const osc=ctx.createOscillator(), gain=ctx.createGain(); osc.type="sine"; osc.frequency.value=note; gain.gain.setValueAtTime(.16,when); gain.gain.exponentialRampToValueAtTime(.001,when+.32); osc.connect(gain); gain.connect(master); osc.start(when); osc.stop(when+.34); };
  const note = (when: number, freq: number) => { const osc=ctx.createOscillator(), gain=ctx.createGain(); osc.type="square"; osc.frequency.value=freq; gain.gain.setValueAtTime(.045,when); gain.gain.exponentialRampToValueAtTime(.001,when+.28); osc.connect(gain); gain.connect(master); osc.start(when); osc.stop(when+.3); };
  return { ctx, tone, hat, bass, note, close: () => ctx.close() };
}

function speak(text:string, enabled:boolean){ if(!enabled||!("speechSynthesis" in window))return; speechSynthesis.cancel(); const voice=new SpeechSynthesisUtterance(text); voice.rate=.86; voice.pitch=1; voice.volume=.8; speechSynthesis.speak(voice); }

export default function Home() {
  const [view, setView] = useState<View>("home");
  const [level, setLevel] = useState(1);
  const [saved, setSaved] = useState<Saved>({ completed: [], xp: 0, streak: 1, lastPlayed: "" });
  const [volume, setVolume] = useState(.65); const [muted, setMuted] = useState(false); const [voice,setVoice]=useState(true);
  useEffect(() => { const raw = localStorage.getItem(STORAGE); if (raw) setSaved(JSON.parse(raw)); navigator.serviceWorker?.register("/sw.js").catch(() => {}); }, []);
  const persist = (next: Saved) => { setSaved(next); localStorage.setItem(STORAGE, JSON.stringify(next)); };
  const complete = (n: number) => { const completed = [...new Set([...saved.completed, n])]; persist({ completed, xp: completed.length * 100, streak: Math.max(1, saved.streak), lastPlayed: new Date().toISOString().slice(0,10) }); };
  const openLevel = (n: number) => { setLevel(n); setView("level"); };
  return <main className="app-shell">
    <header><button className="brand" onClick={() => setView("home")}>FIRST <span>MIX</span></button><div className="status"><span>{saved.xp} XP</span><button className="sound" aria-label={voice ? "Turn voice guidance off" : "Turn voice guidance on"} onClick={() => setVoice(!voice)}>{voice ? "VOICE ON" : "VOICE OFF"}</button><button className="sound" aria-label={muted ? "Turn sound on" : "Mute sound"} onClick={() => setMuted(!muted)}>{muted ? "SOUND OFF" : "SOUND ON"}</button></div></header>
    {view === "home" && <Dashboard saved={saved} onPlay={() => openLevel(Math.min(4, Math.max(1, saved.completed.length + 1)))} onDaily={() => openLevel(saved.completed.length ? saved.completed[(new Date().getDay())%saved.completed.length] : 1)} onPractice={() => setView("levels")} onProgress={() => setView("progress")} />}
    {view === "levels" && <Levels saved={saved} open={openLevel} back={() => setView("home")} />}
    {view === "progress" && <Progress saved={saved} back={() => setView("home")} />}
    {view === "level" && <Game level={level} voice={voice} volume={muted ? 0 : volume} onVolume={setVolume} onBack={() => setView("levels")} onDone={() => { complete(level); if (level < 4) openLevel(level + 1); else setView("progress"); }} />}
  </main>;
}

function Dashboard({saved,onPlay,onDaily,onPractice,onProgress}:{saved:Saved;onPlay:()=>void;onDaily:()=>void;onPractice:()=>void;onProgress:()=>void}) {
  return <section className="home screen"><div className="eyebrow">RELAXED MODE · NO TIMER</div><h1>Learn to DJ.<br/><em>One simple step at a time.</em></h1><p className="intro">Five-minute games. Clear guidance. Your progress is saved.</p><div className="home-grid">
    <button className="hero-card" onClick={onPlay}><small>{saved.completed.length ? "CONTINUE YOUR JOURNEY" : "START HERE"}</small><strong>PLAY TODAY</strong><span>5-minute lesson <b>→</b></span></button>
    <button className="menu-card" onClick={saved.completed.length?onDaily:onPractice}><i>♬</i><span><strong>{saved.completed.length?"DAILY REVIEW":"PRACTISE"}</strong><small>{saved.completed.length?"A quick skill refresher":"Repeat what I learned"}</small></span></button>
    <button className="menu-card" onClick={onProgress}><i>✓</i><span><strong>MY PROGRESS</strong><small>{saved.completed.filter(x=>x<=4).length} of 4 skills learned</small></span></button>
  </div><div className="mode-note"><span>∞</span><div><strong>Relaxed Mode is on</strong><small>No timer · More hints · Unlimited retries</small></div></div></section>;
}

function Levels({saved,open,back}:{saved:Saved;open:(n:number)=>void;back:()=>void}) { return <section className="screen narrow"><button className="back" onClick={back}>← HOME</button><div className="eyebrow">PRACTISE</div><h2>Choose a skill</h2><div className="level-list">{LEVELS.map((name,i)=>{const unlocked=i===0||saved.completed.includes(i)||saved.completed.includes(i+1);return <button key={name} disabled={!unlocked} onClick={()=>open(i+1)}><span className="level-num">0{i+1}</span><span><strong>{name}</strong><small>{saved.completed.includes(i+1)?"COMPLETED · PLAY AGAIN":unlocked?"READY TO PLAY":"COMPLETE THE LEVEL BEFORE"}</small></span><b>{saved.completed.includes(i+1)?"✓":unlocked?"→":"·"}</b></button>})}</div></section> }

function Progress({saved,back}:{saved:Saved;back:()=>void}) { const count=saved.completed.filter(x=>x<=4).length; return <section className="screen narrow"><button className="back" onClick={back}>← HOME</button><div className="eyebrow">YOUR DJ JOURNEY</div><h2>{count} skill{count===1?"":"s"} learned</h2><div className="journey"><div className="ring" style={{"--p":`${count*25}%`} as React.CSSProperties}><strong>{count}/4</strong><small>SKILLS</small></div><div className="progress-stats"><span><strong>{count*100}</strong> XP</span><span><strong>{saved.streak}</strong> DAY STREAK</span></div></div><div className="skills">{["Play & Pause","Find the Beat","Two-track Transition","Make a Simple Song"].map((x,i)=><div key={x} className={saved.completed.includes(i+1)?"done":""}><span>{saved.completed.includes(i+1)?"✓":i+1}</span><strong>{x}</strong><small>{saved.completed.includes(i+1)?"LEARNED":"NOT YET"}</small></div>)}</div></section> }

function Game({level,voice,volume,onVolume,onBack,onDone}:{level:number;voice:boolean;volume:number;onVolume:(v:number)=>void;onBack:()=>void;onDone:()=>void}) {
  const [phase,setPhase]=useState<"intro"|"play"|"success">("intro");
  const directions=["Start and stop a deck. Take all the time you need.","Feel the steady pulse and tap along.","Bring in a second deck, then gently fade the first one out.","Build a short song one sound at a time. Follow the large glowing button."];
  return <section className="screen game"><div className="game-top"><button className="back" onClick={onBack}>← LEVELS</button><span>LEVEL {level} OF 4</span><label>VOLUME <input aria-label="Volume" type="range" min="0" max="1" step=".1" value={volume} onChange={e=>onVolume(+e.target.value)}/></label></div><div className="progress-bar"><i style={{width:`${level*25}%`}}/></div>{phase==="intro"?<div className="lesson-card"><div className="level-orbit">{level}</div><div className="eyebrow">ONE SIMPLE ACTION</div><h2>{LEVELS[level-1]}</h2><p>{directions[level-1]}</p><button className="primary" onClick={()=>{speak(directions[level-1],voice);setPhase("play")}}>START LISTENING</button><small>{voice?"Voice guidance is on":"Sound begins after you press the button"}</small></div>:phase==="success"?<Success level={level} done={onDone} replay={()=>setPhase("play")}/>:<LevelPlay key={level} level={level} volume={volume} succeed={()=>setPhase("success")}/>}</section>
}

function LevelPlay({level,volume,succeed}:{level:number;volume:number;succeed:()=>void}) {
  if(level===1) return <PlaybackGame volume={volume} done={succeed}/>;
  if(level===2) return <BeatGame volume={volume} done={succeed}/>;
  if(level===3) return <MixGame volume={volume} done={succeed}/>;
  return <SongGame volume={volume} done={succeed}/>;
}

function useBeat(volume:number,bpm=112,accent=true) { const engine=useRef<ReturnType<typeof makeAudio>|null>(null), timer=useRef<ReturnType<typeof setInterval>|null>(null), beat=useRef(0); const stop=()=>{if(timer.current)clearInterval(timer.current);timer.current=null;engine.current?.close();engine.current=null}; const start=()=>{stop();engine.current=makeAudio(volume);const tick=()=>{const n=beat.current;engine.current?.tone(engine.current.ctx.currentTime,n%4===0&&accent?105:75,n%4===0&&accent);engine.current?.hat(engine.current.ctx.currentTime+.02);if(n%2===0)engine.current?.bass(engine.current.ctx.currentTime,n%4===0?55:65);beat.current++};tick();timer.current=setInterval(tick,60000/bpm)}; useEffect(()=>stop,[]);return{start,stop,beat}; }

function PlaybackGame({volume,done}:{volume:number;done:()=>void}) { const loop=useBeat(volume,108); const [playing,setPlaying]=useState(false),[actions,setActions]=useState(0); const toggle=()=>{if(playing){loop.stop();setPlaying(false);const n=actions+1;setActions(n);if(n>=3)setTimeout(done,450)}else{loop.start();setPlaying(true)}}; return <PlayFrame title={playing?"Now pause the deck.":"Press PLAY when you are ready."} hint={playing?"THE DECK IS PLAYING":"THE DECK IS PAUSED"} count={actions}><div className={`mini-deck trainer ${playing?"playing":""}`}><small>DECK A</small><strong>{playing?"▶":"Ⅱ"}</strong><span>{playing?"PLAYING":"PAUSED"}</span></div><button className="primary transport" onClick={toggle}>{playing?"Ⅱ PAUSE":"▶ PLAY"}</button><button className="secondary" onClick={()=>{loop.stop();setPlaying(false);setActions(0)}}>↻ REPLAY FROM START</button></PlayFrame> }

function BeatGame({volume,done}:{volume:number;done:()=>void}) { const loop=useBeat(volume,110);const [hits,setHits]=useState(0),[msg,setMsg]=useState("Press PLAY, then tap with the beat.");const started=useRef(0);const play=()=>{loop.start();started.current=performance.now();setMsg("Listen. Tap with the beat.")};const tap=()=>{if(!started.current){play();return}const period=60000/110,delta=((performance.now()-started.current)%period);const error=Math.min(delta,period-delta);const good=error<150;setMsg(good?(hits>1?"Perfect!":"Nice!"):delta<period/2?"A little late. Try once more.":"A little early. Try once more.");if(good){const n=hits+1;setHits(n);if(n>=4){loop.stop();setTimeout(done,500)}}};return <PlayFrame title="Tap along with the music." hint={msg} count={hits}><div className="pulse"/><button className="tap" onClick={tap}>TAP</button><button className="secondary" onClick={play}>▶ {started.current?"HEAR IT AGAIN":"PLAY BEAT"}</button></PlayFrame> }

function OneGame({volume,done}:{volume:number;done:()=>void}) { const loop=useBeat(volume,108);const [hits,setHits]=useState(0),[msg,setMsg]=useState("Hear four beats. Tap on ONE.");const startAt=useRef(0);const play=()=>{loop.start();startAt.current=performance.now();setMsg("Listen… then tap on ONE.")};const tap=()=>{if(!startAt.current){play();return}const bar=4*60000/108,delta=(performance.now()-startAt.current)%bar;const near=Math.min(delta,bar-delta)<220;if(near){const n=hits+1;setHits(n);setMsg("Perfect! That’s the ONE.");if(n>=3){loop.stop();setTimeout(done,500)}}else setMsg("Almost. Listen again.")};return <PlayFrame title="Tap when you hear ONE." hint={msg} count={hits}><div className="beat-dots"><i/><i/><i/><i/></div><button className="tap one" onClick={tap}>ONE</button><button className="secondary" onClick={play}>↻ HEAR AGAIN</button></PlayFrame> }

function TempoGame({volume,done}:{volume:number;done:()=>void}) { const pairs=[[120,128],[120,112],[120,126]], [round,setRound]=useState(0),[msg,setMsg]=useState("Listen to Track A, then Track B."),engine=useRef<ReturnType<typeof makeAudio>|null>(null);const hear=()=>{engine.current?.close();engine.current=makeAudio(volume);const [a,b]=pairs[round];for(let i=0;i<4;i++)engine.current.tone(engine.current.ctx.currentTime+i*60/a,80,i===0);for(let i=0;i<4;i++)engine.current.tone(engine.current.ctx.currentTime+2.4+i*60/b,125,i===0);setMsg("Is Track B faster or slower?")};const answer=(fast:boolean)=>{const right=(pairs[round][1]>pairs[round][0])===fast;if(!right){setMsg("Almost. Listen again.");hear();return}if(round===2){engine.current?.close();done()}else{setRound(round+1);setMsg("Nice! Here is the next pair.");setTimeout(hear,600)}};return <PlayFrame title="Is Track B faster or slower?" hint={msg} count={round}><div className="deck-pair"><div>A<small>REFERENCE</small></div><span>VS</span><div>B<small>LISTEN</small></div></div><button className="secondary wide" onClick={hear}>▶ PLAY TRACKS</button><div className="choice"><button onClick={()=>answer(true)}>FASTER <b>↑</b></button><button onClick={()=>answer(false)}>SLOWER <b>↓</b></button></div></PlayFrame> }

function MatchGame({volume,done}:{volume:number;done:()=>void}) { const [bpm,setBpm]=useState(126),[playing,setPlaying]=useState(false),loop=useBeat(volume,bpm,false);useEffect(()=>{if(playing)loop.start();return()=>loop.stop()},[bpm]);const diff=Math.abs(120-bpm);const matched=diff<.6;return <PlayFrame title="Match the speed." hint={matched?"MATCHED ✓":diff<2?"Almost matched.":"Keep going."} count={matched?3:Math.max(0,3-Math.ceil(diff/2))}><div className="bpm-cards"><div><small>TRACK A</small><strong>120</strong><span>BPM</span></div><div className={matched?"matched":""}><small>TRACK B</small><strong>{bpm.toFixed(1)}</strong><span>BPM</span></div></div><label className="big-slider"><span>SLOWER</span><input aria-label="Track B speed" type="range" min="116" max="128" step=".5" value={bpm} onChange={e=>setBpm(+e.target.value)}/><span>FASTER</span></label><button className="secondary wide" onClick={()=>{setPlaying(!playing);playing?loop.stop():loop.start()}}>{playing?"■ STOP":"▶ HEAR TOGETHER"}</button>{matched&&<button className="primary" onClick={done}>COMPLETE LEVEL</button>}</PlayFrame> }

const MIX_STEPS=["Track A is playing.","Cue Track B.","Match the speed.","Wait for ONE.","Press PLAY.","Bring Track B in.","Lower the bass on Track A.","Bring the bass up on Track B.","Fade Track A out."];
function MixGame({volume,done}:{volume:number;done:()=>void}) { const [step,setStep]=useState(0),[volB,setVolB]=useState(0),[bassA,setBassA]=useState(80),[bassB,setBassB]=useState(20),[volA,setVolA]=useState(100),loop=useBeat(volume,120);useEffect(()=>{loop.start();return loop.stop},[]);const next=()=>step===8?done():setStep(step+1);return <PlayFrame title={MIX_STEPS[step]} hint={`STEP ${step+1} OF 9`} count={Math.floor(step/3)}><div className="mixer"><MiniDeck name="A" playing={step<8}/><div className="mix-controls"><label>A VOLUME<input aria-label="Track A volume" type="range" min="0" max="100" value={volA} onChange={e=>setVolA(+e.target.value)}/></label><label>B VOLUME<input aria-label="Track B volume" type="range" min="0" max="100" value={volB} onChange={e=>setVolB(+e.target.value)}/></label><label>A LOW EQ<input aria-label="Track A bass" type="range" min="0" max="100" value={bassA} onChange={e=>setBassA(+e.target.value)}/></label><label>B LOW EQ<input aria-label="Track B bass" type="range" min="0" max="100" value={bassB} onChange={e=>setBassB(+e.target.value)}/></label></div><MiniDeck name="B" playing={step>=4}/></div><button className="primary" onClick={next}>{step===1?"CUE TRACK B":step===4?"PLAY TRACK B":step===8?"FINISH MY MIX":"DONE · NEXT STEP"}</button></PlayFrame> }

const SONG_PARTS=[
  {name:"DRUMS",help:"Start with the heartbeat of the song."},
  {name:"HI-HAT",help:"Add a bright sound between the beats."},
  {name:"BASS",help:"Add the low sound that makes it move."},
  {name:"MELODY",help:"Add the final musical pattern."}
];
function SongGame({volume,done}:{volume:number;done:()=>void}) {
  const [step,setStep]=useState(0),[message,setMessage]=useState("Press the glowing DRUMS button."), engine=useRef<ReturnType<typeof makeAudio>|null>(null), timer=useRef<ReturnType<typeof setInterval>|null>(null), beat=useRef(0), active=useRef(0);
  const stop=()=>{if(timer.current)clearInterval(timer.current);timer.current=null;engine.current?.close();engine.current=null};
  const start=()=>{stop();engine.current=makeAudio(volume);beat.current=0;const tick=()=>{const n=beat.current%8,e=engine.current;if(!e)return;const now=e.ctx.currentTime;if(active.current>=1)e.tone(now,n%4===0?105:75,n%4===0);if(active.current>=2)e.hat(now+.03);if(active.current>=3&&n%2===0)e.bass(now,n%4===0?55:65);if(active.current>=4&&n%2===0)e.note(now,[220,262,294,262][Math.floor(n/2)]);beat.current++};tick();timer.current=setInterval(tick,500)};
  useEffect(()=>stop,[]);
  const choose=(index:number)=>{if(index!==step){setMessage(`Not ${SONG_PARTS[index].name} yet. Press ${SONG_PARTS[step].name}.`);return}const next=step+1;active.current=next;setStep(next);setMessage(next<4?`Correct! Now press ${SONG_PARTS[next].name}.`:"Correct! Listen to your complete song.");if(next===1)start();if(next===4)setTimeout(()=>{stop();done()},4200)};
  const restart=()=>{stop();active.current=0;setStep(0);setMessage("Press the glowing DRUMS button.")};
  return <PlayFrame title={step<4?`Add ${SONG_PARTS[step].name}`:"Your whole song is playing!"} hint={message} count={Math.min(3,step)}>
    <p className="song-help">{step<4?SONG_PARTS[step].help:"You added drums, hi-hat, bass and melody."}</p>
    <div className="song-parts">{SONG_PARTS.map((part,i)=><button key={part.name} className={i<step?"on":i===step?"next":""} onClick={()=>choose(i)} disabled={step===4}><span>{i<step?"✓":i+1}</span><strong>{part.name}</strong><small>{i<step?"PLAYING":i===step?"PRESS THIS":"NOT YET"}</small></button>)}</div>
    <button className="secondary song-restart" onClick={restart}>START SONG AGAIN</button>
  </PlayFrame>
}

function MiniDeck({name,playing}:{name:string;playing:boolean}){return <div className={`mini-deck ${playing?"playing":""}`}><small>DECK</small><strong>{name}</strong><span>{playing?"PLAYING":"READY"}</span></div>}
function PlayFrame({title,hint,count,children}:{title:string;hint:string;count:number;children:React.ReactNode}) {return <div className="play-frame"><div className="eyebrow">{hint}</div><h2>{title}</h2><div className="tries" aria-label={`${count} successful tries`}>{[0,1,2].map(i=><i key={i} className={i<count?"on":""}/>)}</div>{children}</div>}
function Success({level,done,replay}:{level:number;done:()=>void;replay:()=>void}){return <div className="success"><div className="burst">✓</div><div className="eyebrow">LEVEL COMPLETE · +100 XP</div><h2>{level===3?"YOUR FIRST TRANSITION!":level===4?"YOU MADE A SONG!":"You did it!"}</h2><p>{["You can control a deck.","You found the beat!","You just moved between two tracks.","You built a complete groove from four sounds."][level-1]}</p>{level>=3&&<div className="score"><span><strong>CALM</strong>Control</span><span><strong>STEADY</strong>Timing</span><span><strong>{level===4?"CREATIVE":"SMOOTH"}</strong>{level===4?"Song":"Transition"}</span></div>}<div className="success-actions"><button className="secondary" onClick={replay}>PLAY AGAIN</button><button className="primary" onClick={done}>{level<4?"NEXT LEVEL":"SEE MY PROGRESS"}</button></div></div>}

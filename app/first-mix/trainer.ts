import { SKILLS, SAVE_KEY, readProgress, recordCompletion, writeProgress, streak, nextSkill, isUnlocked, judgeTap, tempoAnswer, TEMPO_PAIRS, initialMix, mixReady, MIX_INSTRUCTIONS, clamp, escapeText, type Progress, type MixState } from './core.js';
import { MixerAudio } from './audio.js';

type Screen = 'home' | 'skills' | 'progress' | 'game';
type Phase = 'intro' | 'play' | 'success';
const button = (action: string, label: string, primary = false, disabled = false) => `<button type="button" data-action="${action}" class="${primary ? 'fm-primary' : 'fm-secondary'}" ${disabled ? 'disabled' : ''}>${label}</button>`;
const store = { getItem: (key: string) => window.localStorage.getItem(key), setItem: (key: string, value: string) => window.localStorage.setItem(key, value) };

/** Imperative game island. React owns only the empty mount node, never its children. */
export function mountTrainer(root: HTMLElement): () => void {
  const app = new Trainer(root);
  return () => app.dispose();
}
class Trainer {
  private screen: Screen = 'home';
  private phase: Phase = 'intro';
  private skill = 0;
  private progress: Progress;
  private notice: string;
  private savedOk = true;
  private volume = .35;
  private muted = false;
  private slow = false;
  private audio: MixerAudio | null = null;
  private running = false;
  private paused = false;
  private disposed = false;
  private generation = 0;
  private pending = false;
  private raf = 0;
  private attempted = new Set<number>();
  private hits = 0;
  private round = 0;
  private pairEnd = Infinity;
  private pairBStart = Infinity;
  private heard = false;
  private tempoLocked = false;
  private bpm = 126;
  private holdStart: number | null = null;
  private matchReady = false;
  private mix: MixState = initialMix();
  private launchAt = Infinity;
  private tapError: number | null = null;
  private message = '';
  private earned = false;
  constructor(private root: HTMLElement) {
    const loaded = readProgress(store); this.progress = loaded.progress; this.notice = loaded.notice;
    root.addEventListener('click', this.click);
    root.addEventListener('pointerdown', this.pointer);
    root.addEventListener('keydown', this.key);
    root.addEventListener('input', this.input);
    root.addEventListener('change', this.change);
    document.addEventListener('visibilitychange', this.visibility);
    this.render(false);
    this.raf = requestAnimationFrame(this.tick);
    // Registration is optional; an offline claim is not made if it fails.
    if ('serviceWorker' in navigator) void navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
  private say = (text: string) => {
    this.silenceVoice();
    if (!this.muted && 'speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(text); utterance.lang = 'en-AU'; utterance.rate = .85; utterance.volume = this.volume;
      window.speechSynthesis.speak(utterance);
    }
  };
  private silenceVoice = () => { if ('speechSynthesis' in window) window.speechSynthesis.cancel(); };
  private stopAudio(): void {
    this.generation++; this.pending = false; this.running = false;
    this.audio?.dispose(); this.audio = null; this.silenceVoice();
  }
  private reset(): void {
    this.stopAudio(); this.paused = false; this.attempted.clear(); this.hits = 0; this.round = 0;
    this.pairEnd = Infinity; this.pairBStart = Infinity; this.heard = false; this.tempoLocked = false;
    this.bpm = this.slow ? 96 : 126; this.holdStart = null; this.matchReady = false;
    this.mix = initialMix(this.slow); this.launchAt = Infinity; this.tapError = null; this.message = '';
  }
  private navigate(screen: Screen): void { this.reset(); this.screen = screen; this.phase = 'intro'; this.render(); }
  private open(index: number): void {
    if (!isUnlocked(this.progress, index)) return;
    this.reset(); this.skill = index; this.phase = 'intro'; this.screen = 'game'; this.render();
  }
  private complete(): void {
    if (this.phase !== 'play') return;
    const id = SKILLS[this.skill].id;
    this.earned = !this.progress.completed.includes(id);
    this.progress = recordCompletion(this.progress, id);
    this.savedOk = writeProgress(store, this.progress);
    this.notice = this.savedOk ? '' : 'Progress is kept for this visit, but could not be saved on this device.';
    this.phase = 'success'; this.stopAudio(); this.render();
  }
  private feedback(text: string): void {
    this.message = text;
    const e = this.root.querySelector('[data-feedback]'); if (e && e.textContent !== text) e.textContent = text;
  }
  private async startAudio(action: (audio: MixerAudio) => void): Promise<void> {
    if (this.pending || this.disposed || this.phase !== 'play') return;
    const token = ++this.generation; this.pending = true;
    try {
      if (!this.audio) this.audio = new MixerAudio(this.muted ? 0 : this.volume);
      const audio = this.audio;
      // resume() is invoked synchronously from the input handler, not from an effect/timer.
      const ready = audio.resume(); await ready;
      if (this.disposed || token !== this.generation || audio !== this.audio) return;
      this.running = true; this.paused = false; action(audio);
    } catch {
      if (token === this.generation) { this.stopAudio(); this.feedback('Sound could not start. Tap PLAY again, or check your browser sound settings.'); }
    } finally { if (token === this.generation) this.pending = false; }
  }
  private playBeat(): void {
    this.attempted.clear(); this.hits = 0;
    void this.startAudio(a => { a.stop('B'); a.gain('A', 1); a.bass('A', 1); a.start('A', this.slow ? 80 : 108); this.feedback('Listen first. Join in when you are ready.'); this.render(false); });
  }
  private tap(): void {
    if (this.phase !== 'play' || this.paused || !this.running || !this.audio || this.audio.ctx.state !== 'running' || this.skill > 1) return;
    const result = judgeTap(this.audio.events('A'), this.audio.heardTime(), this.attempted, this.skill === 1);
    this.feedback(result.message);
    if (result.ok) { this.hits++; this.update(); if (this.hits >= 3) this.complete(); }
  }
  private playPair(): void {
    if (this.round >= TEMPO_PAIRS.length) return;
    this.heard = false; this.tempoLocked = false;
    const pair = TEMPO_PAIRS[this.round], factor = this.slow ? .75 : 1;
    void this.startAudio(a => {
      a.stop('A'); a.stop('B'); a.gain('A', 1); a.gain('B', 1); a.bass('A', 1); a.bass('B', 1);
      const start = a.now() + .15; this.pairBStart = start + 4 * 60 / (pair[0] * factor) + .55;
      this.pairEnd = this.pairBStart + 4 * 60 / (pair[1] * factor);
      a.start('A', pair[0] * factor, { at: start, count: 4 });
      a.start('B', pair[1] * factor, { at: this.pairBStart, count: 4 });
      this.feedback('Listen to A, then B.'); this.render(false);
    });
  }
  private answer(fast: boolean): void {
    if (!this.heard || this.tempoLocked || this.phase !== 'play') return;
    this.tempoLocked = true;
    if (!tempoAnswer(this.round, fast, true)) {
      this.heard = false; this.feedback('Almost. Hear both tracks again, then try once more.'); this.render(false); return;
    }
    this.round++; this.hits = this.round; this.heard = false;
    this.audio?.stop('A'); this.audio?.stop('B'); this.running = false;
    this.pairEnd = Infinity;
    if (this.round === 3) this.complete();
    else { this.feedback('Nice! Press PLAY A THEN B for the next pair.'); this.render(); }
  }
  private playMatch(): void {
    this.holdStart = null; this.matchReady = false;
    void this.startAudio(a => {
      const at = a.now() + .15; a.gain('A', .65); a.gain('B', .65); a.bass('A', 1); a.bass('B', 1);
      a.start('A', this.slow ? 90 : 120, { at, musical: true }); a.start('B', this.bpm, { at, musical: true });
      this.feedback('Both tracks are playing. Move B\'s speed slowly.'); this.render(false);
    });
  }
  private mixAdvance(): void {
    if (!mixReady(this.mix)) return;
    if (this.mix.step < 7) { this.mix.step++; this.holdStart = null; this.message = ''; this.silenceVoice(); this.render(); }
  }
  private slider(name: string, label: string, value: number, min: number, max: number, step = 1): string {
    return `<div class="fm-control"><label for="fm-${name}">${label}: <output data-value="${name}">${value}</output></label><div class="fm-range">${button('minus:' + name, '-', false)}<input id="fm-${name}" data-control="${name}" type="range" min="${min}" max="${max}" step="${step}" value="${value}" aria-label="${label}">${button('plus:' + name, '+', false)}</div></div>`;
  }
  private control(name: string, value: number, commit = false): void {
    if (name === 'volume') { this.volume = clamp(value / 100, 0, 1); this.audio?.volume(this.muted ? 0 : this.volume); if (this.volume === 0) this.silenceVoice(); }
    else if (this.phase === 'play' && !this.paused) {
      if (name === 'speed' && this.skill === 3) {
        this.bpm = clamp(value, this.slow ? 78 : 108, this.slow ? 102 : 132); this.audio?.speed('B', this.bpm); this.matchReady = false; this.holdStart = null;
      } else if (this.skill === 4) {
        const s = this.mix;
        if (name === 'mixspeed' && s.step === 2) { s.bpmB = clamp(value, this.slow ? 78 : 108, this.slow ? 102 : 132); this.audio?.speed('B', s.bpmB); }
        if (name === 'volumeB' && s.step === 4) { s.volumeB = clamp(value / 100, 0, 1); this.audio?.gain('B', s.volumeB); }
        if (name === 'bassA' && s.step === 5) { s.bassA = clamp(value / 100, 0, 1); this.audio?.bass('A', s.bassA); }
        if (name === 'bassB' && s.step === 6) { s.bassB = clamp(value / 100, 0, 1); this.audio?.bass('B', s.bassB); }
        if (name === 'volumeA' && s.step === 7) { s.volumeA = clamp(value / 100, 0, 1); this.audio?.gain('A', s.volumeA); }
        if (commit && s.step >= 2 && s.step !== 3 && s.step < 7) this.mixAdvance();
      }
    }
    const label = this.root.querySelector(`[data-value="${name}"]`); if (label) label.textContent = String(value);
    this.update();
  }
  private click = (e: MouseEvent) => {
    const b = (e.target as Element).closest<HTMLButtonElement>('button[data-action]');
    if (!b || b.disabled || !this.root.contains(b)) return;
    const action = b.dataset.action!;
    if (action === 'tap') { if (e.detail === 0) this.tap(); return; }
    if (action.startsWith('open:')) { this.open(Number(action.split(':')[1])); return; }
    if (action.startsWith('plus:') || action.startsWith('minus:')) {
      const [direction, name] = action.split(':'); const range = this.root.querySelector<HTMLInputElement>(`[data-control="${name}"]`);
      if (range) { range.value = String(clamp(Number(range.value) + (direction === 'plus' ? 1 : -1) * Number(range.step) * (name.toLowerCase().includes('speed') ? 1 : 10), Number(range.min), Number(range.max))); this.control(name, Number(range.value), true); }
      return;
    }
    if (action === 'home') return this.navigate('home');
    if (action === 'skills') return this.navigate('skills');
    if (action === 'progress') return this.navigate('progress');
    if (action === 'today') return this.open(nextSkill(this.progress));
    if (action === 'mute') {
      this.muted = !this.muted; this.audio?.volume(this.muted ? 0 : this.volume); if (this.muted) this.silenceVoice();
      b.textContent = this.muted ? 'SOUND OFF' : 'SOUND ON'; b.setAttribute('aria-pressed', String(this.muted)); return;
    }
    if (action === 'read') { this.say(this.instruction()); return; }
    if (action === 'next' && this.phase === 'success') {
      if (this.skill < 4) this.open(this.skill + 1); else this.navigate('progress'); return;
    }
    if (action === 'replay' || action === 'slow') {
      if (action === 'slow') this.slow = !this.slow;
      this.reset(); this.phase = 'intro'; this.render(); return;
    }
    if (action === 'begin' && this.phase === 'intro') { this.phase = 'play'; this.render(); return; }
    if (this.phase !== 'play' || this.paused) return;
    if (action === 'beat') this.playBeat();
    if (action === 'pair') this.playPair();
    if (action === 'faster') this.answer(true);
    if (action === 'slower') this.answer(false);
    if (action === 'match') this.playMatch();
    if (action === 'matched' && this.matchReady && this.running) {
      this.round++; if (this.round === 3) this.complete();
      else { this.audio?.stop('A'); this.audio?.stop('B'); this.running = false; this.matchReady = false; this.holdStart = null; this.bpm = [126, 112, 130][this.round] * (this.slow ? .75 : 1); this.message = 'Nice! Try a different starting speed.'; this.render(); }
    }
    if (this.skill === 4 && this.mix.step === 0 && action === 'playA') {
      void this.startAudio(a => { a.gain('A', 1); a.bass('A', 1); a.gain('B', 0); a.bass('B', 0); a.start('A', this.mix.bpmA, { musical: true }); this.mix.playingA = true; this.mixAdvance(); });
    }
    if (this.skill === 4 && this.mix.step === 1 && action === 'cueB') {
      this.audio?.stop('B'); this.mix.prepared = true; this.mix.playingB = false; this.mixAdvance();
    }
    if (this.skill === 4 && this.mix.step === 3 && action === 'playB' && this.audio && this.running && this.launchAt === Infinity) {
      const result = judgeTap(this.audio.events('A'), this.audio.heardTime(), this.attempted, true);
      if (!result.ok) { this.feedback(result.message); return; }
      this.tapError = Math.round(Math.abs(result.error!) * 1000);
      this.launchAt = this.audio.nextOne('A');
      this.audio.start('B', this.mix.bpmB, { at: this.launchAt, musical: true });
      this.feedback('Nice! With learning assist, B starts on the next ONE. Keep listening.');
      b.disabled = true;
    }
  };
  private pointer = (e: PointerEvent) => {
    if ((e.target as Element).closest('[data-action="tap"]') && e.isPrimary && e.button === 0) {
      e.preventDefault(); this.tap();
    }
  };
  private key = (e: KeyboardEvent) => {
    if ((e.target as Element).closest('[data-action="tap"]') && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); if (!e.repeat) this.tap(); }
  };
  private input = (e: Event) => {
    const el = e.target as HTMLInputElement; if (el.dataset.control) this.control(el.dataset.control, Number(el.value));
  };
  private change = (e: Event) => {
    const el = e.target as HTMLInputElement; if (el.dataset.control) this.control(el.dataset.control, Number(el.value), true);
  };
  private visibility = () => {
    if (document.hidden && this.phase === 'play' && this.running) {
      this.stopAudio(); this.paused = true; this.message = 'Paused while you were away. Replay this skill when ready.'; this.render(false);
    }
  };
  private instruction(): string {
    if (this.screen !== 'game') return 'Choose PLAY TODAY to start. Take all the time you need.';
    return this.skill === 4 && this.phase === 'play' ? MIX_INSTRUCTIONS[this.mix.step] : SKILLS[this.skill].instruction;
  }
  private tick = () => {
    if (this.disposed) return;
    if (this.running && this.audio && this.audio.ctx.state !== 'running') { this.stopAudio(); this.paused = true; this.feedback('Sound was interrupted. Replay this skill when ready.'); this.render(false); }
    this.update(); this.raf = requestAnimationFrame(this.tick);
  };
  private update(): void {
    if (this.disposed || this.phase !== 'play') return;
    const a = this.audio, now = a?.heardTime() ?? 0;
    if (a && this.running) {
      const latest = [...a.events('A')].reverse().find(e => e.time <= now);
      for (const dot of this.root.querySelectorAll<HTMLElement>('[data-beat]')) {
        dot.classList.toggle('active', latest !== undefined && Number(dot.dataset.beat) === latest.index % 4);
      }
      const readout = this.root.querySelector<HTMLElement>('[data-beat-readout]');
      if (readout) { readout.textContent = latest ? String(latest.index % 4 + 1) : 'Listen'; readout.dataset.index = String(latest?.index ?? -1); }
      if (this.skill === 2 && !this.tempoLocked && this.pairEnd < Infinity) {
        const text = now < this.pairBStart ? 'Track A' : now < this.pairEnd ? 'Track B' : 'Which was faster?';
        const label = this.root.querySelector('[data-pair]'); if (label) label.textContent = text;
        this.heard = now >= this.pairEnd;
        for (const b of this.root.querySelectorAll<HTMLButtonElement>('[data-action="faster"], [data-action="slower"]')) b.disabled = !this.heard;
      }
      if (this.skill === 3) {
        const matched = Math.abs((this.slow ? 90 : 120) - this.bpm) <= .5;
        if (matched && a.started('A') && a.started('B')) { if (this.holdStart === null) this.holdStart = now; this.matchReady = now - this.holdStart >= 4 * 60 / (this.slow ? 90 : 120); }
        else { this.holdStart = null; this.matchReady = false; }
        const b = this.root.querySelector<HTMLButtonElement>('[data-action="matched"]'); if (b) b.disabled = !this.matchReady;
        this.feedback(this.matchReady ? 'MATCHED. Both tracks have the same speed.' : matched ? 'Nice. Listen for four beats at this speed.' : 'Move B\'s speed until the numbers match.');
      }
      if (this.skill === 4) {
        if (this.mix.step === 3 && this.launchAt < Infinity && a.started('B')) { this.mix.playingB = true; this.mixAdvance(); }
        if (this.mix.step === 7) {
          if (mixReady(this.mix)) { if (this.holdStart === null) this.holdStart = now; this.feedback('Listen to B on its own. You made the change.'); if (now - this.holdStart >= 4 * 60 / this.mix.bpmA) this.complete(); }
          else this.holdStart = null;
        }
      }
    }
    const counter = this.root.querySelector('[data-count]'); if (counter) counter.textContent = `${this.skill === 3 ? this.round : this.hits} of 3`;
  }
  private render(focus = true): void {
    if (this.disposed) return;
    const count = this.progress.completed.length;
    const header = `<div class="fm-header">${button('home', 'FIRST <span>MIX</span>')}<div>${button('read', 'READ STEP')}${button('mute', this.muted ? 'SOUND OFF' : 'SOUND ON')}</div></div>`;
    let body = '';
    if (this.screen === 'home') body = `<p class="fm-eyebrow">RELAXED MODE - NO TIMER</p><h1 tabindex="-1">Learn to DJ.<br><span>One simple step at a time.</span></h1><p>Five-minute practice. Simple steps. Your own pace.</p><div class="fm-home"><button data-action="today" class="fm-primary fm-hero">PLAY TODAY<span>${count ? 'Continue your journey' : 'Start with one simple beat'}</span></button>${button('skills', 'PRACTISE<span>Repeat what I learned</span>')}${button('progress', `MY PROGRESS<span>${count} of 5 skills learned</span>`)}</div><p>No timer. More hints. Unlimited retries.</p>`;
    if (this.screen === 'skills' || this.screen === 'progress') {
      body = `<h1 tabindex="-1">${this.screen === 'skills' ? 'Choose a skill' : 'Your DJ journey'}</h1>`;
      if (this.screen === 'progress') body += `<p>${count} of 5 skills learned. ${count * 100} XP.</p><p>${streak(this.progress)} day${streak(this.progress) === 1 ? '' : 's'} in your current practice streak.</p>`;
      body += `<div class="fm-skills">${SKILLS.map((s, i) => button('open:' + i, `<span>${i + 1}. ${s.name}</span><span>${this.progress.completed.includes(s.id) ? 'Completed - practise again' : isUnlocked(this.progress, i) ? 'Ready to play' : 'Finish the earlier skills first'}</span>`, false, !isUnlocked(this.progress, i))).join('')}</div>${button('home', 'BACK HOME')}`;
    }
    if (this.screen === 'game') {
      body = `<div class="fm-toolbar">${button('skills', 'ALL SKILLS')}<span>Skill ${this.skill + 1} of 5</span></div>`;
      if (this.phase === 'intro') body += `<h1 tabindex="-1">${SKILLS[this.skill].name}</h1><p>${SKILLS[this.skill].instruction}</p><p>${this.skill < 2 ? 'First listen. Then tap three different beats. You can try as often as you like.' : this.skill === 2 ? 'Hear both tracks before choosing. There is no time limit.' : this.skill === 3 ? 'Matching speed and lining up beats are different. We start with speed.' : 'One control at a time. B starts quietly, with its bass down. Learning assist helps line up the start.'}</p>${button('begin', 'LET\'S PLAY', true)}`;
      else if (this.phase === 'success') body += `<p class="fm-eyebrow">${this.earned ? 'SKILL COMPLETE - 100 XP' : 'PRACTICE COMPLETE - SKILL ALREADY SAVED'}</p><h1 tabindex="-1">${this.skill === 4 ? 'YOUR FIRST MIX!' : 'You did it!'}</h1><p>${this.skill === 4 ? 'You started B, changed the bass and faded A out.' : 'You completed this practice. Take a break or try the next skill.'}</p>${this.skill === 4 ? `<p>Learning assist: B started on the next ONE.<br>Your start tap was ${this.tapError ?? 0} ms from ONE. This is practice feedback, not a professional DJ score.</p>` : ''}${button('next', this.skill < 4 ? 'NEXT SKILL' : 'SEE MY PROGRESS', true)}${button('replay', 'PRACTISE AGAIN')}`;
      else {
        body += `<h1 tabindex="-1">${escapeText(this.instruction())}</h1><p data-feedback role="status" aria-live="polite" aria-atomic="true">${escapeText(this.message)}</p>`;
        if (this.paused) body += `${button('replay', 'REPLAY THIS SKILL', true)}`;
        else if (this.skill <= 1) body += `<p data-count>0 of 3</p><div class="fm-beats" aria-hidden="true">${[0, 1, 2, 3].map(n => `<span data-beat="${n}">${n === 0 ? 'ONE' : n + 1}</span>`).join('')}</div><span data-beat-readout class="fm-beat-readout" aria-hidden="true">Listen</span>${button('tap', this.skill === 1 ? 'TAP ON ONE' : 'TAP', true, !this.running)}${button('beat', this.running ? 'HEAR AGAIN - RESET TRIES' : 'PLAY BEAT')}`;
        else if (this.skill === 2) body += `<p>Pair ${this.round + 1} of 3</p><p data-pair>Track A, then Track B</p>${button('pair', 'PLAY A THEN B', true)}<div class="fm-choice">${button('faster', 'B IS FASTER', false, !this.heard)}${button('slower', 'B IS SLOWER', false, !this.heard)}</div>`;
        else if (this.skill === 3) body += `<p data-count>${this.round} of 3</p><p>Track A: ${this.slow ? 90 : 120} BPM</p>${this.slider('speed', 'Track B speed (BPM)', this.bpm, this.slow ? 78 : 108, this.slow ? 102 : 132, .5)}${button('match', this.running ? 'HEAR BOTH AGAIN' : 'PLAY BOTH TRACKS', true)}${button('matched', 'KEEP THIS MATCH', false, !this.matchReady)}<p>Same speed does not always mean the beats line up. Listen for the two different sounds.</p>`;
        else body += this.mixView();
      }
      body += `<div class="fm-help">${button('replay', 'REPLAY SKILL')}${button('slow', this.slow ? 'RESTART AT NORMAL SPEED' : 'RESTART SLOWER')}</div><details class="fm-volume"><summary>Sound level</summary>${this.slider('volume', 'Volume', Math.round(this.volume * 100), 0, 100, 1)}</details>`;
    }
    this.root.innerHTML = `<div class="fm">${header}<section class="fm-screen">${body}<p class="fm-save" role="status">${escapeText(this.notice || (this.savedOk ? 'Progress stays on this device. No account needed.' : 'Saving is unavailable.'))}</p></section></div>`;
    this.root.querySelector('[data-action="mute"]')?.setAttribute('aria-pressed', String(this.muted));
    this.root.querySelector('[data-action="home"]')?.setAttribute('aria-label', 'FIRST MIX home');
    for (const b of this.root.querySelectorAll<HTMLButtonElement>('[data-action^="plus:"], [data-action^="minus:"]')) {
      const [direction, name] = b.dataset.action!.split(':');
      const label = this.root.querySelector<HTMLInputElement>(`[data-control="${name}"]`)?.getAttribute('aria-label') || name;
      b.setAttribute('aria-label', `${direction === 'plus' ? 'Increase' : 'Decrease'} ${label}`);
    }
    this.update();
    if (focus) this.root.querySelector<HTMLElement>('h1')?.focus({ preventScroll: false });
  }
  private mixView(): string {
    const s = this.mix;
    let html = `<p>Step ${s.step + 1} of 8</p><div class="fm-decks"><span>A: ${s.playingA ? 'Playing' : 'Ready'}</span><span>B: ${s.playingB ? 'Playing' : s.prepared ? 'Cued' : 'Ready'}</span></div>`;
    if (s.step === 0) html += button('playA', 'PLAY A', true);
    if (s.step === 1) html += `<p>Cue marks the starting point. This trainer plays through your speakers; it does not have a separate headphone feed.</p>${button('cueB', 'SET CUE B', true)}`;
    if (s.step === 2) html += `<p>A is ${s.bpmA} BPM. Match B to this number.</p>${this.slider('mixspeed', 'B speed (BPM)', s.bpmB, this.slow ? 78 : 108, this.slow ? 102 : 132, .5)}`;
    if (s.step === 3) html += `<div class="fm-beats" aria-hidden="true">${[0, 1, 2, 3].map(n => `<span data-beat="${n}">${n === 0 ? 'ONE' : n + 1}</span>`).join('')}</div><span data-beat-readout class="fm-beat-readout" aria-hidden="true">Listen</span><p>Tap on ONE. Learning assist will start B on the next ONE, with its volume down.</p>${button('playB', 'PLAY B ON ONE', true, this.launchAt < Infinity)}`;
    if (s.step === 4) html += this.slider('volumeB', 'B volume', Math.round(s.volumeB * 100), 0, 100);
    if (s.step === 5) html += this.slider('bassA', 'A bass (LOW)', Math.round(s.bassA * 100), 0, 100);
    if (s.step === 6) html += this.slider('bassB', 'B bass (LOW)', Math.round(s.bassB * 100), 0, 100);
    if (s.step === 7) html += this.slider('volumeA', 'A volume', Math.round(s.volumeA * 100), 0, 100);
    return html;
  }
  dispose(): void {
    this.disposed = true; this.stopAudio(); cancelAnimationFrame(this.raf);
    this.root.removeEventListener('click', this.click); this.root.removeEventListener('pointerdown', this.pointer); this.root.removeEventListener('keydown', this.key);
    this.root.removeEventListener('input', this.input); this.root.removeEventListener('change', this.change); document.removeEventListener('visibilitychange', this.visibility);
    this.root.replaceChildren();
  }
}
// Exported only to make the persistent key explicit for integration tests and diagnostics.
export { SAVE_KEY };

import { clamp, type Beat } from './core.js';
export type DeckId = 'A' | 'B';
type Deck = { gain: GainNode; low: BiquadFilterNode; playing: boolean; bpm: number; next: number; index: number; events: Beat[]; sources: Set<OscillatorNode>; finite: number; start: number; musical: boolean };
/** One shared audio clock, two real independent audio graphs, no downloaded music. */
export class MixerAudio {
  readonly ctx: AudioContext;
  readonly master: GainNode;
  readonly decks: Record<DeckId, Deck>;
  private timer: ReturnType<typeof setInterval> | undefined;
  private closed = false;
  constructor(volume = .35, ctx?: AudioContext) {
    const Ctor = globalThis.AudioContext || (globalThis as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!ctx && !Ctor) throw new Error('Audio is unavailable');
    this.ctx = ctx || new Ctor({ latencyHint: 'interactive' });
    this.master = this.ctx.createGain();
    this.master.gain.value = clamp(volume, 0, 1) * .55;
    this.master.connect(this.ctx.destination);
    const deck = (): Deck => {
      const gain = this.ctx.createGain(), low = this.ctx.createBiquadFilter();
      gain.gain.value = 0; low.type = 'lowshelf'; low.frequency.value = 220; low.gain.value = 0;
      low.connect(gain); gain.connect(this.master);
      return { gain, low, playing: false, bpm: 120, next: 0, index: 0, events: [], sources: new Set(), finite: Infinity, start: Infinity, musical: false };
    };
    this.decks = { A: deck(), B: deck() };
  }
  /** Must be called directly from a click/tap handler before any awaited work. */
  async resume(): Promise<void> {
    if (this.closed) throw new Error('Audio was closed');
    if (this.ctx.state !== 'running') await this.ctx.resume();
    if (this.ctx.state !== 'running') throw new Error('Audio could not start');
    if (!this.timer) this.timer = setInterval(() => this.schedule(), 25);
  }
  now(): number { return this.ctx.currentTime; }
  /** Map physical tap time to the output clock when the browser exposes it. */
  heardTime(): number {
    if (this.ctx.getOutputTimestamp) {
      const t = this.ctx.getOutputTimestamp();
      if (t.performanceTime && typeof t.contextTime === 'number' && t.contextTime >= 0) {
        const estimate = t.contextTime + (performance.now() - t.performanceTime) / 1000;
        return Math.max(0, Math.min(this.now(), estimate));
      }
    }
    return Math.max(0, this.now() - (this.ctx.outputLatency || this.ctx.baseLatency || 0));
  }
  private set(param: AudioParam, value: number): void {
    param.cancelScheduledValues(this.now());
    param.setTargetAtTime(value, this.now(), .008);
  }
  volume(value: number): void { this.set(this.master.gain, clamp(value, 0, 1) * .55); }
  gain(id: DeckId, value: number): void { this.set(this.decks[id].gain.gain, clamp(value, 0, 1)); }
  bass(id: DeckId, value: number): void { this.set(this.decks[id].low.gain, -30 * (1 - clamp(value, 0, 1))); }
  speed(id: DeckId, bpm: number): void {
    const d = this.decks[id], nextBpm = clamp(bpm, 60, 160);
    // Retain transport phase; only the unscheduled next beat changes duration.
    if (d.playing && d.next > this.now()) d.next = Math.max(this.now() + .01, this.now() + (d.next - this.now()) * d.bpm / nextBpm);
    d.bpm = nextBpm;
  }
  start(id: DeckId, bpm: number, options: { at?: number; count?: number; musical?: boolean } = {}): void {
    this.stop(id);
    const d = this.decks[id]; d.bpm = clamp(bpm, 60, 160); d.next = Math.max(this.now() + .025, options.at ?? this.now() + .12);
    d.start = d.next; d.index = 0; d.events = []; d.playing = true; d.finite = options.count ?? Infinity; d.musical = options.musical ?? false;
    this.schedule();
  }
  stop(id: DeckId): void {
    const d = this.decks[id]; d.playing = false;
    for (const osc of d.sources) { try { osc.stop(); } catch { /* already ended */ } osc.disconnect(); }
    d.sources.clear();
  }
  events(id: DeckId): readonly Beat[] { return this.decks[id].events; }
  started(id: DeckId): boolean { return this.decks[id].playing && this.heardTime() >= this.decks[id].start; }
  nextOne(id: DeckId): number {
    const d = this.decks[id];
    return d.next + ((4 - d.index % 4) % 4) * 60 / d.bpm;
  }
  private tone(d: Deck, time: number, frequency: number, length: number, level: number, type: OscillatorType = 'sine', sweep = false): void {
    const osc = this.ctx.createOscillator(), envelope = this.ctx.createGain();
    osc.type = type; osc.frequency.setValueAtTime(frequency, time);
    if (sweep) osc.frequency.exponentialRampToValueAtTime(60, time + .1);
    envelope.gain.setValueAtTime(.0001, time); envelope.gain.exponentialRampToValueAtTime(level, time + .004); envelope.gain.exponentialRampToValueAtTime(.0001, time + length);
    osc.connect(envelope); envelope.connect(d.low); d.sources.add(osc);
    osc.onended = () => { d.sources.delete(osc); osc.disconnect(); envelope.disconnect(); };
    osc.start(time); osc.stop(time + length + .01);
  }
  private schedule(): void {
    if (this.closed || this.ctx.state !== 'running') return;
    for (const id of ['A', 'B'] as const) {
      const d = this.decks[id];
      // Avoid a burst of overdue notes after an OS/browser stall. UI grades these actual times.
      if (d.playing && d.next < this.now() - .12) d.next = this.now() + .03;
      while (d.playing && d.index < d.finite && d.next < this.now() + .12) {
        const time = d.next, n = d.index, one = n % 4 === 0;
        d.events.push({ time, index: n }); if (d.events.length > 128) d.events.shift();
        // A clear midrange tick is audible even on small phone speakers.
        this.tone(d, time, one ? 1000 : 700, .055, one ? .18 : .1, 'sine');
        if (d.musical) {
          this.tone(d, time, 130, .18, .22, 'sine', true);
          if (n % 2 === 0) this.tone(d, time, id === 'A' ? 110 : 146.83, .26, .10, 'triangle');
          this.tone(d, time + 30 / d.bpm, id === 'A' ? 2500 : 3200, .025, .035, 'triangle');
          if (n % 4 === 2) this.tone(d, time, id === 'A' ? 440 : 587.33, .15, .025, 'sine');
        }
        d.index++; d.next += 60 / d.bpm;
      }
    }
  }
  dispose(): void {
    if (this.closed) return;
    this.closed = true; clearInterval(this.timer); this.timer = undefined;
    this.stop('A'); this.stop('B'); this.master.disconnect();
    for (const d of Object.values(this.decks)) { d.low.disconnect(); d.gain.disconnect(); }
    if (this.ctx.state !== 'closed') void this.ctx.close().catch(() => {});
  }
}

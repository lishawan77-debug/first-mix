/** Pure lesson rules. No DOM, audio, network, or framework dependencies. */
export const SKILLS = [
  { id: 'beat', name: 'Find the Beat', instruction: 'Listen, then tap with each beat.' },
  { id: 'one', name: 'Find the One', instruction: 'Hear ONE, two, three, four. Tap only on ONE.' },
  { id: 'tempo', name: 'Faster or Slower', instruction: 'Listen to A, then B. Is B faster or slower?' },
  { id: 'match', name: 'Match the Speed', instruction: 'Make B the same speed as A.' },
  { id: 'mix', name: 'Your First Mix', instruction: 'Bring two tracks together, one step at a time.' },
] as const;
export type Skill = typeof SKILLS[number]['id'];
export type Progress = { version: 2; completed: Skill[]; days: string[] };
export type Store = Pick<Storage, 'getItem' | 'setItem'>;
export const SAVE_KEY = 'first-mix-progress-v2';
export const freshProgress = (): Progress => ({ version: 2, completed: [], days: [] });
export const clamp = (n: number, lo: number, hi: number) => Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo;
export const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function dayNumber(s: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return NaN;
  const n = Date.parse(s + 'T00:00:00Z');
  return Number.isFinite(n) && new Date(n).toISOString().slice(0, 10) === s ? n / 86400000 : NaN;
}
export function readProgress(store: Store): { progress: Progress; notice: string } {
  try {
    const raw = store.getItem(SAVE_KEY);
    if (!raw) return { progress: freshProgress(), notice: store.getItem('first-mix-progress-v1') ? 'Your earlier save is kept. These updated games start fresh.' : '' };
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== 'object') throw new Error('Invalid save');
    const p = data as Partial<Progress>;
    if (p.version !== 2 || !Array.isArray(p.completed) || !Array.isArray(p.days)) throw new Error('Invalid save');
    const completed = SKILLS.map(s => s.id).filter(id => p.completed!.includes(id));
    const days = [...new Set(p.days.filter(d => typeof d === 'string' && Number.isFinite(dayNumber(d))))].sort().slice(-366);
    return { progress: { version: 2, completed, days }, notice: '' };
  } catch {
    return { progress: freshProgress(), notice: 'Your save could not be read. You can still play.' };
  }
}
export function recordCompletion(p: Progress, skill: Skill, day = localDay()): Progress {
  return { version: 2, completed: SKILLS.map(s => s.id).filter(id => id === skill || p.completed.includes(id)), days: [...new Set([...p.days, day])].sort().slice(-366) };
}
export function writeProgress(store: Store, p: Progress): boolean {
  try { store.setItem(SAVE_KEY, JSON.stringify(p)); return true; } catch { return false; }
}
export function streak(p: Progress, today = localDay()): number {
  const dates = new Set(p.days.map(dayNumber));
  let d = dayNumber(today), count = 0;
  if (!dates.has(d)) d -= 1;
  while (dates.has(d)) { count++; d--; }
  return count;
}
export function isUnlocked(p: Progress, index: number): boolean {
  return index >= 0 && index < SKILLS.length && (p.completed.includes(SKILLS[index].id) || SKILLS.slice(0, index).every(s => p.completed.includes(s.id)));
}
export const nextSkill = (p: Progress) => Math.max(0, SKILLS.findIndex(s => !p.completed.includes(s.id)));
export type Beat = { time: number; index: number };
export type Judgement = { ok: boolean; message: string; error?: number; index?: number };
/** Credit the first tap on each distinct scheduled beat/bar, never clicks-per-window. */
export function judgeTap(events: readonly Beat[], time: number, attempted: Set<number>, onlyOne = false): Judgement {
  const candidates = events.filter(e => !onlyOne || e.index % 4 === 0);
  if (!events.length || time < events[0].time) return { ok: false, message: 'Listen to the first beat, then join in.' };
  const nearest = candidates.reduce<Beat | undefined>((a, b) => !a || Math.abs(b.time - time) < Math.abs(a.time - time) ? b : a, undefined);
  if (!nearest) return { ok: false, message: 'Listen again.' };
  const error = time - nearest.time;
  if (Math.abs(error) > .18) return { ok: false, message: error < 0 ? 'A little early. Try the next one.' : 'A little late. Try the next one.' };
  if (attempted.has(nearest.index)) return { ok: false, message: onlyOne ? 'One tap on each ONE. Wait for the next ONE.' : 'One tap per beat. Listen for the next one.' };
  attempted.add(nearest.index);
  return { ok: true, message: onlyOne ? 'Nice! That is ONE.' : 'Nice! You found the beat.', error, index: nearest.index };
}
export const TEMPO_PAIRS = [[120, 132], [120, 108], [120, 126]] as const;
export function tempoAnswer(round: number, fast: boolean, heard: boolean): boolean {
  const pair = TEMPO_PAIRS[round];
  return Boolean(heard && pair && (pair[1] > pair[0]) === fast);
}
export type MixState = { step: number; prepared: boolean; playingA: boolean; playingB: boolean; bpmA: number; bpmB: number; volumeA: number; volumeB: number; bassA: number; bassB: number };
export const initialMix = (slow = false): MixState => ({ step: 0, prepared: false, playingA: false, playingB: false, bpmA: slow ? 90 : 120, bpmB: slow ? 96 : 126, volumeA: 1, volumeB: 0, bassA: 1, bassB: 0 });
export const MIX_INSTRUCTIONS = [
  'Press PLAY A.', 'Set the starting point for B.', 'Match B to A\'s speed.', 'Press PLAY B when you hear ONE.',
  'Bring B\'s volume up.', 'Turn A\'s bass down.', 'Bring B\'s bass up.', 'Fade A\'s volume out.',
] as const;
/** The UI cannot advance the lesson by a generic NEXT click. */
export function mixReady(s: MixState): boolean {
  if (s.step === 0) return s.playingA;
  if (!s.playingA || (!s.prepared && s.step > 1)) return false;
  if (s.step === 1) return s.prepared;
  if (s.step === 2) return Math.abs(s.bpmA - s.bpmB) <= .5;
  if (!s.playingB || Math.abs(s.bpmA - s.bpmB) > .5) return false;
  if (s.step === 3) return true;
  if (s.step === 4) return s.volumeB >= .75;
  if (s.volumeB < .75) return false;
  if (s.step === 5) return s.bassA <= .05;
  if (s.bassA > .05) return false;
  if (s.step === 6) return s.bassB >= .8;
  return s.step === 7 && s.bassB >= .8 && s.volumeA <= .03;
}
export function escapeText(text: string): string {
  return text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { SKILLS, SAVE_KEY, freshProgress, readProgress, writeProgress, recordCompletion, localDay, streak, isUnlocked, nextSkill, judgeTap, tempoAnswer, initialMix, mixReady } from '../.game-test/core.js';
const memory = (map = {}) => ({ getItem: k => map[k] ?? null, setItem: (k, v) => { map[k] = v; } });
test('five stable skill IDs and ordered unlocks', () => {
  assert.deepEqual(SKILLS.map(s => s.id), ['beat','one','tempo','match','mix']);
  let p = freshProgress(); assert.equal(isUnlocked(p, 1), false);
  for (let i = 0; i < 5; i++) { assert.equal(nextSkill(p), i); assert.equal(isUnlocked(p, i), true); p = recordCompletion(p, SKILLS[i].id); }
  assert.equal(p.completed.length, 5);
});
test('one credit per distinct beat, rapid taps do not finish a lesson', () => {
  const beats = Array.from({length:12}, (_, i) => ({time: i * .5 + 1, index:i})), used = new Set();
  assert.equal(judgeTap(beats, .99, used).ok, false);
  assert.equal(judgeTap(beats, 1.05, used).ok, true);
  for (let i = 0; i < 20; i++) assert.equal(judgeTap(beats, 1.06 + i / 1000, used).ok, false);
  assert.equal(used.size, 1);
  assert.equal(judgeTap(beats, 1.55, used).ok, true);
});
test('ONE judges bars, not every beat; replay uses a new origin', () => {
  const events = Array.from({length:12}, (_, i) => ({time:i*.5+3, index:i}));
  const used = new Set(); assert.equal(judgeTap(events, 3.53, used, true).ok, false);
  assert.equal(judgeTap(events, 5.04, used, true).ok, true);
  assert.equal(judgeTap(events, 5.07, used, true).ok, false);
  assert.equal(judgeTap([{time:10,index:0}],10.05,new Set(),true).ok,true);
});
test('tempo cannot be answered before hearing the current pair', () => {
  assert.equal(tempoAnswer(0,true,false),false); assert.equal(tempoAnswer(0,true,true),true);
  assert.equal(tempoAnswer(1,true,true),false); assert.equal(tempoAnswer(1,false,true),true);
  assert.equal(tempoAnswer(2,true,true),true); assert.equal(tempoAnswer(3,true,true),false);
});
test('mix advancement requires actual state at every step', () => {
  const s = initialMix(); assert.equal(mixReady(s),false); s.playingA=true; assert.equal(mixReady(s),true);
  s.step=1; assert.equal(mixReady(s),false); s.prepared=true; assert.equal(mixReady(s),true);
  s.step=2; assert.equal(mixReady(s),false); s.bpmB=120; assert.equal(mixReady(s),true);
  s.step=3; assert.equal(mixReady(s),false); s.playingB=true; assert.equal(mixReady(s),true);
  s.step=4; assert.equal(mixReady(s),false); s.volumeB=.8; assert.equal(mixReady(s),true);
  s.step=5; assert.equal(mixReady(s),false); s.bassA=0; assert.equal(mixReady(s),true);
  s.step=6; assert.equal(mixReady(s),false); s.bassB=.9; assert.equal(mixReady(s),true);
  s.step=7; assert.equal(mixReady(s),false); s.volumeA=0; assert.equal(mixReady(s),true);
  s.volumeB=0; assert.equal(mixReady(s),false);
});
test('corrupt, blocked and unsupported saves recover without a crash', () => {
  for (const raw of ['{', 'null', '[]', '{"version":999}', '{"version":2,"completed":null,"days":[]}']) assert.deepEqual(readProgress(memory({[SAVE_KEY]:raw})).progress, freshProgress());
  const blocked = {getItem(){throw new Error('blocked')},setItem(){throw new Error('quota')}};
  assert.ok(readProgress(blocked).notice); assert.equal(writeProgress(blocked,freshProgress()),false);
});
test('v1 save is preserved, not silently mapped from buggy completion numbers', () => {
  const raw = '{"completed":[1,2,3,4]}', map = {'first-mix-progress-v1':raw};
  const result = readProgress(memory(map)); assert.deepEqual(result.progress.completed,[]); assert.ok(result.notice.includes('kept'));
  assert.equal(map['first-mix-progress-v1'],raw);
});
test('sanitization, save round-trip and XP are idempotent on replay', () => {
  const store = memory({[SAVE_KEY]:JSON.stringify({version:2,completed:['beat','beat','bogus'],days:['2026-02-31','2026-10-03',3]})});
  let p=readProgress(store).progress; assert.deepEqual(p.completed,['beat']); assert.deepEqual(p.days,['2026-10-03']);
  p=recordCompletion(p,'beat','2026-10-03'); assert.equal(p.completed.length*100,100); assert.equal(writeProgress(store,p),true); assert.deepEqual(readProgress(store).progress,p);
});
test('streak uses local calendar days and tolerates DST without 24-hour arithmetic', () => {
  const p={version:2,completed:[],days:['2026-10-02','2026-10-03','2026-10-04']};
  assert.equal(streak(p,'2026-10-04'),3); assert.equal(streak(p,'2026-10-05'),3); assert.equal(streak(p,'2026-10-06'),0);
  assert.equal(localDay(new Date(2026,9,4,0,30)), '2026-10-04');
});

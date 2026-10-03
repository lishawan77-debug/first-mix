import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../public/sw.js',import.meta.url),'utf8');
function harness(fetcher=async()=>({ok:true,type:'basic',redirected:false,headers:new Headers(),clone:()=>({})})) {
  const handlers={},writes=[],waits=[],deleted=[];
  const cache={add:async u=>writes.push(u),put:async u=>writes.push(u),match:async()=>new Response('cached')};
  const self={location:{origin:'https://firstmix.test'},clients:{claim:async()=>{}},addEventListener:(name,handler)=>handlers[name]=handler};
  const caches={open:async()=>cache,keys:async()=>['first-mix-v1','first-mix-game-v2','other-app'],delete:async key=>deleted.push(key)};
  vm.runInNewContext(source,{self,caches,URL,Response,fetch:fetcher});
  const event=req=>{const e={request:req,waitUntil:p=>waits.push(p),respondWith:p=>e.response=p};return e};
  return {handlers,writes,waits,deleted,event};
}
test('service worker ignores auth, API and foreign requests',()=>{
  const h=harness();
  for(const url of ['https://firstmix.test/api/customer','https://firstmix.test/auth/callback','https://other.test/music.js']) {
    const e=h.event({method:'GET',url,mode:'cors'});h.handlers.fetch(e);assert.equal(e.response,undefined);
  }
});
test('private or failed responses are not cached',async()=>{
  const h=harness(async()=>({ok:true,type:'basic',redirected:false,headers:new Headers({'Cache-Control':'private, no-store'})}));
  const e=h.event({method:'GET',url:'https://firstmix.test/a.js',mode:'cors'});h.handlers.fetch(e);await e.response;assert.equal(h.writes.length,0);
});
test('offline requests return a cached response',async()=>{
  const h=harness(async()=>{throw new Error('offline')});
  const e=h.event({method:'GET',url:'https://firstmix.test/',mode:'navigate'});h.handlers.fetch(e);assert.equal(await(await e.response).text(),'cached');
});
test('activation only removes old FIRST MIX caches',async()=>{
  const h=harness();h.handlers.activate({waitUntil:p=>h.waits.push(p)});await Promise.all(h.waits);assert.deepEqual(h.deleted,['first-mix-v1']);
});

test('installation does not precache a potentially private document',async()=>{
  const h=harness();h.handlers.install({waitUntil:p=>h.waits.push(p)});await Promise.all(h.waits);assert.deepEqual(h.writes,[]);
});

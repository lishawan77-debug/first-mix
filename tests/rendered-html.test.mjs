import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const root = new URL("../", import.meta.url);

async function render() {
  const workerUrl = new URL(`../dist/server/index.js?test=${Date.now()}`, import.meta.url);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(new Request("http://localhost/", { headers: { accept: "text/html" } }), { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });
}

test("renders FIRST MIX product shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /FIRST MIX/);
  assert.match(html, /Learn to DJ/);
  assert.match(html, /manifest\.webmanifest/);
  assert.doesNotMatch(html, /codex-preview|Starter Project/);
});

test("contains the beginner games and controls", async () => {
  const page = await readFile(new URL("app/page.tsx", root), "utf8");
  for (const skill of ["Play & Pause","Find the Beat","Your First Transition"]) assert.match(page, new RegExp(skill));
  for (const control of ["PLAY","PAUSE","REPLAY FROM START","TAP","CUE TRACK B","Make a Simple Song","Not .* yet"]) assert.match(page, new RegExp(control));
  assert.match(page, /localStorage\.setItem/);
  assert.match(page, /AudioContext/);
  assert.match(page, /serviceWorker/);
});

test("keeps readable type and touch targets", async () => {
  const css = await readFile(new URL("app/globals.css", root), "utf8");
  assert.match(css, /font-size:18px/);
  assert.match(css, /min-height:58px/);
  assert.match(css, /@media\(max-width:700px\)/);
  assert.match(css, /prefers-reduced-motion/);
});

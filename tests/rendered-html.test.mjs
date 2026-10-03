// SSR smoke check only. Gameplay is exercised separately, not inferred from strings.
import assert from 'node:assert/strict';
import test from 'node:test';
test('production entry serves the FIRST MIX document and manifest', async () => {
  const { default: worker } = await import(new URL('../dist/server/index.js', import.meta.url));
  const response = await worker.fetch(new Request('http://localhost/', { headers: { accept: 'text/html' } }), { ASSETS: { fetch: async () => new Response('Not found', { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /FIRST MIX/);
  assert.match(html, /manifest\.webmanifest/);
  assert.doesNotMatch(html, /codex-preview|Starter Project|鈥|鈫|鉁/);
});

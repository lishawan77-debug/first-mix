// Isolated validation harness: the exact emitted game modules, not a replacement UI.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
const root = resolve(new URL('..', import.meta.url).pathname);
const html = '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>FIRST MIX local validation</title><link rel="manifest" href="/manifest.webmanifest"><link rel="stylesheet" href="/app/first-mix.css"><style>body{margin:0}button{color:inherit}</style><main id="app"></main><script type="module">import {mountTrainer} from "/.game-test/trainer.js"; window.disposeFirstMix=mountTrainer(document.getElementById("app"));</script></html>';
const mime = { '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = createServer(async (req,res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  res.setHeader('Cache-Control','public, max-age=0');
  if (pathname === '/') { res.setHeader('Content-Type','text/html'); res.end(html); return; }
  if (pathname === '/manifest.webmanifest') { res.setHeader('Content-Type',mime['.webmanifest']); res.end(JSON.stringify({name:'FIRST MIX',short_name:'FIRST MIX',start_url:'/',display:'standalone',icons:[{src:'/favicon.svg',sizes:'any',type:'image/svg+xml'}]})); return; }
  const relative = ['/sw.js','/favicon.svg'].includes(pathname) ? '/public'+pathname : pathname;
  const file=resolve(root,'.'+relative);
  if (!file.startsWith(root+'/')) {res.writeHead(403);res.end();return;}
  try { const bytes=await readFile(file);res.setHeader('Content-Type',mime[extname(file)] || 'text/plain');res.end(bytes); }
  catch { res.writeHead(404);res.end('Not found'); }
});
server.listen(Number(process.env.PORT || 4173),'127.0.0.1',()=>console.log('FIRST MIX game harness: http://127.0.0.1:4173'));

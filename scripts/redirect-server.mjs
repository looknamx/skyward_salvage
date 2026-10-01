import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const stateFile = process.argv[3] || fileURLToPath(new URL('../.tunnel/state.json', import.meta.url));
const port = Number(process.argv[2] || 3003);
let cached = { target: '', until: 0, online: false };
let pending;

async function currentTarget() {
  try {
    const state = JSON.parse((await readFile(stateFile, 'utf8')).replace(/^\uFEFF/, ''));
    const target = new URL(state.url);
    if (target.protocol !== 'https:' || target.username || target.password ||
        !target.hostname.endsWith('.trycloudflare.com') || target.port ||
        target.pathname !== '/' || target.search || target.hash) return '';
    // A persisted URL from a stopped session must never be used.
    if (!state.serverPid || !state.tunnelPid) return '';
    process.kill(state.serverPid, 0);
    process.kill(state.tunnelPid, 0);
    return target.origin;
  } catch { return ''; }
}

async function isOnline(target) {
  if (cached.target === target && cached.until > Date.now()) return cached.online;
  if (pending?.target === target) return pending.promise;
  const promise = (async () => {
    let online = false;
    try {
      const response = await fetch(`${target}/health`, {
        signal: AbortSignal.timeout(4000), redirect: 'error',
      });
      online = response.ok && (await response.json()).ok === true;
    } catch { /* Show the offline screen until Cloudflare is reachable again. */ }
    cached = { target, online, until: Date.now() + 2000 };
    return online;
  })();
  pending = { target, promise };
  try { return await promise; } finally { if (pending?.promise === promise) pending = undefined; }
}

const offlinePage = `<!doctype html><html lang="th"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="5"><title>Skyward Salvage</title>
<style>body{margin:0;min-height:100dvh;display:grid;place-items:center;background:#102039;color:#f7efd4;font:18px system-ui;text-align:center}main{padding:32px;max-width:520px}h1{color:#ffc76b}p{line-height:1.7}button{border:0;border-radius:12px;padding:14px 24px;background:#72cec0;color:#102039;font:inherit;cursor:pointer}</style>
<main><h1>SKYWARD SALVAGE</h1><p>เกมยังไม่ออนไลน์<br>กำลังรอการเชื่อมต่อ กรุณาลองอีกครั้ง</p><button onclick="location.reload()">ลองอีกครั้ง</button></main></html>`;

const server = http.createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.writeHead(405, { Allow: 'GET, HEAD' }); res.end(); return;
  }
  if (req.url === '/_gateway/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(req.method === 'HEAD' ? undefined : JSON.stringify({ ok: true, service: 'skyward-redirect' }));
    return;
  }
  const target = await currentTarget();
  if (target && await isOnline(target)) {
    // Concatenate with the known origin to keep paths and room query strings,
    // without allowing //host requests to become an open redirect.
    res.writeHead(307, { Location: target + (req.url.startsWith('/') ? req.url : '/') });
    res.end();
  } else {
    res.writeHead(503, { 'Content-Type': 'text/html; charset=utf-8', 'Retry-After': '5' });
    res.end(req.method === 'HEAD' ? undefined : offlinePage);
  }
});
server.requestTimeout = 10000;
server.headersTimeout = 10000;
server.listen(port, '127.0.0.1', () => console.log(`Redirect gateway listening on 127.0.0.1:${port}`));

import http from 'node:http';
import { readFile, mkdir, appendFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const port = Number(process.argv[2] || 3010);
const token = randomBytes(32).toString('hex');
const allowedHosts = new Set([`localhost:${port}`, `127.0.0.1:${port}`]);
const runtimeDir = path.join(root, '.tunnel');
await mkdir(runtimeDir, { recursive: true });
const html = (await readFile(path.join(root, 'scripts/control-panel.html'), 'utf8')).replace('__CONTROL_TOKEN__', token);
const assets = new Map([
  ['/scene.png', ['public/assets/environment/clockwork-orchard.png', 'image/png']],
  ['/favicon.png', ['public/assets/ui/settings-icon.png', 'image/png']],
]);
let busy = '';
let lastError = '';
let cache;
let pendingStatus;

function runScript(script, args = [], timeout = 10000) {
  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'scripts', script), ...args], {cwd: root, windowsHide: true});
    let output = '';
    let errors = '';
    child.stdout.on('data', data => { output = (output + data.toString()).slice(-24000); });
    child.stderr.on('data', data => { errors = (errors + data.toString()).slice(-24000); });
    const timer = setTimeout(() => { child.kill(); reject(new Error('Operation timed out')); }, timeout);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    // Windows helper/background processes can keep inherited pipe handles open
    // after PowerShell exits. Actions finish when that process exits; status
    // queries have no children and wait for close to collect all JSON output.
    child.once(script === 'Set-OnlineState.ps1' ? 'exit' : 'close', code => {
      clearTimeout(timer);
      if (code === 0) resolve(output);
      else reject(new Error(errors || output || `Script exited with ${code}`));
    });
  });
}
async function status() {
  if (cache && cache.until > Date.now()) return cache.value;
  if (pendingStatus) return pendingStatus;
  pendingStatus = runScript('Get-OnlineStatus.ps1').then(output => {
    const value = JSON.parse(output.replace(/^\uFEFF/, '').trim());
    cache = {value, until: Date.now() + 1500};
    return value;
  }).finally(() => { pendingStatus = undefined; });
  return pendingStatus;
}
function json(res, code, value) {
  res.writeHead(code, {'Content-Type':'application/json; charset=utf-8'});
  res.end(JSON.stringify(value));
}
function authorized(req) {
  const origin = req.headers.origin;
  if (!origin || !allowedHosts.has(new URL(origin).host) || new URL(origin).protocol !== 'http:') return false;
  const candidate = Buffer.from(String(req.headers['x-control-token'] || ''));
  const expected = Buffer.from(token);
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}
const server = http.createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  if (!allowedHosts.has(req.headers.host)) return json(res, 403, {error:'Local access only'});
  try {
    if (req.method === 'GET' && req.url === '/health') return json(res, 200, {ok:true, service:'skyward-control-panel'});
    if (req.method === 'GET' && req.url === '/api/status') return json(res, 200, {...await status(), busy, error:lastError});
    if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
      res.writeHead(200, {'Content-Type':'text/html; charset=utf-8'}); res.end(html); return;
    }
    if (req.method === 'GET' && assets.has(req.url)) {
      const [file, type] = assets.get(req.url);
      const data = await readFile(path.join(root, file));
      res.writeHead(200, {'Content-Type':type}); res.end(data); return;
    }
    if (req.method === 'POST' && ['/api/start','/api/stop'].includes(req.url)) {
      if (!authorized(req)) return json(res, 403, {error:'Local page authorization required'});
      if (busy) return json(res, 409, {error:'An operation is already running'});
      const action = req.url === '/api/start' ? 'start' : 'stop';
      if (action === 'start' && (await status()).online) return json(res, 200, {ok:true});
      // Set before any more asynchronous work to prevent duplicate operations.
      if (busy) return json(res, 409, {error:'An operation is already running'});
      busy = action;
      lastError = '';
      json(res, 202, {ok:true});
      runScript('Set-OnlineState.ps1', ['-Action', action], 240000).catch(async error => {
        lastError = action === 'start' ? 'เปิดเกมไม่สำเร็จ กรุณาดูไฟล์ .tunnel/control-actions.log แล้วลองอีกครั้ง' : 'ปิดระบบไม่สำเร็จ กรุณาลองอีกครั้ง';
        await appendFile(path.join(runtimeDir, 'control-actions.log'), `${new Date().toISOString()} ${action}: ${error.message}\n`).catch(() => {});
      }).finally(() => { busy = ''; cache = undefined; });
      return;
    }
    json(res, 404, {error:'Not found'});
  } catch { json(res, 500, {error:'อ่านสถานะระบบไม่ได้ กรุณาลองอีกครั้ง'}); }
});
server.requestTimeout = 10000;
server.headersTimeout = 10000;
server.listen(port, '127.0.0.1', () => console.log(`Skyward control panel: http://localhost:${port}`));

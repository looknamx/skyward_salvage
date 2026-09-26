import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { randomBytes } from 'node:crypto';
import { WebSocket, WebSocketServer } from 'ws';
import { createState, finishOrAdvance, fireShot, fireTeleport, makePlayer, MAX_PLAYERS, movePlayer, startRound, turnPlayer, useItem } from '../shared/game.ts';
import type { ClientAction, GameState, MobileKind, ServerEvent } from '../shared/game.ts';

const PORT = Number(process.env.PORT || 3001);
const rooms = new Map<string, GameState>();
const clients = new Map<WebSocket, { id: string; code: string }>();
const movement = new Map<string, { playerId: string; direction: -1 | 1 }>();
const wss = new WebSocketServer({ noServer: true });
const dist = resolve(import.meta.dirname, '../dist');

function send(ws: WebSocket, event: ServerEvent): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(event));
}

function broadcast(code: string, event: ServerEvent): void {
  for (const [socket, client] of clients) if (client.code === code) send(socket, event);
}

function stateBroadcast(state: GameState): void { broadcast(state.code, { type: 'state', state }); }
function error(ws: WebSocket, message: string): void { send(ws, { type: 'error', message }); }
function cleanName(value: unknown): string {
  const name = String(value ?? '').trim().replace(/[<>\x00-\x1f]/g, '').slice(0, 18);
  if (!name) throw new Error('กรุณาใส่ชื่อ');
  return name;
}
function mobile(value: unknown): MobileKind {
  if (value !== 'loom' && value !== 'manta' && value !== 'borer') throw new Error('Mobile ไม่ถูกต้อง');
  return value;
}
function roomCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  do {
    code = Array.from(randomBytes(6), byte => alphabet[byte % alphabet.length]).join('');
  } while (rooms.has(code));
  return code;
}

function handleAction(ws: WebSocket, action: ClientAction): void {
  const current = clients.get(ws);
  if (action.type === 'create') {
    if (current) throw new Error('คุณอยู่ในห้องแล้ว');
    const id = randomBytes(12).toString('hex');
    const code = roomCode();
    const state = createState(code, id, cleanName(action.name), mobile(action.mobile));
    rooms.set(code, state);
    clients.set(ws, { id, code });
    send(ws, { type: 'welcome', id, code });
    stateBroadcast(state);
    return;
  }
  if (action.type === 'join') {
    if (current) throw new Error('คุณอยู่ในห้องแล้ว');
    const code = String(action.code ?? '').toUpperCase().trim();
    const state = rooms.get(code);
    if (!state || state.phase !== 'lobby') throw new Error('ไม่พบห้องที่รอผู้เล่น');
    if (state.players.length >= MAX_PLAYERS) throw new Error('ห้องเต็มแล้ว');
    const id = randomBytes(12).toString('hex');
    state.players.push(makePlayer(id, cleanName(action.name), mobile(action.mobile)));
    clients.set(ws, { id, code });
    send(ws, { type: 'welcome', id, code });
    stateBroadcast(state);
    return;
  }
  if (!current) throw new Error('กรุณาสร้างหรือเข้าห้องก่อน');
  const state = rooms.get(current.code);
  if (!state) throw new Error('ห้องนี้ปิดแล้ว');
  const player = state.players.find(p => p.id === current.id);
  if (!player) throw new Error('ไม่พบผู้เล่น');
  if (action.type === 'select') {
    if (state.phase !== 'lobby') throw new Error('เริ่มเกมแล้ว');
    player.mobile = mobile(action.mobile);
  } else if (action.type === 'start') {
    if (state.hostId !== current.id) throw new Error('เจ้าของห้องเท่านั้นที่เริ่มได้');
    startRound(state, randomBytes(4).readUInt32LE(0), Date.now());
  } else if (action.type === 'move') {
    const direction = Number(action.direction);
    if (direction !== -1 && direction !== 0 && direction !== 1) throw new Error('ทิศทางเดินไม่ถูกต้อง');
    if (direction === 0) {
      if (movement.get(state.code)?.playerId === current.id) movement.delete(state.code);
      return;
    }
    if (state.phase !== 'playing' || state.activeId !== current.id) throw new Error('ยังไม่ใช่เทิร์นของคุณ');
    movement.set(state.code, { playerId: current.id, direction });
    return;
  } else if (action.type === 'turn') {
    movement.delete(state.code);
    turnPlayer(state, current.id);
  } else if (action.type === 'fire') {
    movement.delete(state.code);
    const shot = fireShot(state, current.id, Number(action.angle), Number(action.power), Date.now());
    broadcast(state.code, { type: 'shot', shot });
  } else if (action.type === 'item') {
    if (action.item === 'teleport') {
      movement.delete(state.code);
      const shot = fireTeleport(state, current.id, Number(action.angle), Number(action.power), Date.now());
      broadcast(state.code, { type: 'shot', shot });
    } else {
      if (action.item === 'repair') movement.delete(state.code);
      useItem(state, current.id, action.item, Date.now());
    }
  } else {
    throw new Error('คำสั่งไม่ถูกต้อง');
  }
  stateBroadcast(state);
}

wss.on('connection', ws => {
  ws.on('message', raw => {
    try {
      const size = Array.isArray(raw) ? raw.reduce((sum, part) => sum + part.byteLength, 0) : raw.byteLength;
      if (size > 1024) throw new Error('ข้อมูลยาวเกินไป');
      const action = JSON.parse(raw.toString()) as ClientAction;
      if (!action || typeof action.type !== 'string') throw new Error('ข้อมูลไม่ถูกต้อง');
      handleAction(ws, action);
    } catch (cause) {
      error(ws, cause instanceof Error ? cause.message : 'ข้อมูลไม่ถูกต้อง');
    }
  });
  ws.on('close', () => {
    const client = clients.get(ws);
    if (!client) return;
    clients.delete(ws);
    const state = rooms.get(client.code);
    if (!state) return;
    const player = state.players.find(p => p.id === client.id);
    if (!player) return;
    if (movement.get(state.code)?.playerId === client.id) movement.delete(state.code);
    if (state.phase === 'lobby') {
      state.players = state.players.filter(p => p.id !== client.id);
      if (state.players.length === 0) { rooms.delete(client.code); return; }
      if (state.hostId === client.id) state.hostId = state.players[0].id;
    } else if (state.phase === 'playing') {
      player.connected = false;
      player.hp = 0;
      if (state.activeId === client.id || state.players.filter(p => p.hp > 0 && p.connected).length <= 1) finishOrAdvance(state, Date.now());
    }
    if (![...clients.values()].some(other => other.code === client.code)) { rooms.delete(client.code); return; }
    stateBroadcast(state);
  });
});

let lastTick = Date.now();
setInterval(() => {
  const now = Date.now();
  const elapsed = Math.max(0, Math.min(100, now - lastTick));
  lastTick = now;
  for (const state of rooms.values()) {
    if (state.phase === 'playing' && now >= state.deadline) {
      const name = state.players.find(p => p.id === state.activeId)?.name ?? '';
      movement.delete(state.code);
      finishOrAdvance(state, now);
      state.message = `${name} หมดเวลา`;
      stateBroadcast(state);
      continue;
    }
    const input = movement.get(state.code);
    if (state.phase === 'playing' && input) {
      if (state.activeId !== input.playerId) { movement.delete(state.code); continue; }
      if (movePlayer(state, input.playerId, input.direction, elapsed)) stateBroadcast(state);
    }
  }
}, 50);

const mime: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = createServer(async (req, res) => {
  if (req.url === '/health') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, rooms: rooms.size })); return; }
  const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
  const target = resolve(dist, `.${pathname === '/' ? '/index.html' : pathname}`);
  if (!target.startsWith(dist + sep) && target !== dist) { res.writeHead(403); res.end(); return; }
  try {
    const file = (await stat(target)).isFile() ? target : resolve(dist, 'index.html');
    const data = await readFile(file);
    res.writeHead(200, {
      'content-type': mime[extname(file)] ?? 'application/octet-stream',
      ...(extname(file) === '.html' ? { 'cache-control': 'no-store' } : {}),
    });
    res.end(data);
  } catch {
    res.writeHead(404); res.end('Build the client with npm run build first.');
  }
});
server.on('upgrade', (req, socket, head) => {
  if (new URL(req.url ?? '/', 'http://localhost').pathname !== '/ws') { socket.destroy(); return; }
  wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
});
server.listen(PORT, '0.0.0.0', () => console.log(`Skyward Salvage server on http://localhost:${PORT}`));

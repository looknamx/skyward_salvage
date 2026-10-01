import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { randomBytes } from 'node:crypto';
import { WebSocket, WebSocketServer } from 'ws';
import { createState, EQUIPMENT_SETS, EQUIPMENT_SLOTS, finishOrAdvance, fireShot, fireTeleport, makePlayer, MAX_PLAYERS, maxHpFor, MOBILE_INFO, movePlayer, ORDINARY_MOBILES, randomEquipmentFromRoll, randomMobileFromRoll, resetPractice, returnToLobby, selectPracticeMobile, startRound, turnPlayer, useItem } from '../shared/game.ts';
import type { ClientAction, GameState, MatchSummary, OrdinaryMobileKind, ServerEvent } from '../shared/game.ts';

const PORT = Number(process.env.PORT || 3001);
const RECONNECT_GRACE_MS = 45_000;
const MAX_MESSAGES_PER_10S = 120;
const allowedOrigins = new Set((process.env.ALLOWED_ORIGINS ?? '').split(',').map(value => value.trim()).filter(Boolean));
const rooms = new Map<string, GameState>();
type Session = { id: string; code: string; token: string };
const clients = new Map<WebSocket, Session>();
const sessions = new Map<string, Session>();
const movement = new Map<string, { playerId: string; direction: -1 | 1 }>();
const reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
const summarySent = new Set<string>();
const heartbeats = new WeakMap<WebSocket, boolean>();
const rateLimits = new WeakMap<WebSocket, { started: number; count: number }>();
const wss = new WebSocketServer({ noServer: true, maxPayload: 1024, perMessageDeflate: false });
const dist = resolve(import.meta.dirname, '../dist');

function send(ws: WebSocket, event: ServerEvent): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(event));
}

function broadcast(code: string, event: ServerEvent): void {
  for (const [socket, client] of clients) if (client.code === code) send(socket, event);
}

function stateBroadcast(state: GameState): void {
  for (const [socket, client] of clients) {
    if (client.code !== state.code) continue;
    if (state.phase !== 'lobby') { send(socket, { type: 'state', state }); continue; }
    const privateState = { ...state, players: state.players.map(player => player.id === client.id ? player : {
      ...player, equipment: { hat: null, armor: null, flag: null }, randomEquipment: { hat: false, armor: false, flag: false }, hp: MOBILE_INFO[player.mobile].maxHp,
    }) };
    send(socket, { type: 'state', state: privateState });
  }
}
function error(ws: WebSocket, message: string): void { send(ws, { type: 'error', message }); }
function sessionKey(session: Session): string { return `${session.code}:${session.id}`; }
function makeSession(id: string, code: string): Session {
  const session = { id, code, token: randomBytes(24).toString('hex') };
  sessions.set(session.token, session);
  return session;
}
function welcome(ws: WebSocket, session: Session, resumed: boolean): void {
  clients.set(ws, session);
  send(ws, { type: 'welcome', id: session.id, code: session.code, token: session.token, resumed });
}
function makeSummary(state: GameState): MatchSummary {
  return {
    code: state.code, mode: state.mode, winnerId: state.winnerId, winnerTeam: state.winnerTeam,
    players: state.players.map(player => ({ id: player.id, name: player.name, mobile: player.mobile, team: player.team, stats: { ...player.stats } })),
  };
}
function broadcastSummaryIfFinished(state: GameState): void {
  if (state.phase !== 'finished' || summarySent.has(state.code)) return;
  summarySent.add(state.code);
  broadcast(state.code, { type: 'match-summary', summary: makeSummary(state) });
}
function discardRoom(code: string): void {
  rooms.delete(code);
  movement.delete(code);
  summarySent.delete(code);
  for (const [token, session] of sessions) if (session.code === code) sessions.delete(token);
  for (const [key, timer] of reconnectTimers) if (key.startsWith(`${code}:`)) { clearTimeout(timer); reconnectTimers.delete(key); }
}
function tryRematch(state: GameState): void {
  if (state.phase !== 'finished') return;
  const connected = state.players.filter(player => player.connected);
  if (connected.length < 2 || (state.mode === 'teams' && connected.length !== 4)) return;
  if (state.players.some(player => !player.connected && [...sessions.values()].some(session => session.code === state.code && session.id === player.id))) return;
  if (!connected.every(player => state.rematchReady.includes(player.id))) return;
  state.players = connected;
  if (!connected.some(player => player.id === state.hostId)) state.hostId = connected[0].id;
  summarySent.delete(state.code);
  returnToLobby(state);
}
function resumePlayer(ws: WebSocket, token: string): void {
  const session = sessions.get(token);
  const state = session && rooms.get(session.code);
  const player = state?.players.find(candidate => candidate.id === session?.id);
  if (!session || !state || !player) throw new Error('ห้องเดิมหมดอายุแล้ว');
  for (const [other, client] of clients) {
    if (other !== ws && client.code === session.code && client.id === session.id) { clients.delete(other); other.close(4000, 'resumed elsewhere'); }
  }
  const key = sessionKey(session);
  clearTimeout(reconnectTimers.get(key));
  reconnectTimers.delete(key);
  player.connected = true;
  if (state.phase === 'playing' && !state.activeId && player.hp > 0) {
    state.activeId = player.id;
    state.deadline = Date.now() + 30_000;
    state.message = `${player.name} กลับเข้าห้องแล้ว`;
  }
  welcome(ws, session, true);
  stateBroadcast(state);
  if (state.phase === 'finished') send(ws, { type: 'match-summary', summary: makeSummary(state) });
}
function expireSession(session: Session): void {
  reconnectTimers.delete(sessionKey(session));
  const state = rooms.get(session.code);
  const player = state?.players.find(candidate => candidate.id === session.id);
  if (!state || !player || player.connected) return;
  if (state.mode === 'practice') { discardRoom(session.code); return; }
  sessions.delete(session.token);
  if (state.phase === 'playing') {
    player.hp = 0;
    const living = state.players.filter(candidate => candidate.hp > 0);
    const teamCount = new Set(living.map(candidate => candidate.team)).size;
    if (state.activeId === player.id || (state.mode === 'teams' ? teamCount <= 1 : living.length <= 1)) finishOrAdvance(state, Date.now());
  } else {
    state.players = state.players.filter(candidate => candidate.id !== player.id);
    state.rematchReady = state.rematchReady.filter(id => id !== player.id);
    state.lobbyReady = state.lobbyReady.filter(id => id !== player.id);
    if (state.hostId === player.id) state.hostId = state.players[0]?.id ?? '';
    if (state.phase === 'finished') tryRematch(state);
  }
  if (!state.players.length || (![...clients.values()].some(client => client.code === session.code) && ![...reconnectTimers.keys()].some(key => key.startsWith(`${session.code}:`)))) {
    discardRoom(session.code);
    return;
  }
  stateBroadcast(state);
  broadcastSummaryIfFinished(state);
}
function cleanName(value: unknown): string {
  const name = String(value ?? '').trim().replace(/[<>\x00-\x1f]/g, '').slice(0, 18);
  if (!name) throw new Error('กรุณาใส่ชื่อ');
  return name;
}
function mobile(value: unknown): OrdinaryMobileKind {
  if (!ORDINARY_MOBILES.includes(value as OrdinaryMobileKind)) throw new Error('Mobile ไม่ถูกต้อง');
  return value as OrdinaryMobileKind;
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
  if (action.type === 'resume') {
    if (current) throw new Error('คุณอยู่ในห้องแล้ว');
    if (typeof action.token !== 'string' || !/^[0-9a-f]{48}$/.test(action.token)) throw new Error('รหัสกลับเข้าห้องไม่ถูกต้อง');
    resumePlayer(ws, action.token);
    return;
  }
  if (action.type === 'create') {
    if (current) throw new Error('คุณอยู่ในห้องแล้ว');
    const id = randomBytes(12).toString('hex');
    const code = roomCode();
    const state = createState(code, id, cleanName(action.name), mobile(action.mobile ?? 'loom'));
    rooms.set(code, state);
    welcome(ws, makeSession(id, code), false);
    stateBroadcast(state);
    return;
  }
  if (action.type === 'practice') {
    if (current) throw new Error('คุณอยู่ในห้องแล้ว');
    const id = randomBytes(12).toString('hex');
    const code = roomCode();
    const kind = action.mobile ?? 'loom';
    if (!Object.hasOwn(MOBILE_INFO, kind)) throw new Error('Mobile ไม่ถูกต้อง');
    const state = createState(code, id, cleanName(action.name), kind);
    state.mode = 'practice';
    state.players.push(makePlayer(`target-${code}`, 'หุ่นฝึก', 'borer'));
    startRound(state, randomBytes(4).readUInt32LE(0), Date.now());
    state.message = 'โหมดฝึก · ยิงเป้าได้ต่อเนื่อง';
    rooms.set(code, state);
    welcome(ws, makeSession(id, code), false);
    stateBroadcast(state);
    return;
  }
  if (action.type === 'join') {
    if (current) throw new Error('คุณอยู่ในห้องแล้ว');
    const code = String(action.code ?? '').toUpperCase().trim();
    const state = rooms.get(code);
    if (!state || state.phase !== 'lobby' || state.mode === 'practice') throw new Error('ไม่พบห้องที่รอผู้เล่น');
    if (state.players.length >= MAX_PLAYERS) throw new Error('ห้องเต็มแล้ว');
    const id = randomBytes(12).toString('hex');
    state.players.push(makePlayer(id, cleanName(action.name), mobile(action.mobile ?? 'loom')));
    state.lobbyReady = [];
    welcome(ws, makeSession(id, code), false);
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
    if (state.lobbyReady.includes(current.id)) throw new Error('ยกเลิกพร้อมก่อนเปลี่ยน Mobile');
    player.mobile = mobile(action.mobile);
    player.randomUsed = false;
    player.hp = maxHpFor(player);
  } else if (action.type === 'equip') {
    if (state.phase !== 'lobby') throw new Error('เปลี่ยนของสวมใส่ได้ในห้องเตรียมเกมเท่านั้น');
    if (state.lobbyReady.includes(current.id)) throw new Error('ยกเลิกพร้อมก่อนเปลี่ยนของสวมใส่');
    if (!EQUIPMENT_SLOTS.includes(action.slot) || (action.set !== null && !EQUIPMENT_SETS.includes(action.set))) throw new Error('ของสวมใส่ไม่ถูกต้อง');
    player.equipment[action.slot] = action.set;
    player.randomEquipment[action.slot] = false;
    player.hp = maxHpFor(player);
  } else if (action.type === 'random-equipment') {
    if (state.phase !== 'lobby') throw new Error('สุ่มของสวมใส่ได้ในห้องเตรียมเกมเท่านั้น');
    if (state.lobbyReady.includes(current.id)) throw new Error('ยกเลิกพร้อมก่อนเปลี่ยนของสวมใส่');
    if (!EQUIPMENT_SLOTS.includes(action.slot)) throw new Error('ช่องของสวมใส่ไม่ถูกต้อง');
    player.randomEquipment[action.slot] = true;
    player.equipment[action.slot] = null;
    player.hp = maxHpFor(player);
  } else if (action.type === 'random-mobile') {
    if (state.phase !== 'lobby') throw new Error('เริ่มเกมแล้ว');
    if (state.lobbyReady.includes(current.id)) throw new Error('ยกเลิกพร้อมก่อนสุ่ม Mobile');
    player.randomUsed = true;
  } else if (action.type === 'lobby-ready') {
    if (state.phase !== 'lobby' || state.hostId === current.id) throw new Error('ผู้เล่นในห้องเท่านั้นที่กดพร้อมได้');
    if (typeof action.ready !== 'boolean') throw new Error('สถานะพร้อมไม่ถูกต้อง');
    state.lobbyReady = state.lobbyReady.filter(id => id !== current.id);
    if (action.ready) state.lobbyReady.push(current.id);
  } else if (action.type === 'set-mode') {
    if (state.phase !== 'lobby' || state.hostId !== current.id) throw new Error('เจ้าของห้องเท่านั้นที่เลือกโหมดได้');
    if (action.mode !== 'ffa' && action.mode !== 'teams') throw new Error('โหมดไม่ถูกต้อง');
    state.mode = action.mode;
    state.lobbyReady = [];
  } else if (action.type === 'start') {
    if (state.hostId !== current.id) throw new Error('เจ้าของห้องเท่านั้นที่เริ่มได้');
    if (state.phase !== 'lobby') throw new Error('เกมเริ่มไปแล้ว');
    startRound(state, randomBytes(4).readUInt32LE(0), Date.now());
    for (const entrant of state.players) {
      if (entrant.randomUsed) {
        const rolls = randomBytes(8);
        entrant.mobile = randomMobileFromRoll(rolls.readUInt32LE(0) / 4294967296, rolls.readUInt32LE(4) / 4294967296);
      }
      for (const slot of EQUIPMENT_SLOTS) {
        if (entrant.randomEquipment[slot]) entrant.equipment[slot] = randomEquipmentFromRoll(randomBytes(4).readUInt32LE(0) / 4294967296);
      }
      entrant.hp = maxHpFor(entrant);
    }
    summarySent.delete(state.code);
  } else if (action.type === 'practice-mobile') {
    selectPracticeMobile(state, current.id, action.mobile, Date.now());
    movement.delete(state.code);
  } else if (action.type === 'reset-practice') {
    if (state.mode !== 'practice' || current.id !== state.hostId) throw new Error('ใช้ได้เฉพาะโหมดฝึก');
    movement.delete(state.code);
    resetPractice(state, randomBytes(4).readUInt32LE(0), Date.now());
  } else if (action.type === 'rematch-ready') {
    if (state.phase !== 'finished') throw new Error('ยังไม่จบรอบ');
    if (typeof action.ready !== 'boolean') throw new Error('สถานะพร้อมเล่นไม่ถูกต้อง');
    state.rematchReady = state.rematchReady.filter(id => id !== current.id);
    if (action.ready) state.rematchReady.push(current.id);
    tryRematch(state);
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
    const hpBefore = new Map(state.players.map(target => [target.id, target.hp]));
    if (action.special !== undefined && typeof action.special !== 'boolean') throw new Error('ชนิดกระสุนไม่ถูกต้อง');
    const shot = fireShot(state, current.id, Number(action.angle), Number(action.power), Date.now(), action.special === true);
    if (action.special === true) broadcast(state.code, { type: 'item-used', item: 'special' });
    broadcast(state.code, { type: 'shot', shot });
    if (shot.hitIds?.length || state.players.some(target => target.hp < (hpBefore.get(target.id) ?? target.hp))) broadcast(state.code, { type: 'hit' });
  } else if (action.type === 'item') {
    if (action.item === 'teleport') {
      movement.delete(state.code);
      const oldDrops = [...state.drops];
      const shot = fireTeleport(state, current.id, Number(action.angle), Number(action.power), Date.now());
      broadcast(state.code, { type: 'item-used', item: 'teleport' });
      broadcast(state.code, { type: 'shot', shot });
      const picked = oldDrops.find(drop => !state.drops.some(currentDrop => currentDrop.id === drop.id));
      if (picked) broadcast(state.code, { type: 'item-picked', item: picked.item, playerId: current.id });
    } else {
      if (action.item === 'repair') movement.delete(state.code);
      useItem(state, current.id, action.item, Date.now());
      broadcast(state.code, { type: 'item-used', item: action.item });
    }
  } else {
    throw new Error('คำสั่งไม่ถูกต้อง');
  }
  stateBroadcast(state);
  broadcastSummaryIfFinished(state);
}

wss.on('connection', ws => {
  heartbeats.set(ws, true);
  rateLimits.set(ws, { started: Date.now(), count: 0 });
  ws.on('pong', () => heartbeats.set(ws, true));
  ws.on('message', raw => {
    try {
      const limit = rateLimits.get(ws)!;
      const now = Date.now();
      if (now - limit.started >= 10_000) { limit.started = now; limit.count = 0; }
      if (++limit.count > MAX_MESSAGES_PER_10S) { ws.close(1008, 'rate limit'); return; }
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
    player.connected = false;
    state.rematchReady = state.rematchReady.filter(id => id !== client.id);
    state.lobbyReady = state.lobbyReady.filter(id => id !== client.id);
    if (state.phase === 'playing' && state.activeId === client.id) finishOrAdvance(state, Date.now());
    const key = sessionKey(client);
    clearTimeout(reconnectTimers.get(key));
    reconnectTimers.set(key, setTimeout(() => expireSession(client), RECONNECT_GRACE_MS));
    stateBroadcast(state);
    broadcastSummaryIfFinished(state);
  });
});

const heartbeatInterval = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.readyState !== WebSocket.OPEN) continue;
    if (heartbeats.get(ws) === false) { ws.terminate(); continue; }
    heartbeats.set(ws, false);
    ws.ping();
  }
}, 30_000);
wss.on('close', () => clearInterval(heartbeatInterval));

let lastTick = Date.now();
setInterval(() => {
  const now = Date.now();
  const elapsed = Math.max(0, Math.min(100, now - lastTick));
  lastTick = now;
  for (const state of rooms.values()) {
    if (state.phase === 'playing' && state.activeId && state.deadline && now >= state.deadline) {
      const name = state.players.find(p => p.id === state.activeId)?.name ?? '';
      movement.delete(state.code);
      finishOrAdvance(state, now);
      state.message = `${name} หมดเวลา`;
      stateBroadcast(state);
      broadcastSummaryIfFinished(state);
      continue;
    }
    const input = movement.get(state.code);
    if (state.phase === 'playing' && input) {
      if (state.activeId !== input.playerId) { movement.delete(state.code); continue; }
      const oldDrops = [...state.drops];
      if (movePlayer(state, input.playerId, input.direction, elapsed)) {
        const picked = oldDrops.find(drop => !state.drops.some(currentDrop => currentDrop.id === drop.id));
        if (picked) broadcast(state.code, { type: 'item-picked', item: picked.item, playerId: input.playerId });
        stateBroadcast(state);
        broadcastSummaryIfFinished(state);
      }
    }
  }
}, 50);

const mime: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg' };
const server = createServer(async (req, res) => {
  if (req.url === '/health') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, rooms: rooms.size })); return; }
  let pathname: string;
  try { pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname); }
  catch { res.writeHead(400); res.end('Invalid path'); return; }
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
  const origin = req.headers.origin;
  let originAllowed = !origin;
  if (origin) {
    try { originAllowed = allowedOrigins.size ? allowedOrigins.has(origin) : new URL(origin).host === req.headers.host; }
    catch { originAllowed = false; }
  }
  if (!originAllowed) { socket.write('HTTP/1.1 403 Forbidden\r\n\r\n'); socket.destroy(); return; }
  if (wss.clients.size >= 128) { socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n'); socket.destroy(); return; }
  wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
});
server.listen(PORT, '0.0.0.0', () => console.log(`Skyward Salvage server on http://localhost:${PORT}`));

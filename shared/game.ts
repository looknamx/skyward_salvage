export const WIDTH = 1280;
export const HEIGHT = 720;
export const STEP = 10;
export const TURN_MS = 30_000;
export const MAX_PLAYERS = 4;
export const MOVE_SPEED = 88;
export const TURN_MOVE_LIMIT = 350;
export const MIN_POWER = 5;

export type MobileKind = 'loom' | 'manta' | 'borer' | 'vesper' | 'bramble' | 'aegis';
export type OrdinaryMobileKind = Exclude<MobileKind, 'aegis'>;
export type MapKind = 'cloud-reef' | 'clockwork-orchard' | 'glass-dunes';
export type ItemKind = 'double' | 'repair' | 'teleport';
export type MatchMode = 'ffa' | 'teams';
export type Team = 0 | 1;
export interface PlayerStats { shots: number; hits: number; damageDealt: number; damageTaken: number; itemsUsed: number; pickups: number; distanceMoved: number }
export interface ItemDrop { id: string; item: ItemKind; x: number; y: number; spawnedTurn: number }

export interface PlayerState {
  id: string;
  name: string;
  mobile: MobileKind;
  x: number;
  y: number;
  hp: number;
  items: Record<ItemKind, number>;
  doubleArmed: boolean;
  connected: boolean;
  facing: -1 | 1;
  team: Team | null;
  specialAvailable: boolean;
  stats: PlayerStats;
  walkedThisTurn: number;
  randomUsed: boolean;
}

export interface GameState {
  code: string;
  phase: 'lobby' | 'playing' | 'finished';
  hostId: string;
  players: PlayerState[];
  terrain: number[];
  map: MapKind;
  seed: number;
  wind: number;
  turn: number;
  activeId: string | null;
  deadline: number;
  winnerId: string | null;
  message: string;
  mode: MatchMode;
  winnerTeam: Team | null;
  rematchReady: string[];
  lobbyReady: string[];
  drops: ItemDrop[];
}

export interface Point { x: number; y: number }
export interface Impact extends Point { radius: number; damage: number }
export interface ShotResult { kind: 'damage' | 'teleport'; paths: Point[][]; impacts: Impact[]; special?: boolean; hitIds?: string[] }
export interface MatchSummary { code: string; mode: MatchMode; winnerId: string | null; winnerTeam: Team | null; players: Pick<PlayerState, 'id' | 'name' | 'mobile' | 'team' | 'stats'>[] }

export type ClientAction =
  | { type: 'create'; name: string; mobile?: OrdinaryMobileKind }
  | { type: 'join'; code: string; name: string; mobile?: OrdinaryMobileKind }
  | { type: 'select'; mobile: OrdinaryMobileKind }
  | { type: 'random-mobile' }
  | { type: 'lobby-ready'; ready: boolean }
  | { type: 'start' }
  | { type: 'set-mode'; mode: MatchMode }
  | { type: 'rematch-ready'; ready: boolean }
  | { type: 'resume'; token: string }
  | { type: 'move'; direction: -1 | 0 | 1 }
  | { type: 'turn' }
  | { type: 'fire'; angle: number; power: number; special?: boolean }
  | { type: 'item'; item: ItemKind; angle?: number; power?: number };

export type ServerEvent =
  | { type: 'welcome'; id: string; code: string; token: string; resumed: boolean }
  | { type: 'state'; state: GameState }
  | { type: 'shot'; shot: ShotResult }
  | { type: 'hit' }
  | { type: 'item-used'; item: ItemKind | 'special' }
  | { type: 'item-picked'; item: ItemKind; playerId: string }
  | { type: 'match-summary'; summary: MatchSummary }
  | { type: 'error'; message: string };

export const MOBILE_INFO: Record<MobileKind, { label: string; color: number; damage: number; radius: number; crater: number; maxHp: number }> = {
  loom: { label: 'Loom', color: 0xf67868, damage: 32, radius: 58, crater: 25, maxHp: 100 },
  manta: { label: 'Manta', color: 0x4ab8af, damage: 22, radius: 42, crater: 16, maxHp: 100 },
  borer: { label: 'Borer', color: 0xf5c35a, damage: 38, radius: 68, crater: 40, maxHp: 100 },
  vesper: { label: 'Vesper', color: 0xb897ef, damage: 29, radius: 49, crater: 19, maxHp: 100 },
  bramble: { label: 'Bramble', color: 0x9bcf83, damage: 27, radius: 55, crater: 18, maxHp: 100 },
  aegis: { label: 'Aegis', color: 0x72d9f4, damage: 34, radius: 59, crater: 24, maxHp: 150 },
};
export const ORDINARY_MOBILES: OrdinaryMobileKind[] = ['loom', 'manta', 'borer', 'vesper', 'bramble'];
export function randomMobileFromRoll(rareRoll: number, ordinaryRoll: number): MobileKind {
  if (rareRoll < 0.05) return 'aegis';
  return ORDINARY_MOBILES[Math.min(ORDINARY_MOBILES.length - 1, Math.floor(ordinaryRoll * ORDINARY_MOBILES.length))];
}
const ITEM_KINDS: ItemKind[] = ['double', 'repair', 'teleport'];
function emptyStats(): PlayerStats { return { shots: 0, hits: 0, damageDealt: 0, damageTaken: 0, itemsUsed: 0, pickups: 0, distanceMoved: 0 }; }

export function random(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeTerrain(seed: number): number[] {
  const next = random(seed);
  const phaseA = next() * Math.PI * 2;
  const phaseB = next() * Math.PI * 2;
  const phaseC = next() * Math.PI * 2;
  return Array.from({ length: WIDTH / STEP + 1 }, (_, i) => {
    const x = i * STEP;
    const rolling = 26 * Math.sin(x / 120 + phaseA) + 18 * Math.sin(x / 54 + phaseB);
    const shelves = 17 * Math.sin(x / 250 + phaseC);
    return Math.round(Math.max(390, Math.min(565, 486 + rolling + shelves)));
  });
}

export function groundAt(terrain: number[], x: number): number {
  const index = Math.max(0, Math.min(terrain.length - 2, Math.floor(x / STEP)));
  const fraction = Math.max(0, Math.min(1, x / STEP - index));
  return terrain[index] * (1 - fraction) + terrain[index + 1] * fraction;
}

export function vehicleTilt(terrain: number[], x: number): number {
  const slope = Math.atan2(groundAt(terrain, x + 24) - groundAt(terrain, x - 24), 48);
  return Math.max(-0.35, Math.min(0.35, slope));
}

export function settlePlayers(state: GameState): void {
  for (const player of state.players) player.y = groundAt(state.terrain, player.x) - 13;
}

export function createState(code: string, hostId: string, name: string, mobile: MobileKind): GameState {
  return {
    code, phase: 'lobby', hostId,
    players: [makePlayer(hostId, name, mobile)], terrain: [], map: 'cloud-reef',
    seed: 0, wind: 0, turn: 0, activeId: null, deadline: 0, winnerId: null,
    message: 'รอผู้เล่น 2–4 คน', mode: 'ffa', winnerTeam: null, rematchReady: [], lobbyReady: [], drops: [],
  };
}

export function makePlayer(id: string, name: string, mobile: MobileKind): PlayerState {
  return { id, name, mobile, x: 0, y: 0, hp: MOBILE_INFO[mobile].maxHp,
    items: { double: 1, repair: 1, teleport: 1 }, doubleArmed: false, connected: true, facing: 1,
    team: null, specialAvailable: true, stats: emptyStats(), walkedThisTurn: 0, randomUsed: false };
}

export function startRound(state: GameState, seed: number, now: number): void {
  if (state.phase !== 'lobby' && state.phase !== 'finished') throw new Error('เริ่มรอบใหม่ไม่ได้');
  if (state.players.length < 2 || state.players.length > MAX_PLAYERS || state.players.some(player => !player.connected)) throw new Error('ต้องมีผู้เล่นที่เชื่อมต่อ 2–4 คน');
  if (state.mode === 'teams' && state.players.length !== 4) throw new Error('โหมดทีมต้องมีผู้เล่น 4 คน');
  if (state.phase === 'lobby' && state.players.some(player => player.id !== state.hostId && !state.lobbyReady.includes(player.id))) throw new Error('รอให้ผู้เล่นทุกคนกดพร้อม');
  const maps: MapKind[] = ['cloud-reef', 'clockwork-orchard', 'glass-dunes'];
  state.seed = seed;
  state.map = maps[seed % maps.length];
  state.terrain = makeTerrain(seed);
  const slots: Record<number, number[]> = { 2: [210, 1070], 3: [180, 640, 1100], 4: [160, 470, 810, 1120] };
  state.players.forEach((player, index) => {
    player.x = slots[state.players.length][index];
    player.hp = MOBILE_INFO[player.mobile].maxHp;
    player.items = { double: 1, repair: 1, teleport: 1 };
    player.doubleArmed = false;
    player.facing = player.x > WIDTH / 2 ? -1 : 1;
    player.team = state.mode === 'teams' ? index % 2 as Team : null;
    player.specialAvailable = true;
    player.stats = emptyStats();
    player.walkedThisTurn = 0;
  });
  settlePlayers(state);
  state.phase = 'playing';
  state.turn = 1;
  state.activeId = state.players[0].id;
  state.wind = windFor(seed, state.turn);
  state.deadline = now + TURN_MS;
  state.winnerId = null;
  state.winnerTeam = null;
  state.rematchReady = [];
  state.lobbyReady = [];
  state.drops = [];
  state.message = `${state.players[0].name} กำลังเล็ง`;
}

export function windFor(seed: number, turn: number): number {
  const roll = random(seed ^ Math.imul(turn, 0x9e3779b1))();
  return Math.round(roll * 16 - 8);
}

export function windChangesOn(seed: number, turn: number): boolean {
  return random(seed ^ Math.imul(turn, 0x3c6ef372))() < 0.2;
}

export function finishOrAdvance(state: GameState, now: number): void {
  const alive = state.players.filter(p => p.hp > 0);
  const livingTeams = new Set(alive.map(player => player.team));
  if (state.mode === 'teams' ? livingTeams.size <= 1 : alive.length <= 1) {
    state.phase = 'finished';
    state.activeId = null;
    state.deadline = 0;
    state.winnerTeam = state.mode === 'teams' ? alive[0]?.team ?? null : null;
    state.winnerId = state.mode === 'ffa' ? alive[0]?.id ?? null : null;
    state.message = alive.length ? state.mode === 'teams' ? `ทีม ${state.winnerTeam === 0 ? 'A' : 'B'} ชนะ!` : `${alive[0].name} ชนะ!` : 'เสมอ!';
    return;
  }
  const oldIndex = state.players.findIndex(p => p.id === state.activeId);
  let nextId: string | null = null;
  for (let offset = 1; offset <= state.players.length; offset++) {
    const candidate = state.players[(oldIndex + offset) % state.players.length];
    if (candidate.hp > 0 && candidate.connected) {
      nextId = candidate.id;
      break;
    }
  }
  state.activeId = nextId;
  if (!nextId) { state.deadline = 0; state.message = 'รอผู้เล่นกลับเข้าห้อง'; return; }
  state.turn++;
  if (windChangesOn(state.seed, state.turn)) {
    const nextWind = windFor(state.seed, state.turn);
    state.wind = nextWind === state.wind ? (nextWind === 8 ? 7 : nextWind + 1) : nextWind;
  }
  state.players.find(player => player.id === nextId)!.walkedThisTurn = 0;
  state.deadline = now + TURN_MS;
  state.message = `${state.players.find(p => p.id === nextId)?.name ?? ''} กำลังเล็ง`;
  if (state.turn % 8 === 0) spawnItemDrop(state);
}

export function spawnItemDrop(state: GameState): ItemDrop | null {
  if (state.phase !== 'playing') return null;
  if (state.drops.length >= 6) state.drops.shift();
  const next = random(state.seed ^ Math.imul(state.turn, 0x51ed270b));
  const item = ITEM_KINDS[Math.floor(next() * ITEM_KINDS.length)];
  let x = 100 + next() * (WIDTH - 200);
  for (let attempt = 0; attempt < 12; attempt++) {
    if (state.players.every(player => player.hp <= 0 || Math.abs(player.x - x) >= 85) && state.drops.every(drop => Math.abs(drop.x - x) >= 70)) break;
    x = 100 + next() * (WIDTH - 200);
  }
  const drop = { id: `drop-${state.turn}`, item, x: Math.round(x), y: groundAt(state.terrain, x) - 24, spawnedTurn: state.turn };
  state.drops.push(drop);
  return drop;
}

export function collectItemDrop(state: GameState, player: PlayerState): ItemKind | null {
  const index = state.drops.findIndex(drop => Math.abs(player.x - drop.x) <= 34 && player.items[drop.item] === 0);
  if (index < 0) return null;
  const [drop] = state.drops.splice(index, 1);
  player.items[drop.item] = 1;
  player.stats.pickups++;
  return drop.item;
}

export function crater(terrain: number[], x: number, radius: number, depth: number): void {
  for (let i = 0; i < terrain.length; i++) {
    const distance = Math.abs(i * STEP - x);
    if (distance > radius) continue;
    const shape = Math.sqrt(1 - (distance / radius) ** 2);
    terrain[i] = Math.min(HEIGHT - 24, terrain[i] + depth * shape);
  }
}

export function movePlayer(state: GameState, playerId: string, direction: number, elapsedMs: number): boolean {
  if (state.phase !== 'playing' || state.activeId !== playerId) throw new Error('ยังไม่ใช่เทิร์นของคุณ');
  if (direction !== -1 && direction !== 0 && direction !== 1) throw new Error('ทิศทางเดินไม่ถูกต้อง');
  if (direction === 0) return false;
  const player = state.players.find(p => p.id === playerId)!;
  const turned = player.facing !== direction;
  player.facing = direction;
  const remaining = TURN_MOVE_LIMIT - player.walkedThisTurn;
  if (remaining <= 0) return turned;
  const step = Math.min(remaining, MOVE_SPEED * Math.max(0, Math.min(100, elapsedMs)) / 1000);
  const nextX = Math.max(58, Math.min(WIDTH - 58, player.x + direction * step));
  if (state.players.some(other => other.id !== playerId && other.hp > 0 && Math.abs(other.x - nextX) < 72)) return turned;
  if (Math.abs(nextX - player.x) < 0.001) return turned;
  const moved = Math.abs(nextX - player.x);
  player.stats.distanceMoved += moved;
  player.walkedThisTurn += moved;
  player.x = nextX;
  player.y = groundAt(state.terrain, nextX) - 13;
  collectItemDrop(state, player);
  return true;
}

export function turnPlayer(state: GameState, playerId: string): void {
  if (state.phase !== 'playing' || state.activeId !== playerId) throw new Error('ยังไม่ใช่เทิร์นของคุณ');
  const player = state.players.find(p => p.id === playerId)!;
  player.facing = player.facing === 1 ? -1 : 1;
}

function worldAngle(state: GameState, player: PlayerState, angle: number): number {
  const tilt = vehicleTilt(state.terrain, player.x) * 180 / Math.PI;
  return (player.facing === 1 ? angle : 180 - angle) - tilt;
}

function shotOrigin(state: GameState, player: PlayerState, radians: number): Point {
  const tilt = vehicleTilt(state.terrain, player.x);
  return {
    x: player.x + player.facing * Math.cos(tilt) * 28 + Math.cos(radians) * 13,
    y: player.y - 24 + player.facing * Math.sin(tilt) * 28 - Math.sin(radians) * 13,
  };
}

function trace(state: GameState, player: PlayerState, angle: number, power: number, offset: number, windFactor = 1): { path: Point[]; hit: Point | null } {
  const radians = (angle + offset) * Math.PI / 180;
  const speed = 280 + power * 4.2;
  const origin = shotOrigin(state, player, radians);
  let x = origin.x;
  let y = origin.y;
  let vx = Math.cos(radians) * speed;
  let vy = -Math.sin(radians) * speed;
  const path: Point[] = [{ x, y }];
  for (let i = 0; i < 600; i++) {
    const dt = 1 / 60;
    vx += state.wind * 13 * windFactor * dt;
    vy += 440 * dt;
    x += vx * dt;
    y += vy * dt;
    if (i % 3 === 0) path.push({ x, y });
    if (x < 0 || x > WIDTH || y > HEIGHT) return { path, hit: null };
    if (y >= groundAt(state.terrain, x)) {
      const hit = { x, y: groundAt(state.terrain, x) };
      path.push(hit);
      return { path, hit };
    }
  }
  return { path, hit: null };
}

function traceManta(state: GameState, player: PlayerState, angle: number, power: number, special: boolean): { path: Point[]; hit: Point | null }[] {
  const radians = angle * Math.PI / 180;
  const speed = 280 + power * 4.2;
  const origin = shotOrigin(state, player, radians);
  let x = origin.x;
  let y = origin.y;
  let vx = Math.cos(radians) * speed;
  let vy = -Math.sin(radians) * speed;
  const trunk: Point[] = [{ x, y }];
  for (let i = 0; i < 600; i++) {
    const dt = 1 / 60;
    vx += state.wind * 13 * dt;
    vy += 440 * dt;
    x += vx * dt; y += vy * dt;
    if (i % 3 === 0) trunk.push({ x, y });
    if (x < 0 || x > WIDTH || y > HEIGHT) return [{ path: trunk, hit: null }];
    if (y >= groundAt(state.terrain, x)) {
      const hit = { x, y: groundAt(state.terrain, x) };
      return [{ path: [...trunk, hit], hit }];
    }
    if (vy < 0) continue;
    const direction = vx < 0 ? -1 : 1;
    return (special ? [-1, 0, 1] : [-1, 1]).map(side => {
      let childX = x, childY = y, childVx = vx + side * 95 * direction, childVy = -100;
      const path = [...trunk, { x, y }];
      for (let frame = 0; frame < 600; frame++) {
        childVx += state.wind * 13 * dt;
        childVy += 440 * dt;
        childX += childVx * dt; childY += childVy * dt;
        if (frame % 3 === 0) path.push({ x: childX, y: childY });
        if (childX < 0 || childX > WIDTH || childY > HEIGHT) return { path, hit: null };
        if (childY >= groundAt(state.terrain, childX)) {
          const hit = { x: childX, y: groundAt(state.terrain, childX) };
          path.push(hit);
          return { path, hit };
        }
      }
      return { path, hit: null };
    });
  }
  return [{ path: trunk, hit: null }];
}

export function fireShot(state: GameState, playerId: string, angle: number, power: number, now: number, special = false): ShotResult {
  if (state.phase !== 'playing' || state.activeId !== playerId) throw new Error('ยังไม่ใช่เทิร์นของคุณ');
  if (!Number.isFinite(angle) || angle < 10 || angle > 80 || !Number.isFinite(power) || power < MIN_POWER || power > 100) throw new Error('มุมหรือพลังยิงไม่ถูกต้อง');
  const player = state.players.find(p => p.id === playerId)!;
  if (special && !player.specialAvailable) throw new Error('ท่าพิเศษใช้ไปแล้ว');
  const info = MOBILE_INFO[player.mobile];
  const result: ShotResult = { kind: 'damage', paths: [], impacts: [], special, hitIds: [] };
  const heading = worldAngle(state, player, angle);
  const windFactor = player.mobile === 'vesper' ? special ? 0 : 0.45 : 1;
  const shots = player.mobile === 'manta' ? traceManta(state, player, heading, power, special) : [trace(state, player, heading, power, 0, windFactor)];
  const specialBlast: Record<MobileKind, { damage: number; radius: number; crater: number }> = {
    loom: { damage: 52, radius: 38, crater: 16 },
    manta: { damage: 20, radius: 37, crater: 14 },
    borer: { damage: 50, radius: 88, crater: 54 },
    vesper: { damage: 44, radius: 42, crater: 12 },
    bramble: { damage: 34, radius: 58, crater: 12 },
    aegis: { damage: 46, radius: 66, crater: 28 },
  };
  const blast = special ? specialBlast[player.mobile] : info;
  const hitIds = new Set<string>();
  for (const shot of shots) {
    result.paths.push(shot.path);
    if (!shot.hit) continue;
    const multiplier = player.doubleArmed ? 2 : 1;
    const impact = { ...shot.hit, radius: blast.radius, damage: blast.damage * multiplier };
    result.impacts.push(impact);
    for (const target of state.players) {
      if (target.hp <= 0) continue;
      if (state.mode === 'teams' && target.team === player.team) continue;
      const distance = Math.hypot(target.x - impact.x, target.y - impact.y);
      if (distance < impact.radius + 14) {
        const falloff = Math.max(0.35, 1 - distance / (impact.radius + 14));
        const before = target.hp;
        target.hp = Math.max(0, target.hp - Math.round(impact.damage * falloff));
        const dealt = before - target.hp;
        if (dealt > 0) {
          target.stats.damageTaken += dealt;
          if (target.id !== player.id) { player.stats.damageDealt += dealt; hitIds.add(target.id); }
        }
      }
    }
    crater(state.terrain, impact.x, blast.radius, blast.crater);
    settlePlayers(state);
    for (const drop of state.drops) drop.y = groundAt(state.terrain, drop.x) - 24;
  }
  player.stats.shots++;
  if (hitIds.size) player.stats.hits++;
  result.hitIds = [...hitIds];
  if (special && player.mobile === 'bramble' && player.hp > 0) player.hp = Math.min(MOBILE_INFO[player.mobile].maxHp, player.hp + 22);
  if (special) { player.specialAvailable = false; player.stats.itemsUsed++; }
  player.doubleArmed = false;
  finishOrAdvance(state, now);
  return result;
}

export function fireTeleport(state: GameState, playerId: string, angle: number, power: number, now: number): ShotResult {
  if (state.phase !== 'playing' || state.activeId !== playerId) throw new Error('ยังไม่ใช่เทิร์นของคุณ');
  if (!Number.isFinite(angle) || angle < 10 || angle > 80 || !Number.isFinite(power) || power < MIN_POWER || power > 100) throw new Error('มุมหรือพลังยิงไม่ถูกต้อง');
  const player = state.players.find(p => p.id === playerId)!;
  if (player.items.teleport < 1) throw new Error('ไอเทมหมดแล้ว');
  const shot = trace(state, player, worldAngle(state, player, angle), power, 0);
  if (!shot.hit || shot.hit.x < 58 || shot.hit.x > WIDTH - 58) throw new Error('กระสุนย้ายตำแหน่งต้องตกบนพื้นที่เล่น');
  if (state.players.some(other => other.id !== playerId && other.hp > 0 && Math.abs(other.x - shot.hit!.x) < 72)) throw new Error('จุดตกใกล้ผู้เล่นอื่นเกินไป');
  player.x = shot.hit.x;
  player.y = groundAt(state.terrain, player.x) - 13;
  player.items.teleport--;
  player.stats.itemsUsed++;
  collectItemDrop(state, player);
  finishOrAdvance(state, now);
  return { kind: 'teleport', paths: [shot.path], impacts: [{ ...shot.hit, radius: 36, damage: 0 }] };
}

export function useItem(state: GameState, playerId: string, item: ItemKind, now: number): void {
  if (state.phase !== 'playing' || state.activeId !== playerId) throw new Error('ยังไม่ใช่เทิร์นของคุณ');
  const player = state.players.find(p => p.id === playerId)!;
  if (!['double', 'repair', 'teleport'].includes(item) || player.items[item] < 1) throw new Error('ไอเทมหมดแล้ว');
  if (item === 'double') {
    if (player.doubleArmed) throw new Error('เปิดใช้ไอเทมแล้ว');
    player.doubleArmed = true;
    player.items.double--;
    player.stats.itemsUsed++;
    state.message = `${player.name} เตรียมยิงแรงขึ้น`;
    return;
  }
  if (item === 'repair') {
    player.hp = Math.min(MOBILE_INFO[player.mobile].maxHp, player.hp + 28);
    player.items.repair--;
    player.stats.itemsUsed++;
    finishOrAdvance(state, now);
    return;
  }
  throw new Error('ใช้ไอเทมย้ายตำแหน่งด้วยการเล็งและยิง');
}

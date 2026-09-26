export const WIDTH = 1280;
export const HEIGHT = 720;
export const STEP = 10;
export const TURN_MS = 30_000;
export const MAX_PLAYERS = 4;
export const MOVE_SPEED = 88;

export type MobileKind = 'loom' | 'manta' | 'borer';
export type MapKind = 'cloud-reef' | 'clockwork-orchard' | 'glass-dunes';
export type ItemKind = 'double' | 'repair' | 'teleport';

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
}

export interface Point { x: number; y: number }
export interface Impact extends Point { radius: number; damage: number }
export interface ShotResult { kind: 'damage' | 'teleport'; paths: Point[][]; impacts: Impact[] }

export type ClientAction =
  | { type: 'create'; name: string; mobile: MobileKind }
  | { type: 'join'; code: string; name: string; mobile: MobileKind }
  | { type: 'select'; mobile: MobileKind }
  | { type: 'start' }
  | { type: 'move'; direction: -1 | 0 | 1 }
  | { type: 'turn' }
  | { type: 'fire'; angle: number; power: number }
  | { type: 'item'; item: ItemKind; angle?: number; power?: number };

export type ServerEvent =
  | { type: 'welcome'; id: string; code: string }
  | { type: 'state'; state: GameState }
  | { type: 'shot'; shot: ShotResult }
  | { type: 'error'; message: string };

export const MOBILE_INFO: Record<MobileKind, { label: string; color: number; damage: number; radius: number; crater: number }> = {
  loom: { label: 'Loom', color: 0xf67868, damage: 32, radius: 58, crater: 25 },
  manta: { label: 'Manta', color: 0x4ab8af, damage: 22, radius: 42, crater: 16 },
  borer: { label: 'Borer', color: 0xf5c35a, damage: 38, radius: 68, crater: 40 },
};

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
    message: 'รอผู้เล่น 2–4 คน',
  };
}

export function makePlayer(id: string, name: string, mobile: MobileKind): PlayerState {
  return { id, name, mobile, x: 0, y: 0, hp: 100,
    items: { double: 1, repair: 1, teleport: 1 }, doubleArmed: false, connected: true, facing: 1 };
}

export function startRound(state: GameState, seed: number, now: number): void {
  if (state.phase !== 'lobby' || state.players.length < 2 || state.players.length > MAX_PLAYERS) throw new Error('ต้องมีผู้เล่น 2–4 คน');
  const maps: MapKind[] = ['cloud-reef', 'clockwork-orchard', 'glass-dunes'];
  state.seed = seed;
  state.map = maps[seed % maps.length];
  state.terrain = makeTerrain(seed);
  const slots: Record<number, number[]> = { 2: [210, 1070], 3: [180, 640, 1100], 4: [160, 470, 810, 1120] };
  state.players.forEach((player, index) => {
    player.x = slots[state.players.length][index];
    player.hp = 100;
    player.items = { double: 1, repair: 1, teleport: 1 };
    player.doubleArmed = false;
    player.facing = player.x > WIDTH / 2 ? -1 : 1;
  });
  settlePlayers(state);
  state.phase = 'playing';
  state.turn = 1;
  state.activeId = state.players[0].id;
  state.wind = windFor(seed, state.turn);
  state.deadline = now + TURN_MS;
  state.winnerId = null;
  state.message = `${state.players[0].name} กำลังเล็ง`;
}

export function windFor(seed: number, turn: number): number {
  const roll = random(seed ^ Math.imul(turn, 0x9e3779b1))();
  return Math.round(roll * 16 - 8);
}

export function finishOrAdvance(state: GameState, now: number): void {
  const alive = state.players.filter(p => p.hp > 0 && p.connected);
  if (alive.length <= 1) {
    state.phase = 'finished';
    state.activeId = null;
    state.deadline = 0;
    state.winnerId = alive[0]?.id ?? null;
    state.message = alive.length ? `${alive[0].name} ชนะ!` : 'เสมอ!';
    return;
  }
  const oldIndex = state.players.findIndex(p => p.id === state.activeId);
  for (let offset = 1; offset <= state.players.length; offset++) {
    const candidate = state.players[(oldIndex + offset) % state.players.length];
    if (candidate.hp > 0 && candidate.connected) {
      state.activeId = candidate.id;
      break;
    }
  }
  state.turn++;
  state.wind = windFor(state.seed, state.turn);
  state.deadline = now + TURN_MS;
  state.message = `${state.players.find(p => p.id === state.activeId)?.name ?? ''} กำลังเล็ง`;
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
  const nextX = Math.max(58, Math.min(WIDTH - 58, player.x + direction * MOVE_SPEED * Math.max(0, Math.min(100, elapsedMs)) / 1000));
  if (state.players.some(other => other.id !== playerId && other.hp > 0 && Math.abs(other.x - nextX) < 72)) return turned;
  if (Math.abs(nextX - player.x) < 0.001) return turned;
  player.x = nextX;
  player.y = groundAt(state.terrain, nextX) - 13;
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

function trace(state: GameState, player: PlayerState, angle: number, power: number, offset: number): { path: Point[]; hit: Point | null } {
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
    vx += state.wind * 13 * dt;
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

function traceManta(state: GameState, player: PlayerState, angle: number, power: number): { path: Point[]; hit: Point | null }[] {
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
    return [-1, 1].map(side => {
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

export function fireShot(state: GameState, playerId: string, angle: number, power: number, now: number): ShotResult {
  if (state.phase !== 'playing' || state.activeId !== playerId) throw new Error('ยังไม่ใช่เทิร์นของคุณ');
  if (!Number.isFinite(angle) || angle < 10 || angle > 80 || !Number.isFinite(power) || power < 20 || power > 100) throw new Error('มุมหรือพลังยิงไม่ถูกต้อง');
  const player = state.players.find(p => p.id === playerId)!;
  const info = MOBILE_INFO[player.mobile];
  const result: ShotResult = { kind: 'damage', paths: [], impacts: [] };
  const heading = worldAngle(state, player, angle);
  const shots = player.mobile === 'manta' ? traceManta(state, player, heading, power) : [trace(state, player, heading, power, 0)];
  for (const shot of shots) {
    result.paths.push(shot.path);
    if (!shot.hit) continue;
    const multiplier = player.doubleArmed ? 2 : 1;
    const impact = { ...shot.hit, radius: info.radius, damage: info.damage * multiplier };
    result.impacts.push(impact);
    for (const target of state.players) {
      if (target.hp <= 0) continue;
      const distance = Math.hypot(target.x - impact.x, target.y - impact.y);
      if (distance < impact.radius + 14) {
        const falloff = Math.max(0.35, 1 - distance / (impact.radius + 14));
        target.hp = Math.max(0, target.hp - Math.round(impact.damage * falloff));
      }
    }
    crater(state.terrain, impact.x, info.radius, info.crater);
    settlePlayers(state);
  }
  player.doubleArmed = false;
  finishOrAdvance(state, now);
  return result;
}

export function fireTeleport(state: GameState, playerId: string, angle: number, power: number, now: number): ShotResult {
  if (state.phase !== 'playing' || state.activeId !== playerId) throw new Error('ยังไม่ใช่เทิร์นของคุณ');
  if (!Number.isFinite(angle) || angle < 10 || angle > 80 || !Number.isFinite(power) || power < 20 || power > 100) throw new Error('มุมหรือพลังยิงไม่ถูกต้อง');
  const player = state.players.find(p => p.id === playerId)!;
  if (player.items.teleport < 1) throw new Error('ไอเทมหมดแล้ว');
  const shot = trace(state, player, worldAngle(state, player, angle), power, 0);
  if (!shot.hit || shot.hit.x < 58 || shot.hit.x > WIDTH - 58) throw new Error('กระสุนย้ายตำแหน่งต้องตกบนพื้นที่เล่น');
  if (state.players.some(other => other.id !== playerId && other.hp > 0 && Math.abs(other.x - shot.hit!.x) < 72)) throw new Error('จุดตกใกล้ผู้เล่นอื่นเกินไป');
  player.x = shot.hit.x;
  player.y = groundAt(state.terrain, player.x) - 13;
  player.items.teleport--;
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
    state.message = `${player.name} เตรียมยิงแรงขึ้น`;
    return;
  }
  if (item === 'repair') {
    player.hp = Math.min(100, player.hp + 28);
    player.items.repair--;
    finishOrAdvance(state, now);
    return;
  }
  throw new Error('ใช้ไอเทมย้ายตำแหน่งด้วยการเล็งและยิง');
}

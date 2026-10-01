export const WIDTH = 1280;
export const HEIGHT = 720;
export const STEP = 10;
export const TURN_MS = 30_000;
export const MAX_PLAYERS = 4;
export const MOVE_SPEED = 88;
export const TURN_MOVE_LIMIT = 175;
export const MIN_POWER = 5;
export const SHOT_DAMAGE_SCALE = 0.5;
export const VOID_GROUND = HEIGHT + 160;

export type MobileKind = 'loom' | 'manta' | 'borer' | 'vesper' | 'bramble' | 'halo' | 'kestrel' | 'cinder' | 'aegis' | 'gale' | 'tempest';
export type OrdinaryMobileKind = Exclude<MobileKind, 'aegis'>;
export type MapKind = 'cloud-reef' | 'clockwork-orchard' | 'glass-dunes';
export type ItemKind = 'double' | 'repair' | 'teleport' | 'double-play';
export type DropKind = ItemKind | 'special';
export type MatchMode = 'ffa' | 'teams' | 'practice';
export type BotDifficulty = 'easy' | 'normal' | 'hard';
export type EquipmentSlot = 'hat' | 'armor' | 'flag';
export type EquipmentSet = 'attack' | 'defense' | 'health' | 'gold';
export type Equipment = Record<EquipmentSlot, EquipmentSet | null>;
export type Team = 0 | 1;
export interface PlayerStats { shots: number; hits: number; damageDealt: number; damageTaken: number; itemsUsed: number; pickups: number; distanceMoved: number }
export interface ItemDrop { id: string; item: DropKind; x: number; y: number; spawnedTurn: number }
export interface MeteorEvent { turn: number; x: number; y: number; hitIds: string[] }
export type WeatherKind = 'lightning' | 'storm' | 'rain';
export interface WeatherState { kind: WeatherKind; x: number; width: number; startedTurn: number; direction: -1 | 1 }

export interface PlayerState {
  id: string;
  name: string;
  mobile: MobileKind;
  x: number;
  y: number;
  hp: number;
  items: Record<ItemKind, number>;
  doubleArmed: boolean;
  extraTurnArmed: boolean;
  connected: boolean;
  isBot: boolean;
  facing: -1 | 1;
  team: Team | null;
  specialAvailable: boolean;
  stats: PlayerStats;
  walkedThisTurn: number;
  randomUsed: boolean;
  equipment: Equipment;
  randomEquipment: Record<EquipmentSlot, boolean>;
  fallen: boolean;
  wetTurns: number;
  wetOnTurn: number | null;
}

export interface GameState {
  code: string;
  phase: 'lobby' | 'playing' | 'finished';
  hostId: string;
  players: PlayerState[];
  terrain: number[];
  terrainBottom: number[];
  map: MapKind;
  seed: number;
  wind: number;
  turn: number;
  activeId: string | null;
  deadline: number;
  winnerId: string | null;
  message: string;
  mode: MatchMode;
  botDifficulty: BotDifficulty;
  meteor: MeteorEvent | null;
  weather: WeatherState | null;
  winnerTeam: Team | null;
  rematchReady: string[];
  lobbyReady: string[];
  drops: ItemDrop[];
}

export interface Point { x: number; y: number }
export interface Impact extends Point { radius: number; damage: number; weatherEffect?: WeatherKind }
export interface ShotResult { kind: 'damage' | 'teleport'; mobile: MobileKind; shooterId: string; paths: Point[][]; impacts: Impact[]; special?: boolean; hitIds?: string[]; destroyedDrops?: { id: string; x: number; y: number }[]; weatherCharged?: boolean; weatherKind?: WeatherKind; wetIds?: string[] }
export interface MatchSummary { code: string; mode: MatchMode; winnerId: string | null; winnerTeam: Team | null; players: Pick<PlayerState, 'id' | 'name' | 'mobile' | 'team' | 'stats'>[] }

export type ClientAction =
  | { type: 'create'; name: string; mobile?: OrdinaryMobileKind }
  | { type: 'practice'; name: string; mobile?: MobileKind }
  | { type: 'practice-mobile'; mobile: MobileKind }
  | { type: 'join'; code: string; name: string; mobile?: OrdinaryMobileKind }
  | { type: 'select'; mobile: OrdinaryMobileKind }
  | { type: 'equip'; slot: EquipmentSlot; set: EquipmentSet | null }
  | { type: 'random-mobile' }
  | { type: 'random-equipment'; slot: EquipmentSlot }
  | { type: 'lobby-ready'; ready: boolean }
  | { type: 'start' }
  | { type: 'set-mode'; mode: MatchMode }
  | { type: 'add-bot' }
  | { type: 'remove-bot' }
  | { type: 'set-bot-difficulty'; difficulty: BotDifficulty }
  | { type: 'rematch-ready'; ready: boolean }
  | { type: 'resume'; token: string }
  | { type: 'move'; direction: -1 | 0 | 1 }
  | { type: 'turn' }
  | { type: 'fire'; angle: number; power: number; special?: boolean }
  | { type: 'reset-practice' }
  | { type: 'item'; item: ItemKind; angle?: number; power?: number };

export type ServerEvent =
  | { type: 'welcome'; id: string; code: string; token: string; resumed: boolean }
  | { type: 'state'; state: GameState }
  | { type: 'shot'; shot: ShotResult }
  | { type: 'hit' }
  | { type: 'item-used'; item: ItemKind | 'special' }
  | { type: 'item-picked'; item: DropKind; playerId: string }
  | { type: 'match-summary'; summary: MatchSummary }
  | { type: 'error'; message: string };

export const MOBILE_INFO: Record<MobileKind, { label: string; color: number; damage: number; defense: number; radius: number; crater: number; maxHp: number; category?: 'wind'; windBonus?: number }> = {
  loom: { label: 'Loom', color: 0xf67868, damage: 33, defense: 1, radius: 58, crater: 25, maxHp: 100 },
  manta: { label: 'Manta', color: 0x4ab8af, damage: 21, defense: 1, radius: 42, crater: 16, maxHp: 100 },
  borer: { label: 'Borer', color: 0xf5c35a, damage: 34, defense: 2, radius: 68, crater: 40, maxHp: 100 },
  vesper: { label: 'Vesper', color: 0xb897ef, damage: 30, defense: 1, radius: 49, crater: 19, maxHp: 100 },
  bramble: { label: 'Bramble', color: 0x9bcf83, damage: 27, defense: 2, radius: 55, crater: 18, maxHp: 100 },
  halo: { label: 'Halo', color: 0x61d9ef, damage: 31, defense: 2, radius: 50, crater: 18, maxHp: 100 },
  kestrel: { label: 'Kestrel', color: 0x68c6a7, damage: 20, defense: 1, radius: 40, crater: 16, maxHp: 100 },
  cinder: { label: 'Cinder', color: 0xff9459, damage: 39, defense: 1, radius: 72, crater: 42, maxHp: 100 },
  aegis: { label: 'Aegis', color: 0x72d9f4, damage: 31, defense: 1, radius: 59, crater: 24, maxHp: 150 },
  gale: { label: 'Gale', color: 0x94e4cc, damage: 28, defense: 1, radius: 56, crater: 20, maxHp: 100, category: 'wind', windBonus: 12 },
  tempest: { label: 'Tempest', color: 0xb58cff, damage: 30, defense: 1, radius: 48, crater: 24, maxHp: 100, category: 'wind', windBonus: 12 },
};
export const ORDINARY_MOBILES: OrdinaryMobileKind[] = ['loom', 'manta', 'borer', 'vesper', 'bramble', 'halo', 'kestrel', 'cinder', 'gale', 'tempest'];
export const EQUIPMENT_SLOTS: EquipmentSlot[] = ['hat', 'armor', 'flag'];
export const EQUIPMENT_SETS: EquipmentSet[] = ['attack', 'defense', 'health'];
export function windDamageBonus(mobile: MobileKind, wind: number): number {
  return Math.abs(wind) >= 7 ? MOBILE_INFO[mobile].windBonus ?? 0 : 0;
}
export function randomEquipmentFromRoll(roll: number): EquipmentSet {
  if (roll < 0.05) return 'gold';
  if (roll < 0.05 + 0.95 / 3) return 'attack';
  if (roll < 0.05 + 2 * 0.95 / 3) return 'defense';
  return 'health';
}
export function equipmentBonus(player: PlayerState, set: 'attack' | 'defense' | 'health'): number {
  return EQUIPMENT_SLOTS.reduce((sum, slot) => sum + (player.equipment[slot] === 'gold' ? 3 : player.equipment[slot] === set ? 5 : 0), 0);
}
export function maxHpFor(player: PlayerState): number { return MOBILE_INFO[player.mobile].maxHp + equipmentBonus(player, 'health'); }
export function randomMobileFromRoll(rareRoll: number, ordinaryRoll: number): MobileKind {
  if (rareRoll < 0.05) return 'aegis';
  return ORDINARY_MOBILES[Math.min(ORDINARY_MOBILES.length - 1, Math.floor(ordinaryRoll * ORDINARY_MOBILES.length))];
}
export function dropKindForRoll(roll: number): DropKind {
  if (roll < 0.23) return 'double';
  if (roll < 0.46) return 'repair';
  if (roll < 0.69) return 'teleport';
  if (roll < 0.92) return 'double-play';
  return 'special';
}
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
  for (const player of state.players) {
    if (player.hp <= 0) continue;
    if (!hasGroundAt(state, player.x)) {
      player.stats.damageTaken += player.hp;
      player.hp = 0;
      player.fallen = true;
      player.y = HEIGHT + 140;
    } else player.y = groundAt(state.terrain, player.x) - 13;
  }
}

export function hasGroundAt(state: GameState, x: number): boolean {
  return groundAt(state.terrain, x) < groundAt(state.terrainBottom, x);
}

function touchesTerrain(state: GameState, x: number, y: number): boolean {
  return hasGroundAt(state, x) && y >= groundAt(state.terrain, x) && y <= groundAt(state.terrainBottom, x);
}

function settleDrops(state: GameState): void {
  state.drops = state.drops.filter(drop => hasGroundAt(state, drop.x));
  for (const drop of state.drops) drop.y = groundAt(state.terrain, drop.x) - 24;
}

export function createState(code: string, hostId: string, name: string, mobile: MobileKind): GameState {
  return {
    code, phase: 'lobby', hostId,
    players: [makePlayer(hostId, name, mobile)], terrain: [], terrainBottom: [], map: 'cloud-reef',
    seed: 0, wind: 0, turn: 0, activeId: null, deadline: 0, winnerId: null,
    message: 'รอผู้เล่น 2–4 คน', mode: 'ffa', botDifficulty: 'normal', meteor: null, weather: null, winnerTeam: null, rematchReady: [], lobbyReady: [], drops: [],
  };
}

export function makePlayer(id: string, name: string, mobile: MobileKind): PlayerState {
  return { id, name, mobile, x: 0, y: 0, hp: MOBILE_INFO[mobile].maxHp,
    items: { double: 1, repair: 1, teleport: 1, 'double-play': 1 }, doubleArmed: false, extraTurnArmed: false, connected: true, isBot: false, facing: 1,
    team: null, specialAvailable: true, stats: emptyStats(), walkedThisTurn: 0, randomUsed: false,
    equipment: { hat: null, armor: null, flag: null }, randomEquipment: { hat: false, armor: false, flag: false }, fallen: false, wetTurns: 0, wetOnTurn: null };
}

export function startRound(state: GameState, seed: number, now: number): void {
  if (state.phase !== 'lobby' && state.phase !== 'finished') throw new Error('เริ่มรอบใหม่ไม่ได้');
  if (state.players.length < 2 || state.players.length > MAX_PLAYERS || state.players.some(player => !player.connected)) throw new Error('ต้องมีผู้เล่นที่เชื่อมต่อ 2–4 คน');
  if (state.mode === 'teams' && state.players.length !== 4) throw new Error('โหมดทีมต้องมีผู้เล่น 4 คน');
  if (state.mode !== 'practice' && state.phase === 'lobby' && state.players.some(player => !player.isBot && player.id !== state.hostId && !state.lobbyReady.includes(player.id))) throw new Error('รอให้ผู้เล่นทุกคนกดพร้อม');
  const maps: MapKind[] = ['cloud-reef', 'clockwork-orchard', 'glass-dunes'];
  state.seed = seed;
  state.map = maps[seed % maps.length];
  state.terrain = makeTerrain(seed);
  state.terrainBottom = state.terrain.map((y, i) => Math.min(HEIGHT - 25,
    y + 173 + 23 * Math.sin(i * STEP / 85 + seed * 0.001) + 13 * Math.sin(i * STEP / 39)));
  const slots: Record<number, number[]> = { 2: [210, 1070], 3: [180, 640, 1100], 4: [160, 470, 810, 1120] };
  state.players.forEach((player, index) => {
    player.x = slots[state.players.length][index];
    player.hp = maxHpFor(player);
    player.fallen = false;
    player.wetTurns = 0;
    player.wetOnTurn = null;
    player.items = { double: 1, repair: 1, teleport: 1, 'double-play': 1 };
    player.doubleArmed = false;
    player.extraTurnArmed = false;
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
  state.weather = weatherFor(seed, state.turn);
  state.deadline = state.mode === 'practice' ? 0 : now + TURN_MS;
  state.winnerId = null;
  state.winnerTeam = null;
  state.rematchReady = [];
  state.lobbyReady = [];
  state.drops = [];
  state.meteor = null;
  state.message = `${state.players[0].name} กำลังเล็ง`;
}

export function returnToLobby(state: GameState): void {
  if (state.phase !== 'finished') throw new Error('ยังไม่จบรอบ');
  state.players = state.players.map(player => ({ ...makePlayer(player.id, player.name, player.isBot ? player.mobile : 'loom'), connected: player.connected, isBot: player.isBot }));
  state.phase = 'lobby';
  state.terrain = [];
  state.terrainBottom = [];
  state.seed = 0;
  state.wind = 0;
  state.weather = null;
  state.turn = 0;
  state.activeId = null;
  state.deadline = 0;
  state.winnerId = null;
  state.winnerTeam = null;
  state.rematchReady = [];
  state.lobbyReady = [];
  state.drops = [];
  state.meteor = null;
  state.message = 'เลือกรถแล้วกดพร้อมเพื่อเริ่มรอบใหม่';
}

export function windFor(seed: number, turn: number): number {
  const roll = random(seed ^ Math.imul(turn, 0x9e3779b1))();
  return Math.round(roll * 16 - 8);
}

export function windChangesOn(seed: number, turn: number): boolean {
  return random(seed ^ Math.imul(turn, 0x3c6ef372))() < 0.2;
}

export function weatherFor(seed: number, turn: number): WeatherState | null {
  const next = random(seed ^ Math.imul(turn, 0x6d2b79f5));
  if (next() >= .10) return null;
  const kinds: WeatherKind[] = ['lightning', 'storm', 'rain'];
  const kind = kinds[Math.floor(next() * kinds.length)];
  const x = Math.round(100 + random(seed ^ Math.imul(turn, 0x4b1d5e71))() * (WIDTH - 200));
  return { kind, x, width: 92, startedTurn: turn, direction: random(seed ^ Math.imul(turn, 0x1b873593))() < .5 ? -1 : 1 };
}

function advanceWeather(state: GameState): void {
  if (state.weather && state.turn - state.weather.startedTurn >= 4) state.weather = null;
  if (!state.weather) state.weather = weatherFor(state.seed, state.turn);
}

function finishWetTurn(state: GameState, player: PlayerState | undefined): void {
  if (!player || player.wetOnTurn !== state.turn) return;
  player.wetTurns = Math.max(0, player.wetTurns - 1);
  player.wetOnTurn = null;
}

function startWetTurn(state: GameState, player: PlayerState | undefined): void {
  if (player && player.wetTurns > 0) player.wetOnTurn = state.turn;
}

export const METEOR_CRATER_RADIUS = 91;
export function meteorOn(seed: number, turn: number): boolean {
  return random(seed ^ Math.imul(turn, 0x7f4a7c15))() < 0.03;
}

export function dropMeteor(state: GameState, x: number): MeteorEvent {
  if (state.phase !== 'playing' || !Number.isFinite(x) || x < 70 || x > WIDTH - 70) throw new Error('จุดตกอุกกาบาตไม่ถูกต้อง');
  const impact: MeteorEvent = { turn: state.turn, x, y: groundAt(state.terrain, x), hitIds: [] };
  for (const player of state.players) {
    if (player.hp <= 0 || Math.abs(player.x - x) > 36) continue;
    const before = player.hp;
    player.hp = Math.max(0, player.hp - 20);
    player.stats.damageTaken += before - player.hp;
    impact.hitIds.push(player.id);
  }
  crater(state.terrain, x, METEOR_CRATER_RADIUS, 65, state.terrainBottom);
  settlePlayers(state);
  settleDrops(state);
  state.meteor = impact;
  return impact;
}

function finishIfDecided(state: GameState): boolean {
  const alive = state.players.filter(p => p.hp > 0);
  const livingTeams = new Set(alive.map(player => player.team));
  if (!(state.mode === 'teams' ? livingTeams.size <= 1 : alive.length <= 1)) return false;
  state.phase = 'finished';
  state.activeId = null;
  state.deadline = 0;
  state.winnerTeam = state.mode === 'teams' ? alive[0]?.team ?? null : null;
  state.winnerId = state.mode === 'ffa' ? alive[0]?.id ?? null : null;
  state.message = alive.length ? state.mode === 'teams' ? `ทีม ${state.winnerTeam === 0 ? 'A' : 'B'} ชนะ!` : `${alive[0].name} ชนะ!` : 'เสมอ!';
  return true;
}

export function finishOrAdvance(state: GameState, now: number): void {
  if (state.mode === 'practice') {
    const trainee = state.players.find(player => player.id === state.hostId)!;
    const target = state.players.find(player => player.id !== state.hostId)!;
    finishWetTurn(state, trainee);
    if (!hasGroundAt(state, trainee.x) || !hasGroundAt(state, 1070)) {
      resetPractice(state, state.seed, now);
      return;
    }
    trainee.hp = maxHpFor(trainee);
    trainee.fallen = false;
    target.hp = maxHpFor(target);
    target.fallen = false;
    target.x = 1070;
    target.y = groundAt(state.terrain, target.x) - 13;
    trainee.items = { double: 1, repair: 1, teleport: 1, 'double-play': 1 };
    trainee.extraTurnArmed = false;
    trainee.specialAvailable = true;
    trainee.walkedThisTurn = 0;
    state.activeId = trainee.id;
    state.turn++;
    advanceWeather(state);
    startWetTurn(state, trainee);
    if (windChangesOn(state.seed, state.turn)) {
      const nextWind = windFor(state.seed, state.turn);
      state.wind = nextWind === state.wind ? (nextWind === 8 ? 7 : nextWind + 1) : nextWind;
    }
    state.deadline = 0;
    state.message = 'โหมดฝึก · ยิงเป้าได้ต่อเนื่อง';
    return;
  }
  if (finishIfDecided(state)) return;
  const oldIndex = state.players.findIndex(p => p.id === state.activeId);
  const previousPlayer = state.players[oldIndex];
  finishWetTurn(state, previousPlayer);
  const extraTurn = !!previousPlayer?.extraTurnArmed;
  if (previousPlayer) previousPlayer.extraTurnArmed = false;
  state.turn++;
  advanceWeather(state);
  state.meteor = null;
  if (windChangesOn(state.seed, state.turn)) {
    const nextWind = windFor(state.seed, state.turn);
    state.wind = nextWind === state.wind ? (nextWind === 8 ? 7 : nextWind + 1) : nextWind;
  }
  if (meteorOn(state.seed, state.turn)) {
    const x = 100 + random(state.seed ^ Math.imul(state.turn, 0x4cf5ad43))() * (WIDTH - 200);
    dropMeteor(state, Math.round(x));
  }
  if (finishIfDecided(state)) return;
  let nextId: string | null = extraTurn && previousPlayer.hp > 0 && previousPlayer.connected ? previousPlayer.id : null;
  for (let offset = 1; !nextId && offset <= state.players.length; offset++) {
    const candidate = state.players[(oldIndex + offset) % state.players.length];
    if (candidate.hp > 0 && candidate.connected) {
      nextId = candidate.id;
      break;
    }
  }
  state.activeId = nextId;
  if (!nextId) { state.deadline = 0; state.message = 'รอผู้เล่นกลับเข้าห้อง'; return; }
  const nextPlayer = state.players.find(player => player.id === nextId)!;
  nextPlayer.walkedThisTurn = 0;
  startWetTurn(state, nextPlayer);
  state.deadline = now + TURN_MS;
  state.message = state.meteor ? `อุกกาบาตตก! ${state.players.find(p => p.id === nextId)?.name ?? ''} กำลังเล็ง` : `${state.players.find(p => p.id === nextId)?.name ?? ''} กำลังเล็ง`;
  if (state.turn % 8 === 0) spawnItemDrop(state);
}

export function resetPractice(state: GameState, seed: number, now: number): void {
  if (state.mode !== 'practice' || state.phase !== 'playing') throw new Error('ใช้ได้เฉพาะโหมดฝึก');
  state.phase = 'lobby';
  startRound(state, seed, now);
  state.message = 'โหมดฝึก · เริ่มสนามใหม่แล้ว';
}

export function selectPracticeMobile(state: GameState, playerId: string, kind: MobileKind, now: number): void {
  if (state.mode !== 'practice' || state.phase !== 'playing' || state.hostId !== playerId) throw new Error('ใช้ได้เฉพาะโหมดฝึก');
  if (!Object.hasOwn(MOBILE_INFO, kind)) throw new Error('Mobile ไม่ถูกต้อง');
  state.players.find(player => player.id === playerId)!.mobile = kind;
  resetPractice(state, state.seed, now);
  state.message = `โหมดฝึก · ${MOBILE_INFO[kind].label}`;
}

export function spawnItemDrop(state: GameState): ItemDrop | null {
  if (state.phase !== 'playing') return null;
  if (state.drops.length >= 6) state.drops.shift();
  const next = random(state.seed ^ Math.imul(state.turn, 0x51ed270b));
  const item = dropKindForRoll(next());
  let x = 100 + next() * (WIDTH - 200);
  for (let attempt = 0; attempt < 12; attempt++) {
    if (hasGroundAt(state, x) && state.players.every(player => player.hp <= 0 || Math.abs(player.x - x) >= 85) && state.drops.every(drop => Math.abs(drop.x - x) >= 70)) break;
    x = 100 + next() * (WIDTH - 200);
  }
  if (!hasGroundAt(state, x)) return null;
  const drop = { id: `drop-${state.turn}`, item, x: Math.round(x), y: groundAt(state.terrain, x) - 24, spawnedTurn: state.turn };
  state.drops.push(drop);
  return drop;
}

export function collectItemDrop(state: GameState, player: PlayerState): DropKind | null {
  if (player.hp <= 0) return null;
  const index = state.drops.findIndex(drop => Math.abs(player.x - drop.x) <= 34 && (drop.item === 'special' ? !player.specialAvailable : player.items[drop.item] === 0));
  if (index < 0) return null;
  const [drop] = state.drops.splice(index, 1);
  if (drop.item === 'special') player.specialAvailable = true;
  else player.items[drop.item] = 1;
  player.stats.pickups++;
  return drop.item;
}

export function crater(terrain: number[], x: number, radius: number, depth: number, bottom?: number[]): void {
  for (let i = 0; i < terrain.length; i++) {
    const distance = Math.abs(i * STEP - x);
    if (distance > radius) continue;
    const shape = Math.sqrt(1 - (distance / radius) ** 2);
    const next = terrain[i] + depth * shape;
    terrain[i] = next >= (bottom?.[i] ?? HEIGHT - 25) ? VOID_GROUND : next;
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
  if (Math.abs(nextX - player.x) < 0.001) return turned;
  const moved = Math.abs(nextX - player.x);
  player.stats.distanceMoved += moved;
  player.walkedThisTurn += moved;
  player.x = nextX;
  settlePlayers(state);
  if (player.hp <= 0) { finishOrAdvance(state, Date.now()); return true; }
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

// Elevation above the horizontal in the direction the Mobile faces. This is
// the actual launch heading; the slider angle is relative to the tilted chassis.
export function launchElevation(state: GameState, player: PlayerState, angle: number): number {
  const heading = worldAngle(state, player, angle);
  return player.facing === 1 ? heading : 180 - heading;
}

function shotOrigin(state: GameState, player: PlayerState, radians: number): Point {
  const tilt = vehicleTilt(state.terrain, player.x);
  return {
    x: player.x + player.facing * Math.cos(tilt) * 28 + Math.cos(radians) * 13,
    y: player.y - 24 + player.facing * Math.sin(tilt) * 28 - Math.sin(radians) * 13,
  };
}

interface TracedShot { path: Point[]; hit: Point | null; crossedWeather: boolean; hitTargetId?: string }
// All Mobiles use the same gameplay hitbox, regardless of sprite or equipment.
// 70% of the former 80 × 69 box, kept at its original vertical center.
export const MOBILE_HITBOX = { halfWidth: 28, halfHeight: 24.15, centerYOffset: -30.5 } as const;
const DROP_HALF_SIZE = 21;

function segmentBoxEntry(from: Point, to: Point, left: number, top: number, right: number, bottom: number): number | null {
  let enter = 0, exit = 1;
  for (const [start, delta, min, max] of [[from.x, to.x - from.x, left, right], [from.y, to.y - from.y, top, bottom]]) {
    if (Math.abs(delta) < 1e-9) {
      if (start < min || start > max) return null;
    } else {
      const a = (min - start) / delta, b = (max - start) / delta;
      enter = Math.max(enter, Math.min(a, b));
      exit = Math.min(exit, Math.max(a, b));
      if (enter > exit) return null;
    }
  }
  return enter;
}

function projectileCollision(state: GameState, shooter: PlayerState, from: Point, to: Point, includeShooter = false): { point: Point; targetId?: string } | null {
  let earliest = 2;
  let targetId: string | undefined;
  for (const target of state.players) {
    if (target.hp <= 0 || (!includeShooter && target.id === shooter.id) || (state.mode === 'teams' && target.team === shooter.team)) continue;
    const centerY = target.y + MOBILE_HITBOX.centerYOffset;
    const t = segmentBoxEntry(from, to, target.x - MOBILE_HITBOX.halfWidth, centerY - MOBILE_HITBOX.halfHeight,
      target.x + MOBILE_HITBOX.halfWidth, centerY + MOBILE_HITBOX.halfHeight);
    if (t !== null && t < earliest) { earliest = t; targetId = target.id; }
  }
  for (const drop of state.drops) {
    const t = segmentBoxEntry(from, to, drop.x - DROP_HALF_SIZE, drop.y - DROP_HALF_SIZE,
      drop.x + DROP_HALF_SIZE, drop.y + DROP_HALF_SIZE);
    if (t !== null && t < earliest) { earliest = t; targetId = undefined; }
  }
  return earliest <= 1 ? { point: { x: from.x + (to.x - from.x) * earliest, y: from.y + (to.y - from.y) * earliest }, targetId } : null;
}
function touchesWeather(state: GameState, fromX: number, toX: number): boolean {
  const weather = state.weather;
  return !!weather && Math.max(fromX, toX) >= weather.x - weather.width / 2 && Math.min(fromX, toX) <= weather.x + weather.width / 2;
}

function trace(state: GameState, player: PlayerState, angle: number, power: number, offset: number, windFactor = 1, combat = true): TracedShot {
  const radians = (angle + offset) * Math.PI / 180;
  const speed = 280 + power * 4.2;
  const origin = shotOrigin(state, player, radians);
  let x = origin.x;
  let y = origin.y;
  let vx = Math.cos(radians) * speed;
  let vy = -Math.sin(radians) * speed;
  const path: Point[] = [{ x, y }];
  let crossedWeather = false;
  for (let i = 0; i < 600; i++) {
    const dt = 1 / 60;
    vx += state.wind * windFactor * 13 * dt;
    vy += 440 * dt;
    const oldX = x, oldY = y;
    x += vx * dt;
    y += vy * dt;
    if (touchesWeather(state, oldX, x)) crossedWeather = true;
    if (i % 3 === 0) path.push({ x, y });
    if (x < 0 || x > WIDTH || y > HEIGHT) return { path, hit: null, crossedWeather };
    const collision = combat ? projectileCollision(state, player, { x: oldX, y: oldY }, { x, y }) : null;
    if (collision) {
      path.push(collision.point);
      return { path, hit: collision.point, crossedWeather, hitTargetId: collision.targetId };
    }
    if (touchesTerrain(state, x, y)) {
      const hit = { x, y: groundAt(state.terrain, x) };
      path.push(hit);
      return { path, hit, crossedWeather };
    }
  }
  return { path, hit: null, crossedWeather };
}

function traceManta(state: GameState, player: PlayerState, angle: number, power: number, special: boolean): TracedShot[] {
  const radians = angle * Math.PI / 180;
  const speed = 280 + power * 4.2;
  const origin = shotOrigin(state, player, radians);
  let x = origin.x;
  let y = origin.y;
  let vx = Math.cos(radians) * speed;
  let vy = -Math.sin(radians) * speed;
  const trunk: Point[] = [{ x, y }];
  let crossedWeather = false;
  for (let i = 0; i < 600; i++) {
    const dt = 1 / 60;
    vx += state.wind * 13 * dt;
    vy += 440 * dt;
    const oldX = x, oldY = y;
    x += vx * dt; y += vy * dt;
    if (touchesWeather(state, oldX, x)) crossedWeather = true;
    if (i % 3 === 0) trunk.push({ x, y });
    if (x < 0 || x > WIDTH || y > HEIGHT) return [{ path: trunk, hit: null, crossedWeather }];
    const collision = projectileCollision(state, player, { x: oldX, y: oldY }, { x, y });
    if (collision) {
      trunk.push(collision.point);
      return [{ path: trunk, hit: collision.point, crossedWeather, hitTargetId: collision.targetId }];
    }
    if (!touchesTerrain(state, x, y)) continue;
    // One parent flies all the way to the surface before bouncing apart.
    y = groundAt(state.terrain, x);
    trunk.push({ x, y });
    return (special ? [-1, 0, 1] : [-1, 1]).map(side => {
      let childX = x, childY = y - 3, childVx = side * 140, childVy = -190;
      let childCrossedWeather = crossedWeather;
      const path = [...trunk];
      for (let frame = 0; frame < 600; frame++) {
        childVx += state.wind * 13 * dt;
        childVy += 440 * dt;
        const oldChildX = childX, oldChildY = childY;
        childX += childVx * dt; childY += childVy * dt;
        if (touchesWeather(state, oldChildX, childX)) childCrossedWeather = true;
        if (frame % 3 === 0) path.push({ x: childX, y: childY });
        if (childX < 0 || childX > WIDTH || childY > HEIGHT) return { path, hit: null, crossedWeather: childCrossedWeather };
        const childCollision = projectileCollision(state, player, { x: oldChildX, y: oldChildY }, { x: childX, y: childY }, true);
        if (childCollision) {
          path.push(childCollision.point);
          return { path, hit: childCollision.point, crossedWeather: childCrossedWeather, hitTargetId: childCollision.targetId };
        }
        if (touchesTerrain(state, childX, childY)) {
          const hit = { x: childX, y: groundAt(state.terrain, childX) };
          path.push(hit);
          return { path, hit, crossedWeather: childCrossedWeather };
        }
      }
      return { path, hit: null, crossedWeather: childCrossedWeather };
    });
  }
  return [{ path: trunk, hit: null, crossedWeather }];
}

export function fireShot(state: GameState, playerId: string, angle: number, power: number, now: number, special = false, weatherRoll: () => number = Math.random): ShotResult {
  if (state.phase !== 'playing' || state.activeId !== playerId) throw new Error('ยังไม่ใช่เทิร์นของคุณ');
  if (!Number.isFinite(angle) || angle < 10 || angle > 80 || !Number.isFinite(power) || power < MIN_POWER || power > 100) throw new Error('มุมหรือพลังยิงไม่ถูกต้อง');
  const player = state.players.find(p => p.id === playerId)!;
  if (special && !player.specialAvailable) throw new Error('ท่าพิเศษใช้ไปแล้ว');
  if (special && player.wetOnTurn === state.turn) throw new Error('รถเปียก ใช้ท่าพิเศษไม่ได้ในเทิร์นนี้');
  const info = MOBILE_INFO[player.mobile];
  const result: ShotResult = { kind: 'damage', mobile: player.mobile, shooterId: playerId, paths: [], impacts: [], special, hitIds: [] };
  const heading = worldAngle(state, player, angle);
  const windFactor = player.mobile === 'vesper' || player.mobile === 'halo' ? special ? 0 : 0.45 : 1;
  const shots = player.mobile === 'manta' || player.mobile === 'kestrel' ? traceManta(state, player, heading, power, special) : [trace(state, player, heading, power, 0, windFactor)];
  const specialBlast: Record<MobileKind, { damage: number; radius: number; crater: number }> = {
    loom: { damage: 48, radius: 38, crater: 16 },
    manta: { damage: 19, radius: 37, crater: 14 },
    borer: { damage: 44, radius: 88, crater: 54 },
    vesper: { damage: 45, radius: 42, crater: 12 },
    bramble: { damage: 32, radius: 58, crater: 12 },
    halo: { damage: 43, radius: 44, crater: 16 },
    kestrel: { damage: 19, radius: 39, crater: 15 },
    cinder: { damage: 50, radius: 82, crater: 52 },
    aegis: { damage: 42, radius: 66, crater: 28 },
    gale: { damage: 40, radius: 65, crater: 27 },
    tempest: { damage: 43, radius: 53, crater: 31 },
  };
  const blast = special ? specialBlast[player.mobile] : info;
  const hitIds = new Set<string>();
  const wetIds = new Set<string>();
  const destroyedDrops: { id: string; x: number; y: number }[] = [];
  // A split shot shares one equipment ATK budget across its fragments.
  // A parent that hits a Mobile before splitting keeps the full bonus.
  const attackBonus = equipmentBonus(player, 'attack');
  const attackPerShot = Math.floor(attackBonus / shots.length);
  const attackRemainder = attackBonus % shots.length;
  for (const [shotIndex, shot] of shots.entries()) {
    result.paths.push(shot.path);
    if (shot.crossedWeather) { result.weatherCharged = true; result.weatherKind = state.weather?.kind; }
    if (!shot.hit) continue;
    const multiplier = player.doubleArmed ? 2 : 1;
    const sharedAttack = attackPerShot + (shotIndex < attackRemainder ? 1 : 0);
    const impact: Impact = { ...shot.hit, radius: blast.radius, damage: (blast.damage + sharedAttack + windDamageBonus(player.mobile, state.wind)) * multiplier };
    result.impacts.push(impact);
    for (const target of state.players) {
      if (target.hp <= 0) continue;
      if (state.mode === 'teams' && target.team === player.team) continue;
      const distance = shot.hitTargetId === target.id ? 0 : Math.hypot(target.x - impact.x, target.y - impact.y);
      if (distance < impact.radius + 14) {
        const falloff = Math.max(0.35, 1 - distance / (impact.radius + 14));
        const before = target.hp;
        const weatherEffect = shot.crossedWeather && state.weather && weatherRoll() < 0.7 ? state.weather.kind : null;
        const defense = weatherEffect === 'storm' ? 0 : MOBILE_INFO[target.mobile].defense + equipmentBonus(target, 'defense');
        const weatherBonus = weatherEffect === 'lightning' ? 5 : 0;
        const mitigatedDamage = Math.max(0, Math.round(impact.damage * falloff) - defense);
        const dealtByShot = Math.round(mitigatedDamage * SHOT_DAMAGE_SCALE) + weatherBonus;
        target.hp = Math.max(0, target.hp - dealtByShot);
        const dealt = before - target.hp;
        if (dealt > 0) {
          target.stats.damageTaken += dealt;
          if (weatherEffect) impact.weatherEffect = weatherEffect;
          if (weatherEffect === 'rain') { target.wetTurns = 1; wetIds.add(target.id); }
          if (target.id !== player.id) { player.stats.damageDealt += dealt; hitIds.add(target.id); }
        }
      }
    }
    state.drops = state.drops.filter(drop => {
      const distance = Math.hypot(drop.x - impact.x, drop.y - impact.y);
      if (distance > impact.radius + DROP_HALF_SIZE) return true;
      destroyedDrops.push({ id: drop.id, x: drop.x, y: drop.y });
      return false;
    });
    const beforeFall = new Map(state.players.map(target => [target.id, target.hp]));
    crater(state.terrain, impact.x, blast.radius, blast.crater, state.terrainBottom);
    settlePlayers(state);
    for (const target of state.players) {
      const remainingHp = beforeFall.get(target.id) ?? 0;
      if (remainingHp > 0 && target.fallen && target.id !== player.id && !(state.mode === 'teams' && target.team === player.team)) {
        player.stats.damageDealt += remainingHp;
        hitIds.add(target.id);
      }
    }
    settleDrops(state);
  }
  player.stats.shots++;
  if (hitIds.size) player.stats.hits++;
  result.hitIds = [...hitIds];
  result.wetIds = [...wetIds];
  result.destroyedDrops = destroyedDrops;
  if (special && player.mobile === 'bramble' && player.hp > 0) player.hp = Math.min(maxHpFor(player), player.hp + 22);
  if (special) { player.specialAvailable = false; player.stats.itemsUsed++; }
  player.doubleArmed = false;
  finishOrAdvance(state, now);
  return result;
}

export function fireTeleport(state: GameState, playerId: string, angle: number, power: number, now: number): ShotResult {
  if (state.phase !== 'playing' || state.activeId !== playerId) throw new Error('ยังไม่ใช่เทิร์นของคุณ');
  if (!Number.isFinite(angle) || angle < 10 || angle > 80 || !Number.isFinite(power) || power < MIN_POWER || power > 100) throw new Error('มุมหรือพลังยิงไม่ถูกต้อง');
  const player = state.players.find(p => p.id === playerId)!;
  if (player.wetOnTurn === state.turn) throw new Error('รถเปียก ใช้ไอเทมไม่ได้ในเทิร์นนี้');
  if (player.items.teleport < 1) throw new Error('ไอเทมหมดแล้ว');
  const shot = trace(state, player, worldAngle(state, player, angle), power, 0, 1, false);
  if (!shot.hit || shot.hit.x < 58 || shot.hit.x > WIDTH - 58) throw new Error('กระสุนย้ายตำแหน่งต้องตกบนพื้นที่เล่น');
  if (state.players.some(other => other.id !== playerId && other.hp > 0 && Math.abs(other.x - shot.hit!.x) < 72)) throw new Error('จุดตกใกล้ผู้เล่นอื่นเกินไป');
  player.x = shot.hit.x;
  player.y = groundAt(state.terrain, player.x) - 13;
  player.items.teleport--;
  player.stats.itemsUsed++;
  collectItemDrop(state, player);
  finishOrAdvance(state, now);
  return { kind: 'teleport', mobile: player.mobile, shooterId: playerId, paths: [shot.path], impacts: [{ ...shot.hit, radius: 36, damage: 0 }] };
}

export function useItem(state: GameState, playerId: string, item: ItemKind, now: number): void {
  if (state.phase !== 'playing' || state.activeId !== playerId) throw new Error('ยังไม่ใช่เทิร์นของคุณ');
  const player = state.players.find(p => p.id === playerId)!;
  if (player.wetOnTurn === state.turn) throw new Error('รถเปียก ใช้ไอเทมไม่ได้ในเทิร์นนี้');
  if (!['double', 'repair', 'teleport', 'double-play'].includes(item) || player.items[item] < 1) throw new Error('ไอเทมหมดแล้ว');
  if (item === 'double-play') {
    if (player.extraTurnArmed) throw new Error('เปิดใช้ Double Play แล้ว');
    player.extraTurnArmed = true;
    player.items[item]--;
    player.stats.itemsUsed++;
    state.message = `${player.name} ใช้ Double Play · ได้เล่นเทิร์นถัดไปอีกครั้ง`;
    return;
  }
  if (item === 'double') {
    if (player.doubleArmed) throw new Error('เปิดใช้ไอเทมแล้ว');
    player.doubleArmed = true;
    player.items.double--;
    player.stats.itemsUsed++;
    state.message = `${player.name} เตรียมยิงแรงขึ้น`;
    return;
  }
  if (item === 'repair') {
    player.hp = Math.min(maxHpFor(player), player.hp + 28);
    player.items.repair--;
    player.stats.itemsUsed++;
    finishOrAdvance(state, now);
    return;
  }
  throw new Error('ใช้ไอเทมย้ายตำแหน่งด้วยการเล็งและยิง');
}

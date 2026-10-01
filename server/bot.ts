import { fireShot, fireTeleport, groundAt, hasGroundAt, maxHpFor, TURN_MOVE_LIMIT, WIDTH } from '../shared/game.ts';
import type { BotDifficulty, GameState } from '../shared/game.ts';

export interface BotShot { angle: number; power: number; facing: -1 | 1 }
export interface BotMove { direction: -1 | 1; targetX: number }

function groundThickness(state: GameState, x: number): number {
  return hasGroundAt(state, x) ? groundAt(state.terrainBottom, x) - groundAt(state.terrain, x) : 0;
}

export function botIsInDanger(state: GameState, botId: string): boolean {
  const bot = state.players.find(player => player.id === botId);
  if (!bot) return false;
  return [-36, -20, 0, 20, 36].some(offset => groundThickness(state, bot.x + offset) < 48);
}

function routeIsSafe(state: GameState, from: number, to: number): boolean {
  const steps = Math.ceil(Math.abs(to - from) / 8);
  for (let index = 1; index <= steps; index++) {
    const x = from + (to - from) * index / steps;
    if (groundThickness(state, x) < 35) return false;
  }
  return true;
}

export function chooseBotMove(state: GameState, botId: string): BotMove | null {
  const bot = state.players.find(player => player.id === botId);
  if (!bot) return null;
  const enemies = state.players.filter(player => player.hp > 0 && player.id !== botId && (state.mode !== 'teams' || player.team !== bot.team));
  if (!enemies.length) return null;
  const remaining = Math.min(88, TURN_MOVE_LIMIT - bot.walkedThisTurn);
  if (remaining < 12) return null;
  const nearest = enemies.reduce((best, enemy) => Math.abs(enemy.x - bot.x) < Math.abs(best.x - bot.x) ? enemy : best);
  const currentDanger = botIsInDanger(state, botId);
  const options: { x: number; score: number }[] = [];
  for (const delta of [-remaining, -remaining * 0.65, -remaining * 0.35, 0, remaining * 0.35, remaining * 0.65, remaining]) {
    const x = Math.max(58, Math.min(WIDTH - 58, bot.x + delta));
    if (delta && !routeIsSafe(state, bot.x, x)) continue;
    const thickness = groundThickness(state, x);
    if (thickness < 48) continue;
    const edge = Math.min(groundThickness(state, x - 30), groundThickness(state, x + 30));
    const distance = Math.abs(nearest.x - x);
    const usefulDrop = state.drops.some(drop => Math.abs(drop.x - x) <= 34 && (drop.item === 'special' ? !bot.specialAvailable : bot.items[drop.item] === 0));
    const score = Math.min(thickness, 130) / 12 + Math.min(edge, 90) / 8
      + (distance > 260 ? -distance / 25 : distance < 120 ? distance / 28 : 0)
      + (usefulDrop ? 22 : 0) + (currentDanger && edge >= 60 ? 25 : 0)
      - Math.abs(x - bot.x) / 80;
    options.push({ x, score });
  }
  if (!options.length) return null;
  options.sort((a, b) => b.score - a.score);
  const best = options[0];
  const staying = options.find(option => option.x === bot.x);
  if (Math.abs(best.x - bot.x) < 10 || (!currentDanger && best.score < (staying?.score ?? -Infinity) + 2)) return null;
  return { direction: best.x < bot.x ? -1 : 1, targetX: best.x };
}

export function chooseBotTeleport(state: GameState, botId: string): BotShot | null {
  const bot = state.players.find(player => player.id === botId);
  if (!bot || !bot.items.teleport || bot.wetOnTurn === state.turn || !botIsInDanger(state, botId)) return null;
  const options: { shot: BotShot; score: number }[] = [];
  for (const facing of [-1, 1] as const) {
    for (const angle of [22, 38, 54, 70]) {
      for (const power of [20, 35, 50, 65, 80, 95]) {
        const copy = structuredClone(state);
        copy.players.find(player => player.id === botId)!.facing = facing;
        try { fireTeleport(copy, botId, angle, power, Date.now()); }
        catch { continue; }
        const landing = copy.players.find(player => player.id === botId)!;
        if (landing.hp <= 0 || !hasGroundAt(state, landing.x) || Math.abs(landing.x - bot.x) < 90) continue;
        const edge = Math.min(groundThickness(state, landing.x - 35), groundThickness(state, landing.x + 35));
        if (edge < 65) continue;
        const nearestEnemy = Math.min(...state.players.filter(player => player.hp > 0 && player.id !== botId && (state.mode !== 'teams' || player.team !== bot.team)).map(player => Math.abs(player.x - landing.x)));
        const score = Math.min(edge, 160) + Math.min(nearestEnemy, 220) / 3 - Math.abs(landing.x - bot.x) / 15;
        options.push({ shot: { facing, angle, power }, score });
      }
    }
  }
  options.sort((a, b) => b.score - a.score);
  return options[0]?.shot ?? null;
}

export function botShouldRepair(state: GameState, botId: string): boolean {
  const bot = state.players.find(player => player.id === botId);
  if (!bot || !bot.items.repair || bot.wetOnTurn === state.turn) return false;
  return bot.hp <= Math.min(38, maxHpFor(bot) * 0.35) && maxHpFor(bot) - bot.hp >= 20;
}

// The chance of choosing a carefully aimed shot. Terrain, craters, and blast size
// still determine whether that shot actually hits.
export function botAimChance(difficulty: BotDifficulty, wind: number): number {
  const calm = { easy: 0.65, normal: 0.82, hard: 0.96 }[difficulty];
  return Math.max(0.18, calm - Math.abs(wind) * 0.055);
}

export function planBotShot(state: GameState, botId: string, roll: () => number = Math.random): BotShot {
  const bot = state.players.find(player => player.id === botId);
  if (!bot) throw new Error('ไม่พบบอท');
  const enemies = state.players.filter(player => player.hp > 0 && player.id !== botId && (state.mode !== 'teams' || player.team !== bot.team));
  if (!enemies.length) throw new Error('ไม่พบเป้าหมายของบอท');
  const target = enemies.reduce((closest, player) => Math.abs(player.x - bot.x) < Math.abs(closest.x - bot.x) ? player : closest);
  const facing: -1 | 1 = target.x < bot.x ? -1 : 1;
  const before = new Map(enemies.map(player => [player.id, player.hp]));
  const allies = state.mode === 'teams' ? state.players.filter(player => player.hp > 0 && player.id !== botId && player.team === bot.team) : [];
  const candidates: { shot: BotShot; score: number; damage: number; distance: number }[] = [];

  const evaluate = (angle: number, power: number): void => {
    const copy = structuredClone(state);
    copy.players.find(player => player.id === botId)!.facing = facing;
    let result;
    try { result = fireShot(copy, botId, angle, power, Date.now(), false, () => 1); }
    catch { return; }
    const damage = enemies.reduce((sum, enemy) => sum + (before.get(enemy.id)! - (copy.players.find(player => player.id === enemy.id)?.hp ?? 0)), 0);
    const allyDamage = allies.reduce((sum, ally) => sum + (ally.hp - (copy.players.find(player => player.id === ally.id)?.hp ?? 0)), 0);
    const selfDamage = bot.hp - (copy.players.find(player => player.id === botId)?.hp ?? 0);
    const points = result.impacts.length ? result.impacts : result.paths.flatMap(path => path.length ? [path[path.length - 1]] : []);
    const distance = points.length ? Math.min(...points.map(point => Math.hypot(point.x - target.x, point.y - target.y))) : 1500;
    const score = damage * 20 - allyDamage * 25 - selfDamage * 22 - distance / 18;
    candidates.push({ shot: { angle, power, facing }, score, damage, distance });
  };

  for (const angle of [12, 23, 34, 45, 56, 67, 78]) {
    for (const power of [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]) evaluate(angle, power);
  }
  const coarseBest = candidates.reduce((best, candidate) => candidate.score > best.score ? candidate : best);
  for (const angleOffset of [-5, 0, 5]) {
    for (const powerOffset of [-5, 0, 5]) {
      if (angleOffset || powerOffset) evaluate(Math.max(10, Math.min(80, coarseBest.shot.angle + angleOffset)), Math.max(5, Math.min(100, coarseBest.shot.power + powerOffset)));
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  if (roll() < botAimChance(state.botDifficulty, state.wind)) return candidates[0].shot;
  // Choose a safe miss when available. Its exact trajectory still comes from the
  // same server physics as a human shot.
  const misses = candidates.filter(candidate => candidate.damage === 0 && candidate.score > -100);
  if (misses.length) return misses[Math.floor(roll() * Math.min(8, misses.length))].shot;
  return candidates[Math.min(candidates.length - 1, 12)].shot;
}

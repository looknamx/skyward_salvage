import { fireShot } from '../shared/game.ts';
import type { BotDifficulty, GameState } from '../shared/game.ts';

export interface BotShot { angle: number; power: number; facing: -1 | 1 }

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
  const candidates: { shot: BotShot; score: number; damage: number; distance: number }[] = [];

  const evaluate = (angle: number, power: number): void => {
    const copy = structuredClone(state);
    copy.players.find(player => player.id === botId)!.facing = facing;
    let result;
    try { result = fireShot(copy, botId, angle, power, Date.now(), false, () => 1); }
    catch { return; }
    const damage = enemies.reduce((sum, enemy) => sum + (before.get(enemy.id)! - (copy.players.find(player => player.id === enemy.id)?.hp ?? 0)), 0);
    const selfDamage = bot.hp - (copy.players.find(player => player.id === botId)?.hp ?? 0);
    const points = result.impacts.length ? result.impacts : result.paths.flatMap(path => path.length ? [path[path.length - 1]] : []);
    const distance = points.length ? Math.min(...points.map(point => Math.hypot(point.x - target.x, point.y - target.y))) : 1500;
    const score = damage * 20 - selfDamage * 22 - distance / 18;
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

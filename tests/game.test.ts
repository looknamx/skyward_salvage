import assert from 'node:assert/strict';
import test from 'node:test';
import { collectItemDrop, crater, createState, dropKindForRoll, dropMeteor, equipmentBonus, finishOrAdvance, fireShot, fireTeleport, groundAt, hasGroundAt, launchElevation, makePlayer, maxHpFor, meteorOn, METEOR_CRATER_RADIUS, MOBILE_HITBOX, MOBILE_INFO, movePlayer, MOVE_SPEED, ORDINARY_MOBILES, randomEquipmentFromRoll, randomMobileFromRoll, resetPractice, selectPracticeMobile, returnToLobby, settlePlayers, SHOT_DAMAGE_SCALE, startRound as startRoundCore, STEP, TURN_MOVE_LIMIT, turnPlayer, useItem, VOID_GROUND, weatherFor, WIDTH, windChangesOn, windDamageBonus, windFor } from '../shared/game.ts';
import type { GameState, MobileKind } from '../shared/game.ts';
import { botAimChance, botIsInDanger, botShouldRepair, chooseBotMove, chooseBotTeleport, planBotShot } from '../server/bot.ts';

test('bots auto-ready, retain their seat after rematch, and aim less precisely in strong wind', () => {
  const state = createState('BOT001', 'human', 'Human', 'loom');
  const bot = makePlayer('bot-1', 'Bot 1', 'borer');
  bot.isBot = true;
  state.players.push(bot);
  startRoundCore(state, 42, 1000);
  assert.equal(state.phase, 'playing');
  state.activeId = bot.id;
  state.wind = 0;
  const calm = planBotShot(state, bot.id, () => 0);
  assert.ok(calm.angle >= 10 && calm.angle <= 80);
  assert.ok(calm.power >= 5 && calm.power <= 100);
  assert.equal(calm.facing, -1);
  for (const difficulty of ['easy', 'normal', 'hard'] as const) {
    assert.ok(botAimChance(difficulty, 8) < botAimChance(difficulty, 0));
  }
  assert.ok(botAimChance('easy', 0) < botAimChance('normal', 0));
  assert.ok(botAimChance('normal', 0) < botAimChance('hard', 0));
  state.phase = 'finished';
  returnToLobby(state);
  assert.equal(state.players[1].isBot, true);
  assert.equal(state.players[1].mobile, 'borer');
});

test('bot moves toward distant opponents, repairs critical HP, and teleports away from thin ground', () => {
  const state = createState('BOTAI1', 'human', 'Human', 'loom');
  const bot = makePlayer('bot-1', 'Bot 1', 'borer');
  bot.isBot = true;
  state.players.push(bot);
  startRoundCore(state, 47, 1000);
  state.activeId = bot.id;
  state.wind = 0;
  state.weather = null;
  state.terrain.fill(500);
  state.terrainBottom.fill(650);
  settlePlayers(state);
  const move = chooseBotMove(state, bot.id);
  assert.ok(move && move.direction === -1 && move.targetX < bot.x);
  const walking = structuredClone(state);
  for (let step = 0; step < 12; step++) movePlayer(walking, bot.id, move.direction, 100);
  assert.ok(walking.players[1].x < bot.x);
  assert.ok(walking.players[1].hp > 0);
  assert.equal(botShouldRepair(state, bot.id), false);
  bot.hp = 30;
  assert.equal(botShouldRepair(state, bot.id), true);
  const repairing = structuredClone(state);
  useItem(repairing, bot.id, 'repair', 1100);
  assert.equal(repairing.players[1].hp, 58);
  assert.equal(repairing.players[1].items.repair, 0);
  bot.wetOnTurn = state.turn;
  assert.equal(botShouldRepair(state, bot.id), false);
  bot.wetOnTurn = null;
  for (let x = 1030; x <= 1110; x += STEP) state.terrainBottom[Math.round(x / STEP)] = 530;
  assert.equal(botIsInDanger(state, bot.id), true);
  const escape = chooseBotTeleport(state, bot.id);
  assert.ok(escape);
  const copy = structuredClone(state);
  copy.players[1].facing = escape.facing;
  fireTeleport(copy, bot.id, escape.angle, escape.power, 1100);
  assert.ok(Math.abs(copy.players[1].x - bot.x) >= 90);
  assert.equal(botIsInDanger(copy, bot.id), false);
  assert.equal(copy.players[1].items.teleport, 0);
});

function startRound(state: GameState, seed: number, now: number): void {
  if (state.phase === 'lobby') state.lobbyReady = state.players.filter(player => player.id !== state.hostId).map(player => player.id);
  startRoundCore(state, seed, now);
}

function flatArena(mobile: MobileKind = 'borer'): GameState {
  const state = createState('DIG001', 'p1', 'One', mobile);
  state.players.push(makePlayer('p2', 'Two', 'loom'));
  startRound(state, 47, 1000);
  state.terrain.fill(500);
  state.terrainBottom.fill(650);
  state.wind = 0;
  state.weather = null;
  settlePlayers(state);
  return state;
}

test('weather occurs on 10% of clear turns, chooses evenly among three kinds, and lasts four turns', () => {
  const counts = { lightning: 0, storm: 0, rain: 0, clear: 0 };
  const positions: number[] = [];
  for (let seed = 1; seed <= 9000; seed++) {
    const weather = weatherFor(seed, 1);
    counts[weather?.kind ?? 'clear']++;
    if (weather) {
      assert.ok(weather.x >= 100 && weather.x <= WIDTH - 100);
      positions.push(weather.x);
    }
  }
  const weatherCount = counts.lightning + counts.storm + counts.rain;
  assert.ok(weatherCount > 800 && weatherCount < 1000);
  for (const kind of ['lightning', 'storm', 'rain'] as const) assert.ok(counts[kind] > 250 && counts[kind] < 350);
  assert.ok(Math.min(...positions) < 250 && Math.max(...positions) > WIDTH - 250);
  assert.ok(new Set(positions).size > 100);
  const seed = Array.from({ length: 1000 }, (_, i) => i + 1).find(value => weatherFor(value, 1)?.kind === 'lightning')!;
  const state = flatArena();
  state.seed = seed;
  state.weather = weatherFor(seed, 1);
  for (let turn = 2; turn <= 4; turn++) {
    finishOrAdvance(state, turn * 1000);
    assert.equal(state.turn, turn);
    assert.equal(state.weather?.kind, 'lightning');
    assert.equal(state.weather?.startedTurn, 1);
  }
  finishOrAdvance(state, 5000);
  assert.equal(state.turn, 5);
  assert.notEqual(state.weather?.startedTurn, 1);
});

test('lightning adds five damage only when a damaging projectile crosses the lane', () => {
  const baseline = flatArena('loom');
  const landing = fireShot(structuredClone(baseline), 'p1', 45, 45, 1100).impacts[0];
  assert.ok(landing);
  baseline.players[1].x = landing.x;
  settlePlayers(baseline);
  const normal = structuredClone(baseline);
  const charged = structuredClone(baseline);
  charged.weather = { kind: 'lightning', x: 640, width: 92, startedTurn: 1, direction: 1 };
  const normalShot = fireShot(normal, 'p1', 45, 45, 1100);
  const chargedShot = fireShot(charged, 'p1', 45, 45, 1100, false, () => 0.699999);
  assert.equal(chargedShot.weatherCharged, true);
  assert.equal(normal.players[1].hp - charged.players[1].hp, 5);
  assert.equal(chargedShot.impacts[0].weatherEffect, 'lightning');
  assert.equal(chargedShot.weatherKind, 'lightning');
  assert.ok(normalShot.hitIds?.includes('p2'));

  const resisted = structuredClone(baseline);
  resisted.weather = { kind: 'lightning', x: 640, width: 92, startedTurn: 1, direction: 1 };
  const resistedShot = fireShot(resisted, 'p1', 45, 45, 1100, false, () => 0.7);
  assert.equal(resisted.players[1].hp, normal.players[1].hp);
  assert.equal(resistedShot.impacts[0].weatherEffect, undefined);

  const near = structuredClone(baseline);
  near.weather = { kind: 'lightning', x: 1080, width: 92, startedTurn: 1, direction: 1 };
  fireShot(near, 'p1', 45, 45, 1100);
  assert.equal(near.players[1].hp, normal.players[1].hp);
});

test('storm has a 70% chance to ignore all DEF without changing trajectory', () => {
  const plain = flatArena('loom');
  const plainImpact = fireShot(structuredClone(plain), 'p1', 45, 45, 1100).impacts[0];
  assert.ok(plainImpact);
  plain.players[1].x = plainImpact.x;
  plain.players[1].equipment.hat = 'defense';
  settlePlayers(plain);
  const normal = structuredClone(plain);
  const normalShot = fireShot(normal, 'p1', 45, 45, 1100);
  const storm = structuredClone(plain);
  storm.weather = { kind: 'storm', x: 640, width: 92, startedTurn: 1, direction: 1 };
  const stormShot = fireShot(storm, 'p1', 45, 45, 1100, false, () => 0.699999);
  assert.equal(stormShot.impacts[0].x, normalShot.impacts[0].x);
  assert.equal(normal.players[1].hp - storm.players[1].hp, 3);
  assert.equal(stormShot.impacts[0].weatherEffect, 'storm');
  const resisted = structuredClone(plain);
  resisted.weather = storm.weather;
  fireShot(resisted, 'p1', 45, 45, 1100, false, () => 0.7);
  assert.equal(resisted.players[1].hp, normal.players[1].hp);
  const missedStorm = structuredClone(plain);
  missedStorm.weather = { kind: 'storm', x: 1080, width: 92, startedTurn: 1, direction: 1 };
  assert.equal(fireShot(missedStorm, 'p1', 45, 45, 1100).impacts[0].x, normalShot.impacts[0].x);
  assert.equal(missedStorm.players[1].hp, normal.players[1].hp);
});

test('rain has a 70% chance to lock items for the target’s next turn', () => {
  const plain = flatArena('loom');
  const plainImpact = fireShot(structuredClone(plain), 'p1', 45, 45, 1100).impacts[0];
  assert.ok(plainImpact);
  const rain = structuredClone(plain);
  rain.players[1].x = plainImpact.x;
  settlePlayers(rain);
  rain.weather = { kind: 'rain', x: 640, width: 92, startedTurn: 1, direction: 1 };
  const dry = structuredClone(rain);
  const rainShot = fireShot(rain, 'p1', 45, 45, 1100, false, () => 0.699999);
  assert.deepEqual(rainShot.wetIds, ['p2']);
  assert.equal(rainShot.impacts[0].weatherEffect, 'rain');
  assert.equal(rain.activeId, 'p2');
  assert.equal(rain.players[1].wetOnTurn, rain.turn);
  assert.throws(() => useItem(rain, 'p2', 'double', 1200), /รถเปียก/);
  const dryShot = fireShot(dry, 'p1', 45, 45, 1100, false, () => 0.7);
  assert.deepEqual(dryShot.wetIds, []);
  assert.equal(dry.players[1].wetOnTurn, null);
  useItem(dry, 'p2', 'double', 1200);
  finishOrAdvance(rain, 1300);
  assert.equal(rain.players[1].wetTurns, 0);
  finishOrAdvance(rain, 1400);
  assert.equal(rain.activeId, 'p2');
  useItem(rain, 'p2', 'double', 1500);
  assert.equal(rain.players[1].doubleArmed, true);
});

test('displayed launch elevation matches the projectile heading on either side of a 10 degree incline', () => {
  for (const facing of [1, -1] as const) {
    const state = flatArena();
    const player = state.players[0];
    player.x = 260;
    player.facing = facing;
    const slope = (facing === 1 ? -1 : 1) * Math.tan(10 * Math.PI / 180);
    state.terrain = state.terrain.map((_, i) => 490 + slope * (i * STEP - 260));
    player.y = groundAt(state.terrain, player.x) - 13;
    assert.ok(Math.abs(launchElevation(state, player, 45) - 55) < .001);
    const shot = fireShot(state, 'p1', 45, 25, 1100);
    assert.equal(shot.mobile, 'borer');
    assert.equal(shot.shooterId, 'p1');
    const [origin, firstStep] = shot.paths[0];
    const dx = firstStep.x - origin.x;
    const dy = firstStep.y - origin.y;
    assert.equal(Math.sign(dx), facing);
    // Trace applies one gravity step before storing its first in-flight point.
    const gravityStep = 440 / (60 * 60);
    const measured = Math.atan2(-(dy - gravityStep), Math.abs(dx)) * 180 / Math.PI;
    assert.ok(Math.abs(measured - 55) < .001);
  }
});

test('repeated craters break through a fixed island bottom and kill unsupported Mobiles', () => {
  const state = flatArena();
  const bottom = [...state.terrainBottom];
  const victim = state.players[1];
  for (let i = 0; i < 3; i++) crater(state.terrain, victim.x, 68, 40, state.terrainBottom);
  settlePlayers(state);
  assert.equal(victim.hp, 100);
  assert.equal(hasGroundAt(state, victim.x), true);
  crater(state.terrain, victim.x, 68, 40, state.terrainBottom);
  settlePlayers(state);
  assert.deepEqual(state.terrainBottom, bottom);
  assert.equal(hasGroundAt(state, victim.x), false);
  assert.equal(victim.hp, 0);
  assert.equal(victim.fallen, true);
  finishOrAdvance(state, 2000);
  assert.equal(state.winnerId, 'p1');
});

test('walking into an opening causes death and resolves the match', () => {
  const state = flatArena();
  const player = state.players[0];
  player.x = 150;
  for (let i = 10; i <= 14; i++) state.terrain[i] = VOID_GROUND;
  assert.equal(movePlayer(state, 'p1', -1, 100), true);
  assert.equal(player.fallen, true);
  assert.equal(player.hp, 0);
  assert.equal(state.winnerId, 'p2');
});

test('digging kills award the shooter damage credit and disappear from the turn order', () => {
  const probe = flatArena();
  const impact = fireShot(probe, 'p1', 45, 45, 1100).impacts[0];
  assert.ok(impact);
  const state = flatArena();
  state.players[1].x = impact.x;
  state.terrainBottom.fill(520);
  settlePlayers(state);
  const shot = fireShot(state, 'p1', 45, 45, 1100);
  assert.equal(state.players[1].fallen, true);
  assert.equal(state.players[1].hp, 0);
  assert.equal(state.players[0].stats.damageDealt, 100);
  assert.ok(shot.hitIds?.includes('p2'));
  assert.equal(state.winnerId, 'p1');
});

test('Manta and Kestrel share one flight until ground impact, then fragments hit a nearby Mobile', () => {
  for (const mobile of ['manta', 'kestrel'] as const) {
    const probe = flatArena(mobile);
    const preview = fireShot(probe, 'p1', 45, 45, 1100);
    assert.equal(preview.paths.length, 2);
    const [left, right] = preview.paths;
    const splitIndex = left.findIndex((point, i) => point.x !== right[i]?.x || point.y !== right[i]?.y);
    assert.ok(splitIndex > 1);
    assert.equal(left[splitIndex - 1].y, 500);
    assert.equal(right[splitIndex - 1].y, 500);
    const state = flatArena(mobile);
    state.players[1].x = left[splitIndex - 1].x + 36;
    settlePlayers(state);
    const shot = fireShot(state, 'p1', 45, 45, 1100);
    assert.ok(shot.impacts.some(impact => impact.y < 500), 'a fragment collides with the Mobile before returning to the ground');
    assert.ok(state.players[1].hp < 100);
    assert.ok(shot.hitIds?.includes('p2'));
  }
});

test('split Mobiles share equipment ATK across fragments before Double Damage', () => {
  for (const mobile of ['manta', 'kestrel'] as const) {
    for (const special of [false, true]) {
      const state = flatArena(mobile);
      state.players[0].equipment = { hat: 'attack', armor: 'attack', flag: 'attack' };
      const shot = fireShot(state, 'p1', 45, 45, 1100, special);
      const fragmentCount = special ? 3 : 2;
      const base = special ? 19 : MOBILE_INFO[mobile].damage;
      assert.equal(shot.paths.length, fragmentCount);
      assert.equal(shot.impacts.length, fragmentCount);
      assert.equal(shot.impacts.reduce((total, impact) => total + impact.damage, 0), base * fragmentCount + 15);
      assert.ok(Math.max(...shot.impacts.map(impact => impact.damage)) - Math.min(...shot.impacts.map(impact => impact.damage)) <= 1);

      const doubled = flatArena(mobile);
      doubled.players[0].equipment = { hat: 'attack', armor: 'attack', flag: 'attack' };
      doubled.players[0].doubleArmed = true;
      const doubleShot = fireShot(doubled, 'p1', 45, 45, 1100, special);
      assert.equal(doubleShot.impacts.reduce((total, impact) => total + impact.damage, 0), 2 * (base * fragmentCount + 15));
    }

    const direct = flatArena(mobile);
    direct.players[0].equipment = { hat: 'attack', armor: 'attack', flag: 'attack' };
    direct.players[1].x = direct.players[0].x + 100;
    settlePlayers(direct);
    const directShot = fireShot(direct, 'p1', 10, 5, 1100);
    assert.equal(directShot.paths.length, 1);
    assert.equal(directShot.impacts[0].damage, MOBILE_INFO[mobile].damage + 15);
  }
});

test('split rounds leaving the arena never split in midair', () => {
  const state = flatArena('manta');
  state.players[0].x = 1180;
  settlePlayers(state);
  const shot = fireShot(state, 'p1', 10, 100, 1100);
  assert.equal(shot.paths.length, 1);
  assert.equal(shot.impacts.length, 0);
});

test('every Mobile uses the same direct projectile hitbox and its own base DEF', () => {
  assert.equal(MOBILE_HITBOX.halfWidth * 2, 80 * .7);
  assert.equal(MOBILE_HITBOX.halfHeight * 2, 69 * .7);
  for (const mobile of Object.keys(MOBILE_INFO) as MobileKind[]) {
    const state = flatArena('loom');
    const shooter = state.players[0], target = state.players[1];
    target.mobile = mobile;
    target.hp = MOBILE_INFO[mobile].maxHp;
    target.x = shooter.x + 100;
    settlePlayers(state);
    const shot = fireShot(state, 'p1', 10, 5, 1100);
    assert.equal(shot.impacts.length, 1, mobile);
    assert.ok(shot.impacts[0].y < groundAt(state.terrain, shot.impacts[0].x), mobile);
    assert.equal(target.hp, MOBILE_INFO[mobile].maxHp - Math.round((MOBILE_INFO.loom.damage - MOBILE_INFO[mobile].defense) / 2), mobile);
    assert.ok(shot.hitIds?.includes(target.id), mobile);
  }
});

test('a direct hit on a split-shot parent damages a Mobile without splitting midair', () => {
  for (const mobile of ['manta', 'kestrel'] as const) {
    const state = flatArena(mobile);
    const shooter = state.players[0], target = state.players[1];
    target.x = shooter.x + 100;
    settlePlayers(state);
    const shot = fireShot(state, 'p1', 10, 5, 1100);
    assert.equal(shot.paths.length, 1);
    assert.equal(shot.impacts.length, 1);
    assert.equal(target.hp, 100 - Math.round((MOBILE_INFO[mobile].damage - MOBILE_INFO.loom.defense) / 2));
  }
});

test('all Mobiles deal half their former shot damage after DEF, including specials, equipment, and Double Damage', () => {
  assert.equal(SHOT_DAMAGE_SCALE, 0.5);
  for (const mobile of Object.keys(MOBILE_INFO) as MobileKind[]) {
    for (const special of [false, true]) {
      for (const boosted of [false, true]) {
        const state = flatArena(mobile);
        const shooter = state.players[0], target = state.players[1];
        target.x = shooter.x + 100;
        if (boosted) {
          shooter.equipment = { hat: 'attack', armor: 'attack', flag: 'attack' };
          shooter.doubleArmed = true;
        }
        settlePlayers(state);
        const shot = fireShot(state, 'p1', 10, 5, 1100, special);
        assert.equal(shot.impacts.length, 1, `${mobile} special=${special}`);
        const formerDamage = shot.impacts[0].damage - MOBILE_INFO[target.mobile].defense;
        assert.equal(100 - target.hp, Math.round(formerDamage / 2), `${mobile} special=${special} boosted=${boosted}`);
      }
    }
  }
});

test('shots can destroy dropped items directly or with blast radius', () => {
  const preview = flatArena('loom');
  const groundImpact = fireShot(preview, 'p1', 45, 25, 1100).impacts[0];
  assert.ok(groundImpact);
  const direct = flatArena('loom');
  direct.drops = [{ id: 'direct', item: 'repair', x: groundImpact.x - 10, y: 476, spawnedTurn: 1 }];
  const directShot = fireShot(direct, 'p1', 45, 25, 1100);
  assert.ok(directShot.impacts[0].y < 500);
  assert.deepEqual(directShot.destroyedDrops?.map(drop => drop.id), ['direct']);
  assert.equal(direct.drops.length, 0);
  const splash = flatArena('loom');
  splash.drops = [{ id: 'splash', item: 'repair', x: groundImpact.x + 35, y: 476, spawnedTurn: 1 }];
  const splashShot = fireShot(splash, 'p1', 45, 25, 1100);
  assert.deepEqual(splashShot.destroyedDrops?.map(drop => drop.id), ['splash']);
  assert.equal(splash.drops.length, 0);
  assert.equal(splash.players[0].items.repair, 1);
});

test('lobby start waits for every guest to be ready', () => {
  const state = createState('READY1', 'p1', 'One', 'loom');
  state.players.push(makePlayer('p2', 'Two', 'vesper'));
  assert.throws(() => startRoundCore(state, 1, 1000), /กดพร้อม/);
  state.lobbyReady.push('p2');
  startRoundCore(state, 1, 1000);
  assert.equal(state.phase, 'playing');
});

test('rare Mobile roll has a five percent boundary and 150 maximum HP', () => {
  assert.equal(randomMobileFromRoll(0, 0.5), 'aegis');
  assert.equal(randomMobileFromRoll(0.049999, 0.5), 'aegis');
  assert.equal(randomMobileFromRoll(0.05, 0), 'loom');
  assert.equal(randomMobileFromRoll(0.99, 0.999), 'tempest');
  assert.equal(randomMobileFromRoll(0.99, 0.85), 'gale');
  const state = createState('RARE15', 'p1', 'Rare', 'aegis');
  state.players.push(makePlayer('p2', 'Other', 'loom'));
  assert.equal(state.players[0].hp, 150);
  state.players[0].hp = 12;
  startRound(state, 12, 1000);
  assert.equal(state.players[0].hp, 150);
  state.players[0].hp = 130;
  useItem(state, 'p1', 'repair', 1100);
  assert.equal(state.players[0].hp, 150);
});

test('wind Mobiles gain damage at strength seven in either direction, including special and Double Damage', () => {
  for (const mobile of ['gale', 'tempest'] as const) {
    for (const wind of [-8, -7, -6, 0, 6, 7, 8]) {
      const bonus = Math.abs(wind) >= 7 ? 12 : 0;
      assert.equal(windDamageBonus(mobile, wind), bonus);
      for (const special of [false, true]) {
        const state = flatArena(mobile);
        state.wind = wind;
        state.players[0].equipment.hat = 'attack';
        state.players[0].doubleArmed = true;
        const result = fireShot(state, 'p1', 45, 25, 1100, special);
        assert.equal(result.impacts.length, 1);
        const base = special ? mobile === 'gale' ? 40 : 43 : MOBILE_INFO[mobile].damage;
        assert.equal(result.impacts[0].damage, (base + 5 + bonus) * 2);
      }
    }
  }
  assert.equal(windDamageBonus('loom', 8), 0);
  assert.equal(windDamageBonus('aegis', -8), 0);
});

test('random equipment has five percent gold and divides the remainder equally, resetting with rematch', () => {
  assert.equal(randomEquipmentFromRoll(0), 'gold');
  assert.equal(randomEquipmentFromRoll(0.049999), 'gold');
  assert.equal(randomEquipmentFromRoll(0.05), 'attack');
  assert.equal(randomEquipmentFromRoll(0.05 + 0.95 / 3 - 0.00001), 'attack');
  assert.equal(randomEquipmentFromRoll(0.05 + 0.95 / 3), 'defense');
  assert.equal(randomEquipmentFromRoll(0.05 + 2 * 0.95 / 3 - 0.00001), 'defense');
  assert.equal(randomEquipmentFromRoll(0.05 + 2 * 0.95 / 3), 'health');
  assert.equal(randomEquipmentFromRoll(0.99999), 'health');
  assert.equal(Array.from({length: 10000}, (_, i) => randomEquipmentFromRoll(i / 10000)).filter(set => set === 'gold').length, 500);
  const state = flatArena('gale');
  state.players[0].randomEquipment = { hat: true, armor: true, flag: true };
  state.phase = 'finished';
  returnToLobby(state);
  assert.deepEqual(state.players[0].randomEquipment, { hat: false, armor: false, flag: false });
});

test('gold equipment adds three to attack, defense and HP per piece and stacks with ordinary equipment', () => {
  const state = flatArena();
  const player = state.players[0];
  player.equipment = {hat: 'gold', armor: 'gold', flag: 'gold'};
  for (const stat of ['attack', 'defense', 'health'] as const) assert.equal(equipmentBonus(player, stat), 9);
  assert.equal(maxHpFor(player), 109);
  player.equipment = {hat: 'gold', armor: 'attack', flag: 'health'};
  assert.equal(equipmentBonus(player, 'attack'), 8);
  assert.equal(equipmentBonus(player, 'defense'), 3);
  assert.equal(equipmentBonus(player, 'health'), 8);
  const shot = fireShot(state, 'p1', 45, 25, 1100);
  assert.equal(shot.impacts[0].damage, MOBILE_INFO.borer.damage + 8);
});

test('round starts with 2–4 players, seeded terrain, and a server turn', () => {
  for (const count of [2, 3, 4]) {
    const state = createState('ROOM42', 'p1', 'One', 'loom');
    for (let i = 2; i <= count; i++) state.players.push(makePlayer(`p${i}`, `Player ${i}`, 'borer'));
    startRound(state, 42, 1000);
    assert.equal(state.phase, 'playing');
    assert.equal(state.activeId, 'p1');
    assert.equal(state.deadline, 31_000);
    assert.equal(state.players.length, count);
    assert.equal(state.terrain.length, 129);
    assert.equal(state.wind, windFor(42, 1));
    for (const player of state.players) assert.equal(player.y, groundAt(state.terrain, player.x) - 13);
  }
});

test('turn owner, shot range, and item inventory are enforced', () => {
  const state = createState('ROOM42', 'p1', 'One', 'loom');
  state.players.push(makePlayer('p2', 'Two', 'manta'));
  startRound(state, 123, 1000);
  assert.throws(() => fireShot(state, 'p2', 45, 65, 1200), /เทิร์น/);
  assert.throws(() => fireShot(state, 'p1', 81, 65, 1200), /มุม/);
  assert.throws(() => fireShot(state, 'p1', 45, 4, 1200), /พลัง/);
  assert.throws(() => fireTeleport(state, 'p2', 45, 65, 1200), /เทิร์น/);
  useItem(state, 'p1', 'double', 1200);
  assert.equal(state.players[0].doubleArmed, true);
  assert.equal(state.players[0].items.double, 0);
  assert.throws(() => useItem(state, 'p1', 'double', 1200), /หมด/);
  const result = fireShot(state, 'p1', 45, 65, 1300);
  assert.equal(result.paths.length, 1);
  assert.ok(result.paths[0][0].x > state.players[0].x);
  assert.equal(state.players[0].doubleArmed, false);
  assert.equal(state.activeId, 'p2');
});

test('five percent is a valid firing power', () => {
  const state = createState('POWER5', 'p1', 'One', 'loom');
  state.players.push(makePlayer('p2', 'Two', 'manta'));
  startRound(state, 12, 1000);
  assert.equal(fireShot(state, 'p1', 45, 5, 1100).kind, 'damage');
});

test('mixed equipment adds five points per piece to attack, defense, or HP', () => {
  const initial = createState('GEAR55', 'p1', 'One', 'halo');
  initial.players.push(makePlayer('p2', 'Two', 'cinder'));
  initial.players[0].equipment = { hat: 'attack', armor: 'attack', flag: 'attack' };
  initial.players[1].equipment = { hat: 'defense', armor: 'defense', flag: 'health' };
  startRound(initial, 18, 1000);
  assert.equal(equipmentBonus(initial.players[0], 'attack'), 15);
  assert.equal(equipmentBonus(initial.players[1], 'defense'), 10);
  assert.equal(maxHpFor(initial.players[1]), 105);
  assert.equal(initial.players[1].hp, 105);
  const probe = fireShot(structuredClone(initial), 'p1', 45, 45, 1100);
  assert.ok(probe.impacts.length);
  initial.players[1].x = probe.impacts[0].x;
  initial.players[1].y = groundAt(initial.terrain, probe.impacts[0].x) - 13;
  const unarmored = structuredClone(initial);
  unarmored.players[1].equipment = { hat: null, armor: null, flag: null };
  unarmored.players[1].hp = 100;
  const base = structuredClone(unarmored);
  base.players[0].equipment = { hat: null, armor: null, flag: null };
  const boosted = fireShot(initial, 'p1', 45, 45, 1100);
  const plain = fireShot(unarmored, 'p1', 45, 45, 1100);
  const baseShot = fireShot(base, 'p1', 45, 45, 1100);
  assert.equal(boosted.impacts[0].damage, baseShot.impacts[0].damage + 15);
  assert.equal(boosted.impacts[0].damage, plain.impacts[0].damage);
  assert.ok(105 - initial.players[1].hp < 100 - unarmored.players[1].hp);
});

test('meteor chance is three percent per turn and direct hits deal 20 HP', () => {
  const hits = Array.from({ length: 10000 }, (_, turn) => meteorOn(321, turn + 2)).filter(Boolean).length;
  assert.ok(hits > 240 && hits < 360, `observed ${hits} / 10000`);
  const state = createState('METEOR', 'p1', 'One', 'loom');
  state.players.push(makePlayer('p2', 'Two', 'borer'));
  startRound(state, 18, 1000);
  const x = state.players[1].x;
  const oldGround = groundAt(state.terrain, x);
  const meteor = dropMeteor(state, x);
  assert.deepEqual(meteor.hitIds, ['p2']);
  assert.equal(state.players[1].hp, 80);
  assert.equal(meteor.y, oldGround);
  assert.ok(groundAt(state.terrain, x) > oldGround);
  assert.equal(METEOR_CRATER_RADIUS, 91);
  const seeded = createState('METE02', 'p1', 'One', 'loom');
  seeded.players.push(makePlayer('p2', 'Two', 'borer'));
  const seed = Array.from({ length: 1000 }, (_, i) => i).find(candidate => meteorOn(candidate, 2));
  assert.notEqual(seed, undefined);
  startRound(seeded, seed!, 1000);
  finishOrAdvance(seeded, 1100);
  assert.equal(seeded.turn, 2);
  assert.equal(seeded.meteor?.turn, 2);
  assert.ok(seeded.meteor!.x >= 100 && seeded.meteor!.x <= 1180);
});

test('practice keeps the trainee active, restores target, and has no deadline', () => {
  const state = createState('PRACTC', 'p1', 'One', 'loom');
  state.mode = 'practice';
  state.players.push(makePlayer('target', 'หุ่นฝึก', 'borer'));
  startRoundCore(state, 18, 1000);
  assert.equal(state.deadline, 0);
  for (let turn = 1; turn <= 4; turn++) {
    state.players[1].hp = 1;
    fireShot(state, 'p1', 45, 50, 1000 + turn * 1000);
    assert.equal(state.phase, 'playing');
    assert.equal(state.activeId, 'p1');
    assert.equal(state.turn, turn + 1);
    assert.equal(state.deadline, 0);
    assert.equal(state.players[1].hp, 100);
  }
  resetPractice(state, 123, 8000);
  assert.equal(state.turn, 1);
  assert.equal(state.terrain.length, 129);
});

test('repair and a fired teleport projectile spend a turn', () => {
  const state = createState('ROOM42', 'p1', 'One', 'loom');
  state.players.push(makePlayer('p2', 'Two', 'manta'));
  startRound(state, 7, 1000);
  state.players[0].hp = 60;
  useItem(state, 'p1', 'repair', 1100);
  assert.equal(state.players[0].hp, 88);
  assert.equal(state.activeId, 'p2');
  fireShot(state, 'p2', 10, 20, 1200);
  assert.equal(state.activeId, 'p1');
  const shot = fireTeleport(state, 'p1', 80, 20, 1300);
  assert.equal(shot.kind, 'teleport');
  assert.equal(shot.paths.length, 1);
  assert.equal(state.players[0].x, shot.impacts[0].x);
  assert.equal(state.players[0].items.teleport, 0);
  assert.equal(state.activeId, 'p2');
});

test('walking is gradual, follows terrain, and is restricted to the active turn', () => {
  const state = createState('ROOM42', 'p1', 'One', 'loom');
  state.players.push(makePlayer('p2', 'Two', 'manta'));
  startRound(state, 9, 1000);
  const oldX = state.players[0].x;
  assert.throws(() => movePlayer(state, 'p2', -1, 50), /เทิร์น/);
  for (let i = 0; i < 20; i++) movePlayer(state, 'p1', 1, 50);
  assert.ok(Math.abs(state.players[0].x - (oldX + MOVE_SPEED)) < 0.01);
  assert.equal(state.players[0].y, groundAt(state.terrain, state.players[0].x) - 13);
  assert.equal(state.players[0].facing, 1);
  turnPlayer(state, 'p1');
  assert.equal(state.players[0].facing, -1);
});

test('walking can pass through another Mobile while retaining the turn distance limit', () => {
  const state = flatArena('loom');
  const walker = state.players[0], other = state.players[1];
  other.x = walker.x + 30;
  settlePlayers(state);
  for (let i = 0; i < 10; i++) assert.equal(movePlayer(state, 'p1', 1, 100), true);
  assert.ok(walker.x > other.x);
  assert.ok(Math.abs(walker.walkedThisTurn - 88) < 0.001);
  assert.equal(walker.hp, 100);
  assert.equal(other.hp, 100);
});

test('walking has a cumulative per-turn limit and resets on the next turn', () => {
  assert.equal(TURN_MOVE_LIMIT, 175);
  const state = createState('WALK42', 'p1', 'One', 'loom');
  state.players.push(makePlayer('p2', 'Two', 'manta'));
  startRound(state, 9, 1000);
  for (let i = 0; i < 120; i++) movePlayer(state, 'p1', i % 2 === 0 ? 1 : -1, 100);
  assert.ok(Math.abs(state.players[0].walkedThisTurn - TURN_MOVE_LIMIT) < 0.001);
  const stoppedX = state.players[0].x;
  movePlayer(state, 'p1', 1, 100);
  assert.equal(state.players[0].x, stoppedX);
  finishOrAdvance(state, 2000);
  finishOrAdvance(state, 3000);
  assert.equal(state.players[0].walkedThisTurn, 0);
  assert.equal(movePlayer(state, 'p1', 1, 100), true);
});

test('rematch returns to lobby and requires fresh Mobile choices and readiness', () => {
  const state = createState('REMAT1', 'p1', 'One', 'loom');
  state.players.push(makePlayer('p2', 'Two', 'manta'));
  startRound(state, 23, 1000);
  state.phase = 'finished';
  state.players[0].mobile = 'aegis';
  state.players[0].randomUsed = true;
  state.players[0].hp = 12;
  state.rematchReady = ['p1', 'p2'];
  returnToLobby(state);
  assert.equal(state.phase, 'lobby');
  assert.deepEqual(state.players.map(player => player.mobile), ['loom', 'loom']);
  assert.deepEqual(state.players.map(player => player.randomUsed), [false, false]);
  assert.deepEqual(state.players.map(player => player.hp), [100, 100]);
  assert.equal(state.rematchReady.length, 0);
  assert.equal(state.lobbyReady.length, 0);
  assert.equal(state.terrain.length, 0);
  assert.throws(() => startRoundCore(state, 24, 2000), /กดพร้อม/);
  state.players[1].mobile = 'borer';
  state.lobbyReady.push('p2');
  startRoundCore(state, 24, 2000);
  assert.equal(state.phase, 'playing');
  assert.equal(state.players[1].mobile, 'borer');
});

test('wind only changes on seeded 20 percent rolls', () => {
  const state = createState('WIND42', 'p1', 'One', 'loom');
  state.players.push(makePlayer('p2', 'Two', 'manta'));
  startRound(state, 42, 1000);
  // Exercise wind independently of accumulated meteor damage and excavation.
  state.mode = 'practice';
  let changed = 0;
  for (let turn = 2; turn <= 1000; turn++) {
    const before = state.wind;
    finishOrAdvance(state, turn * 1000);
    const expected = windChangesOn(state.seed, turn);
    assert.equal(state.wind !== before, expected, `turn ${turn}`);
    if (expected) changed++;
  }
  assert.ok(changed >= 150 && changed <= 250, `observed ${changed}/999 wind changes`);
});

test('2v2 assigns teams, allows friendly fire, and supports a same-room round reset', () => {
  const state = createState('TEAM42', 'p1', 'One', 'loom');
  for (let i = 2; i <= 4; i++) state.players.push(makePlayer(`p${i}`, `Player ${i}`, 'borer'));
  state.mode = 'teams';
  startRound(state, 77, 1000);
  assert.deepEqual(state.players.map(player => player.team), [0, 1, 0, 1]);
  const preview = fireShot(structuredClone(state), 'p1', 45, 45, 1100);
  const impact = preview.impacts[0];
  assert.ok(impact);
  for (const player of [state.players[1], state.players[2]]) {
    player.x = impact.x;
    player.y = impact.y - 13;
  }
  fireShot(state, 'p1', 45, 45, 1100);
  assert.ok(state.players[1].hp < 100);
  assert.ok(state.players[2].hp < 100);
  assert.equal(state.players[0].stats.hits, 1);
  assert.ok(state.players[0].stats.damageDealt > 0);
  state.phase = 'finished';
  startRound(state, 78, 2000);
  assert.equal(state.players[1].hp, 100);
  assert.equal(state.players[0].stats.shots, 0);
  assert.equal(state.turn, 1);
});

test('each Mobile has a single-use special shot that resets next round', () => {
  for (const mobile of ORDINARY_MOBILES) {
    const state = createState('SKILL1', 'p1', 'One', mobile);
    state.players.push(makePlayer('p2', 'Two', 'loom'));
    startRound(state, 47, 1000);
    const shot = fireShot(state, 'p1', 45, 45, 1100, true);
    assert.equal(shot.mobile, mobile);
    assert.equal(shot.shooterId, 'p1');
    assert.equal(shot.special, true);
    assert.equal(state.players[0].specialAvailable, false);
    assert.equal(state.players[0].stats.shots, 1);
    assert.equal(state.players[0].stats.itemsUsed, 1);
    if (mobile === 'manta' || mobile === 'kestrel') assert.equal(shot.paths.length, 3);
    if (state.phase === 'playing') {
      fireShot(state, 'p2', 45, 45, 1200);
      assert.throws(() => fireShot(state, 'p1', 45, 45, 1300, true), /ใช้ไปแล้ว/);
    }
    state.phase = 'finished';
    startRound(state, 48, 2000);
    assert.equal(state.players[0].specialAvailable, true);
  }
});

test('Vesper ignores wind with its special and Bramble restores health', () => {
  const vesper = createState('VESPER', 'p1', 'One', 'vesper');
  vesper.players.push(makePlayer('p2', 'Two', 'loom'));
  startRound(vesper, 18, 1000);
  const calm = structuredClone(vesper);
  calm.wind = 0;
  const windy = structuredClone(vesper);
  windy.wind = 8;
  const calmShot = fireShot(calm, 'p1', 45, 45, 1100, true);
  const windyShot = fireShot(windy, 'p1', 45, 45, 1100, true);
  assert.deepEqual(windyShot.paths, calmShot.paths);

  const bramble = createState('BRAMBL', 'p1', 'One', 'bramble');
  bramble.players.push(makePlayer('p2', 'Two', 'loom'));
  startRound(bramble, 18, 1000);
  bramble.players[0].hp = 60;
  fireShot(bramble, 'p1', 45, 45, 1100, true);
  assert.ok(bramble.players[0].hp >= 60 && bramble.players[0].hp <= 82);
});

test('an item drops on turn 8 and only an empty matching slot can collect it', () => {
  const state = createState('DROP42', 'p1', 'One', 'loom');
  state.players.push(makePlayer('p2', 'Two', 'manta'));
  startRound(state, 22, 1000);
  for (let turn = 2; turn <= 8; turn++) finishOrAdvance(state, 1000 + turn);
  assert.equal(state.turn, 8);
  assert.equal(state.drops.length, 1);
  const drop = state.drops[0];
  assert.equal(drop.spawnedTurn, 8);
  const player = state.players.find(candidate => candidate.id === state.activeId)!;
  player.x = drop.x;
  assert.equal(collectItemDrop(state, player), null);
  assert.equal(state.drops.length, 1);
  if (drop.item === 'special') player.specialAvailable = false;
  else player.items[drop.item] = 0;
  assert.equal(collectItemDrop(state, player), drop.item);
  if (drop.item === 'special') assert.equal(player.specialAvailable, true);
  else assert.equal(player.items[drop.item], 1);
  assert.equal(player.stats.pickups, 1);
  assert.equal(state.drops.length, 0);
  for (let turn = 9; turn <= 16; turn++) finishOrAdvance(state, 1000 + turn);
  assert.equal(state.turn, 16);
  assert.equal(state.drops[0].spawnedTurn, 16);
});

test('drop odds are 23/23/23/23/8 and a special drop refills only an empty special slot', () => {
  assert.equal(dropKindForRoll(0), 'double');
  assert.equal(dropKindForRoll(0.229999), 'double');
  assert.equal(dropKindForRoll(0.23), 'repair');
  assert.equal(dropKindForRoll(0.46), 'teleport');
  assert.equal(dropKindForRoll(0.689999), 'teleport');
  assert.equal(dropKindForRoll(0.69), 'double-play');
  assert.equal(dropKindForRoll(0.919999), 'double-play');
  assert.equal(dropKindForRoll(0.92), 'special');
  assert.equal(dropKindForRoll(0.999999), 'special');
  const state = createState('SPEC10', 'p1', 'One', 'loom');
  const player = state.players[0];
  player.x = 300;
  state.drops.push({ id: 'special-drop', item: 'special', x: 300, y: 400, spawnedTurn: 8 });
  assert.equal(collectItemDrop(state, player), null);
  assert.equal(state.drops.length, 1);
  player.specialAvailable = false;
  assert.equal(collectItemDrop(state, player), 'special');
  assert.equal(player.specialAvailable, true);
  assert.equal(player.stats.pickups, 1);
  assert.equal(state.drops.length, 0);
});

test('Double Play gives one fresh consecutive turn, then resumes normal order', () => {
  const state = createState('DOUBLE', 'p1', 'One', 'loom');
  state.players.push(makePlayer('p2', 'Two', 'borer'));
  startRound(state, 123, 1000);
  const player = state.players[0];
  player.walkedThisTurn = TURN_MOVE_LIMIT;
  useItem(state, 'p1', 'double-play', 1500);
  assert.equal(state.turn, 1);
  assert.equal(player.items['double-play'], 0);
  assert.equal(player.extraTurnArmed, true);
  player.items['double-play'] = 1;
  assert.throws(() => useItem(state, 'p1', 'double-play', 1600), /Double Play/);
  useItem(state, 'p1', 'repair', 2000);
  assert.equal(state.activeId, 'p1');
  assert.equal(state.turn, 2);
  assert.equal(state.deadline, 32000);
  assert.equal(player.walkedThisTurn, 0);
  assert.equal(player.extraTurnArmed, false);
  finishOrAdvance(state, 32000);
  assert.equal(state.activeId, 'p2');
  assert.equal(state.turn, 3);
});

test('Double Play works after shooting and expiry, but never retains a dead or disconnected player', () => {
  for (const end of ['shot', 'expiry', 'dead', 'disconnected'] as const) {
    const state = createState('EXTRA1', 'p1', 'One', 'loom');
    state.players.push(makePlayer('p2', 'Two', 'borer'), makePlayer('p3', 'Three', 'halo'));
    startRound(state, 123, 0);
    useItem(state, 'p1', 'double-play', 1);
    if (end === 'dead') state.players[0].hp = 0;
    if (end === 'disconnected') state.players[0].connected = false;
    if (end === 'shot') fireShot(state, 'p1', 80, 5, 1000);
    else finishOrAdvance(state, 30000);
    assert.equal(state.activeId, end === 'dead' || end === 'disconnected' ? 'p2' : 'p1');
    assert.equal(state.players[0].extraTurnArmed, false);
    if (state.activeId === 'p1') { finishOrAdvance(state, 60000); assert.equal(state.activeId, 'p2'); }
  }
});

test('Double Play drops fill only an empty item slot', () => {
  const state = createState('PICKUP', 'p1', 'One', 'loom');
  const player = state.players[0]; player.x = 300;
  state.drops.push({ id: 'extra', item: 'double-play', x: 300, y: 400, spawnedTurn: 8 });
  assert.equal(collectItemDrop(state, player), null);
  player.items['double-play'] = 0;
  assert.equal(collectItemDrop(state, player), 'double-play');
  assert.equal(player.items['double-play'], 1);
});

test('practice Mobile selection resets the same arena with the chosen vehicle and fresh inventory', () => {
  const state = createState('TRAIN1', 'p1', 'One', 'loom');
  state.mode = 'practice'; state.players.push(makePlayer('target', 'Target', 'borer'));
  startRound(state, 123, 0);
  const terrain = [...state.terrain];
  fireShot(state, 'p1', 30, 50, 1000);
  selectPracticeMobile(state, 'p1', 'aegis', 2000);
  assert.equal(state.players[0].mobile, 'aegis');
  assert.equal(state.players[0].hp, 150);
  assert.equal(state.players[0].items['double-play'], 1);
  assert.equal(state.turn, 1); assert.equal(state.deadline, 0);
  assert.deepEqual(state.terrain, terrain);
  assert.throws(() => selectPracticeMobile(state, 'target', 'loom', 3000), /โหมดฝึก/);
  assert.throws(() => selectPracticeMobile(state, 'p1', 'bad' as never, 3000), /Mobile/);
  state.mode = 'ffa';
  assert.throws(() => selectPracticeMobile(state, 'p1', 'loom', 3000), /โหมดฝึก/);
});

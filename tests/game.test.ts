import assert from 'node:assert/strict';
import test from 'node:test';
import { collectItemDrop, createState, dropKindForRoll, dropMeteor, equipmentBonus, finishOrAdvance, fireShot, fireTeleport, groundAt, makePlayer, maxHpFor, meteorOn, METEOR_CRATER_RADIUS, movePlayer, MOVE_SPEED, randomMobileFromRoll, resetPractice, returnToLobby, startRound as startRoundCore, TURN_MOVE_LIMIT, turnPlayer, useItem, windChangesOn, windFor } from '../shared/game.ts';
import type { GameState } from '../shared/game.ts';

function startRound(state: GameState, seed: number, now: number): void {
  if (state.phase === 'lobby') state.lobbyReady = state.players.filter(player => player.id !== state.hostId).map(player => player.id);
  startRoundCore(state, seed, now);
}

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
  assert.equal(randomMobileFromRoll(0.99, 0.999), 'cinder');
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

test('2v2 assigns teams, prevents friendly fire, and supports a same-room round reset', () => {
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
  assert.equal(state.players[2].hp, 100);
  assert.equal(state.players[0].stats.hits, 1);
  assert.ok(state.players[0].stats.damageDealt > 0);
  state.phase = 'finished';
  startRound(state, 78, 2000);
  assert.equal(state.players[1].hp, 100);
  assert.equal(state.players[0].stats.shots, 0);
  assert.equal(state.turn, 1);
});

test('each Mobile has a single-use special shot that resets next round', () => {
  for (const mobile of ['loom', 'manta', 'borer', 'vesper', 'bramble', 'halo', 'kestrel', 'cinder'] as const) {
    const state = createState('SKILL1', 'p1', 'One', mobile);
    state.players.push(makePlayer('p2', 'Two', 'loom'));
    startRound(state, 47, 1000);
    const shot = fireShot(state, 'p1', 45, 45, 1100, true);
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

test('drop odds are 30/30/30/10 and a special drop refills only an empty special slot', () => {
  assert.equal(dropKindForRoll(0), 'double');
  assert.equal(dropKindForRoll(0.299999), 'double');
  assert.equal(dropKindForRoll(0.3), 'repair');
  assert.equal(dropKindForRoll(0.6), 'teleport');
  assert.equal(dropKindForRoll(0.9), 'special');
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

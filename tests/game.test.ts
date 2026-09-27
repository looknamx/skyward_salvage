import assert from 'node:assert/strict';
import test from 'node:test';
import { collectItemDrop, createState, finishOrAdvance, fireShot, fireTeleport, groundAt, makePlayer, movePlayer, MOVE_SPEED, startRound, turnPlayer, useItem, windFor } from '../shared/game.ts';

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
  for (const mobile of ['loom', 'manta', 'borer'] as const) {
    const state = createState('SKILL1', 'p1', 'One', mobile);
    state.players.push(makePlayer('p2', 'Two', 'loom'));
    startRound(state, 47, 1000);
    const shot = fireShot(state, 'p1', 45, 45, 1100, true);
    assert.equal(shot.special, true);
    assert.equal(state.players[0].specialAvailable, false);
    assert.equal(state.players[0].stats.shots, 1);
    assert.equal(state.players[0].stats.itemsUsed, 1);
    if (mobile === 'manta') assert.equal(shot.paths.length, 3);
    if (state.phase === 'playing') {
      fireShot(state, 'p2', 45, 45, 1200);
      assert.throws(() => fireShot(state, 'p1', 45, 45, 1300, true), /ใช้ไปแล้ว/);
    }
    state.phase = 'finished';
    startRound(state, 48, 2000);
    assert.equal(state.players[0].specialAvailable, true);
  }
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
  player.items[drop.item] = 0;
  assert.equal(collectItemDrop(state, player), drop.item);
  assert.equal(player.items[drop.item], 1);
  assert.equal(player.stats.pickups, 1);
  assert.equal(state.drops.length, 0);
  for (let turn = 9; turn <= 16; turn++) finishOrAdvance(state, 1000 + turn);
  assert.equal(state.turn, 16);
  assert.equal(state.drops[0].spawnedTurn, 16);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import WebSocket from 'ws';
import type { ServerEvent } from '../shared/game.ts';
import { EQUIPMENT_SETS, fireTeleport, maxHpFor } from '../shared/game.ts';

const port = 34000 + Math.floor(Math.random() * 10000);
const child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
  cwd: process.cwd(), env: { ...process.env, PORT: String(port) }, stdio: 'ignore',
});

async function ready(): Promise<void> {
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(`http://127.0.0.1:${port}/health`)).ok) return; } catch { /* waiting */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('server did not start');
}

class Client {
  socket: WebSocket;
  events: ServerEvent[] = [];
  constructor() {
    this.socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    this.socket.on('message', raw => this.events.push(JSON.parse(raw.toString()) as ServerEvent));
  }
  async open(): Promise<void> { await once(this.socket, 'open'); }
  send(value: unknown): void { this.socket.send(JSON.stringify(value)); }
  async waitFor(predicate: (event: ServerEvent) => boolean): Promise<ServerEvent> {
    for (let i = 0; i < 80; i++) {
      const index = this.events.findIndex(predicate);
      if (index >= 0) return this.events.splice(index, 1)[0];
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error('event timeout');
  }
  close(): void { this.socket.close(); }
}

test('real WebSocket rooms play with 2, 3, and 4 clients', { timeout: 30_000 }, async () => {
  await ready();
  try {
    for (const count of [2, 3, 4]) {
      const clients = Array.from({ length: count }, () => new Client());
      await Promise.all(clients.map(client => client.open()));
      const host = clients[0];
      host.send({ type: 'create', name: 'Host', mobile: 'loom' });
      const welcome = await host.waitFor(e => e.type === 'welcome');
      assert.equal(welcome.type, 'welcome');
      const code = welcome.code;
      const sessionTokens = [welcome.token];
      for (let i = 1; i < count; i++) {
        clients[i].send({ type: 'join', code, name: `Friend ${i}`, mobile: i % 2 ? 'manta' : 'borer' });
        const joined = await clients[i].waitFor(e => e.type === 'welcome');
        assert.equal(joined.type, 'welcome');
        sessionTokens.push(joined.token);
      }
      if (count === 3) {
        clients[2].send({ type: 'select', mobile: 'aegis' });
        await clients[2].waitFor(e => e.type === 'error' && /Mobile/.test(e.message));
        clients[2].send({ type: 'random-mobile' });
        const rolled = await clients[2].waitFor(e => e.type === 'state' && e.state.players[2].randomUsed);
        assert.equal(rolled.type, 'state');
        assert.equal(rolled.state.players[2].mobile, 'borer');
        assert.equal(rolled.state.players[2].hp, 100);
        clients[2].send({ type: 'random-mobile' });
        await clients[2].waitFor(e => e.type === 'state' && e.state.players[2].randomUsed);
        clients[2].send({ type: 'select', mobile: 'loom' });
        const unselected = await clients[2].waitFor(e => e.type === 'state' && !e.state.players[2].randomUsed && e.state.players[2].mobile === 'loom');
        assert.equal(unselected.type, 'state');
        clients[2].send({ type: 'random-mobile' });
        await clients[2].waitFor(e => e.type === 'state' && e.state.players[2].randomUsed && e.state.players[2].mobile === 'loom');
      }
      if (count === 4) {
        host.send({ type: 'set-mode', mode: 'teams' });
        await host.waitFor(e => e.type === 'state' && e.state.mode === 'teams');
        host.send({ type: 'set-team', team: 1 });
        await host.waitFor(e => e.type === 'state' && e.state.players[0].team === 1);
        host.send({ type: 'start' });
        await host.waitFor(e => e.type === 'error' && /ฝั่งละ 2/.test(e.message));
        host.send({ type: 'set-team', team: 0 });
        await host.waitFor(e => e.type === 'state' && e.state.players[0].team === 0);
      }
      host.send({ type: 'select', mobile: 'bramble' });
      clients[1].send({ type: 'select', mobile: 'cinder' });
      await host.waitFor(e => e.type === 'state' && e.state.players[0]?.mobile === 'bramble' && e.state.players[1]?.mobile === 'cinder');
      clients[1].send({ type: 'equip', slot: 'hat', set: 'health' });
      clients[1].send({ type: 'equip', slot: 'armor', set: 'defense' });
      clients[1].send({ type: 'equip', slot: 'flag', set: 'attack' });
      await clients[1].waitFor(e => e.type === 'state' && e.state.players[1]?.equipment.flag === 'attack');
      const hiddenLoadout = await host.waitFor(e => e.type === 'state' && e.state.players[1]?.equipment.flag === null);
      assert.equal(hiddenLoadout.type, 'state');
      assert.deepEqual(hiddenLoadout.state.players[1].equipment, { hat: null, armor: null, flag: null });
      assert.equal(hiddenLoadout.state.players[1].hp, 100);
      if (count === 2) {
        host.send({ type: 'start' });
        await host.waitFor(e => e.type === 'error' && /กดพร้อม/.test(e.message));
      }
      for (let i = 1; i < count; i++) clients[i].send({ type: 'lobby-ready', ready: true });
      const lobbyState = await host.waitFor(e => e.type === 'state' && e.state.lobbyReady.length === count - 1);
      assert.equal(lobbyState.type, 'state');
      assert.deepEqual(lobbyState.state.players[1].equipment, { hat: null, armor: null, flag: null });
      if (count === 2) {
        clients[1].send({ type: 'select', mobile: 'manta' });
        await clients[1].waitFor(e => e.type === 'error' && /ยกเลิกพร้อม/.test(e.message));
      }
      host.send({ type: 'start' });
      const states = await Promise.all(clients.map(client => client.waitFor(e => e.type === 'state' && e.state.phase === 'playing')));
      for (const event of states) {
        assert.equal(event.type, 'state');
        assert.equal(event.state.players.length, count);
        assert.equal(event.state.activeId, welcome.id);
        assert.equal(event.state.mode, count === 4 ? 'teams' : 'ffa');
        assert.equal(event.state.players[1].hp, 105);
        assert.deepEqual(event.state.players[1].equipment, { hat: 'health', armor: 'defense', flag: 'attack' });
        if (count === 3) {
          assert.equal(event.state.players[2].hp, event.state.players[2].mobile === 'aegis' ? 150 : 100);
          assert.equal(event.state.players[2].randomUsed, true);
        }
      }
      const initialX = states[0].type === 'state' ? states[0].state.players[0].x : 0;
      host.send({ type: 'move', direction: 1 });
      const walking = await Promise.all(clients.map(client => client.waitFor(
        e => e.type === 'state' && e.state.turn === 1 && e.state.players[0].x > initialX + 8,
      )));
      const walkPositions = walking.map(e => e.type === 'state' ? e.state.players[0].x : 0);
      assert.deepEqual(walkPositions, Array(count).fill(walkPositions[0]));
      host.send({ type: 'move', direction: 0 });
      clients[1].send({ type: 'fire', angle: 45, power: 65 });
      await clients[1].waitFor(e => e.type === 'error');
      host.send({ type: 'fire', angle: 45, power: 65, special: count === 2 });
      if (count === 2) {
        const specialSounds = await Promise.all(clients.map(client => client.waitFor(e => e.type === 'item-used' && e.item === 'special')));
        assert.deepEqual(specialSounds, Array(count).fill(specialSounds[0]));
      }
      const damageShots = await Promise.all(clients.map(client => client.waitFor(e => e.type === 'shot')));
      assert.deepEqual(damageShots, Array(count).fill(damageShots[0]));
      assert.equal(damageShots[0].type === 'shot' && damageShots[0].shot.mobile, 'bramble');
      assert.equal(damageShots[0].type === 'shot' && damageShots[0].shot.shooterId, welcome.id);
      if (count === 2) assert.equal(damageShots[0].type === 'shot' && damageShots[0].shot.special, true);
      const next = await Promise.all(clients.map(client => client.waitFor(e => e.type === 'state' && e.state.turn === 2)));
      for (const event of next) {
        assert.equal(event.type, 'state');
        assert.equal(event.state.activeId, event.state.players[1].id);
      }
      const nextStates = next.map(e => e.type === 'state' ? e.state : null);
      assert.deepEqual(nextStates, Array(count).fill(nextStates[0]));
      assert.ok(nextStates[0]!.players[0].x > initialX);
      const oldX = nextStates[0]!.players[1].x;
      let teleportAim: { angle: number; power: number } | null = null;
      for (const angle of [20, 30, 40, 50, 60, 70, 80]) {
        for (const power of [20, 30, 40, 50, 60, 70]) {
          try {
            fireTeleport(structuredClone(nextStates[0]!), nextStates[0]!.players[1].id, angle, power, Date.now());
            teleportAim = { angle, power };
            break;
          } catch { /* Try a different landing position. */ }
        }
        if (teleportAim) break;
      }
      assert.ok(teleportAim, 'a valid teleport shot exists for the random map');
      clients[1].send({ type: 'item', item: 'teleport', ...teleportAim });
      const teleportShots = await Promise.all(clients.map(client => client.waitFor(e => e.type === 'shot' && e.shot.kind === 'teleport')));
      assert.deepEqual(teleportShots, Array(count).fill(teleportShots[0]));
      const afterTeleport = await Promise.all(clients.map(client => client.waitFor(e => e.type === 'state' && e.state.turn === 3)));
      const teleportStates = afterTeleport.map(e => e.type === 'state' ? e.state : null);
      assert.deepEqual(teleportStates, Array(count).fill(teleportStates[0]));
      assert.notEqual(teleportStates[0]!.players[1].x, oldX);
      assert.equal(teleportStates[0]!.players[1].items.teleport, 0);
      assert.equal(teleportStates[0]!.players[1].x, teleportShots[0].type === 'shot' ? teleportShots[0].shot.impacts[0].x : NaN);
      if (count === 4) {
        clients[2].close();
        await host.waitFor(e => e.type === 'state' && e.state.phase === 'playing' && e.state.players.length === 4 && !e.state.players[2].connected);
        const resumedClient = new Client();
        await resumedClient.open();
        resumedClient.send({ type: 'resume', token: sessionTokens[2] });
        const resumed = await resumedClient.waitFor(e => e.type === 'welcome');
        assert.equal(resumed.type, 'welcome');
        assert.equal(resumed.resumed, true);
        assert.equal(resumed.id, teleportStates[0]!.players[2].id);
        const resumedState = await resumedClient.waitFor(e => e.type === 'state' && e.state.phase === 'playing' && e.state.players[2].connected);
        assert.equal(resumedState.type, 'state');
        const restoredHost = await host.waitFor(e => e.type === 'state' && JSON.stringify(e.state) === JSON.stringify(resumedState.state));
        assert.deepEqual(restoredHost, resumedState);
        resumedClient.close();
      }
      clients.forEach(client => client.close());
    }
    // Pending random equipment stays private, resolves once, and is identical for 2–4 peers.
    for (const count of [2, 3, 4]) {
      const peers = Array.from({ length: count }, () => new Client());
      await Promise.all(peers.map(peer => peer.open()));
      peers[0].send({ type: 'create', name: 'Wind Host', mobile: 'gale' });
      const welcome = await peers[0].waitFor(e => e.type === 'welcome');
      assert.equal(welcome.type, 'welcome');
      for (const peer of peers.slice(1)) {
        peer.send({ type: 'join', code: welcome.code, name: 'Wind Guest', mobile: 'tempest' });
        await peer.waitFor(e => e.type === 'welcome');
      }
      for (const peer of peers) {
        for (const slot of ['hat', 'armor', 'flag']) peer.send({ type: 'random-equipment', slot });
        const pending = await peer.waitFor(e => e.type === 'state' && e.state.players.some(p => p.randomEquipment.hat && p.randomEquipment.armor && p.randomEquipment.flag));
        assert.equal(pending.type, 'state');
        const self = pending.state.players.find(p => p.randomEquipment.flag)!;
        assert.deepEqual(self.equipment, { hat: null, armor: null, flag: null });
        assert.ok(pending.state.players.filter(p => p.id !== self.id).every(p => !Object.values(p.randomEquipment).some(Boolean)));
      }
      peers[1].send({ type: 'equip', slot: 'flag', set: 'defense' });
      await peers[1].waitFor(e => e.type === 'state' && e.state.players[1].equipment.flag === 'defense' && !e.state.players[1].randomEquipment.flag);
      peers[0].send({ type: 'random-equipment', slot: 'invalid' });
      await peers[0].waitFor(e => e.type === 'error' && /ช่อง/.test(e.message));
      peers[0].send({ type: 'equip', slot: 'hat', set: 'gold' });
      await peers[0].waitFor(e => e.type === 'error' && /ไม่ถูกต้อง/.test(e.message));
      for (const peer of peers.slice(1)) peer.send({ type: 'lobby-ready', ready: true });
      const locked = await peers[0].waitFor(e => e.type === 'state' && e.state.lobbyReady.length === count - 1);
      assert.equal(locked.type, 'state');
      assert.deepEqual(locked.state.players[1].equipment, { hat: null, armor: null, flag: null });
      peers[1].send({ type: 'random-equipment', slot: 'flag' });
      await peers[1].waitFor(e => e.type === 'error' && /ยกเลิกพร้อม/.test(e.message));
      peers[0].send({ type: 'start' });
      const resolved = await Promise.all(peers.map(peer => peer.waitFor(e => e.type === 'state' && e.state.phase === 'playing')));
      assert.deepEqual(resolved, Array(count).fill(resolved[0]));
      assert.equal(resolved[0].type, 'state');
      assert.equal(resolved[0].state.players[0].mobile, 'gale');
      assert.equal(resolved[0].state.players[1].mobile, 'tempest');
      assert.equal(resolved[0].state.players[1].equipment.flag, 'defense');
      for (const player of resolved[0].state.players) {
        assert.ok(Object.values(player.equipment).every(set => set !== null && (set === 'gold' || EQUIPMENT_SETS.includes(set))));
        assert.equal(player.hp, maxHpFor(player));
      }
      peers[0].send({ type: 'random-equipment', slot: 'hat' });
      await peers[0].waitFor(e => e.type === 'error' && /ห้องเตรียมเกม/.test(e.message));
      peers.forEach(peer => peer.close());
    }
    // Verify the extra turn and subsequent handoff are identical for every peer.
    for (const count of [2, 3, 4]) {
      const peers = Array.from({ length: count }, () => new Client());
      await Promise.all(peers.map(peer => peer.open()));
      peers[0].send({ type: 'create', name: 'Double Host' });
      const welcome = await peers[0].waitFor(e => e.type === 'welcome');
      assert.equal(welcome.type, 'welcome');
      for (const peer of peers.slice(1)) {
        peer.send({ type: 'join', code: welcome.code, name: 'Ready Guest' });
        await peer.waitFor(e => e.type === 'welcome');
      }
      for (const peer of peers.slice(1)) peer.send({ type: 'lobby-ready', ready: true });
      await peers[0].waitFor(e => e.type === 'state' && e.state.lobbyReady.length === count - 1);
      peers[0].send({ type: 'start' });
      await Promise.all(peers.map(peer => peer.waitFor(e => e.type === 'state' && e.state.phase === 'playing')));
      peers[0].send({ type: 'item', item: 'double-play' });
      await Promise.all(peers.map(peer => peer.waitFor(e => e.type === 'item-used' && e.item === 'double-play')));
      peers[0].send({ type: 'item', item: 'repair' });
      const extra = await Promise.all(peers.map(peer => peer.waitFor(e => e.type === 'state' && e.state.turn === 2)));
      assert.deepEqual(extra, Array(count).fill(extra[0]));
      assert.equal(extra[0].type, 'state');
      assert.equal(extra[0].state.activeId, welcome.id);
      assert.equal(extra[0].state.players[0].items['double-play'], 0);
      assert.equal(extra[0].state.players[0].extraTurnArmed, false);
      peers[0].send({ type: 'fire', angle: 80, power: 5 });
      const next = await Promise.all(peers.map(peer => peer.waitFor(e => e.type === 'state' && e.state.turn === 3)));
      assert.deepEqual(next, Array(count).fill(next[0]));
      assert.equal(next[0].type, 'state');
      assert.equal(next[0].state.activeId, next[0].state.players[1].id);
      peers.forEach(peer => peer.close());
    }
    const botHost = new Client();
    const lateGuest = new Client();
    await Promise.all([botHost.open(), lateGuest.open()]);
    botHost.send({ type: 'create', name: 'Bot Host' });
    const botWelcome = await botHost.waitFor(e => e.type === 'welcome');
    assert.equal(botWelcome.type, 'welcome');
    botHost.send({ type: 'add-bot' });
    botHost.send({ type: 'set-bot-difficulty', difficulty: 'hard' });
    const botLobby = await botHost.waitFor(e => e.type === 'state' && e.state.players.length === 2 && e.state.botDifficulty === 'hard');
    assert.equal(botLobby.type, 'state');
    assert.equal(botLobby.state.players[1].isBot, true);
    assert.equal(botLobby.state.players[1].mobile, 'loom');
    assert.equal(botLobby.state.players[1].randomUsed, true);
    lateGuest.send({ type: 'join', code: botWelcome.code, name: 'Late Guest' });
    const guestWelcome = await lateGuest.waitFor(e => e.type === 'welcome');
    assert.equal(guestWelcome.type, 'welcome');
    const replaced = await botHost.waitFor(e => e.type === 'state' && e.state.players[1]?.id === guestWelcome.id);
    assert.equal(replaced.type, 'state');
    assert.equal(replaced.state.players[1].isBot, false);
    botHost.send({ type: 'add-bot' });
    await botHost.waitFor(e => e.type === 'state' && e.state.players.length === 3 && e.state.players[2].isBot);
    botHost.send({ type: 'set-mode', mode: 'teams' });
    botHost.send({ type: 'add-bot' });
    await botHost.waitFor(e => e.type === 'state' && e.state.players.length === 4 && e.state.mode === 'teams');
    botHost.send({ type: 'set-team', team: 1 });
    const swappedBots = await botHost.waitFor(e => e.type === 'state' && e.state.players[0].team === 1);
    assert.equal(swappedBots.type, 'state');
    assert.deepEqual(swappedBots.state.players.map(player => player.team), [1, 1, 0, 0]);
    botHost.send({ type: 'set-team', team: 0 });
    await botHost.waitFor(e => e.type === 'state' && e.state.players[0].team === 0);
    lateGuest.send({ type: 'lobby-ready', ready: true });
    await botHost.waitFor(e => e.type === 'state' && e.state.lobbyReady.includes(guestWelcome.id));
    lateGuest.send({ type: 'set-team', team: 0 });
    await lateGuest.waitFor(e => e.type === 'error' && /ยกเลิกพร้อม/.test(e.message));
    botHost.send({ type: 'start' });
    const teamBattle = await botHost.waitFor(e => e.type === 'state' && e.state.phase === 'playing');
    assert.equal(teamBattle.type, 'state');
    assert.deepEqual(teamBattle.state.players.map(player => player.team), [0, 1, 0, 1]);
    for (const bot of teamBattle.state.players.filter(player => player.isBot)) {
      assert.equal(bot.randomUsed, true);
      assert.deepEqual(bot.randomEquipment, { hat: true, armor: true, flag: true });
      assert.ok(Object.values(bot.equipment).every(set => set !== null && (set === 'gold' || EQUIPMENT_SETS.includes(set))));
      assert.equal(bot.hp, maxHpFor(bot));
    }
    botHost.send({ type: 'fire', angle: 45, power: 50 });
    const botTurn = await botHost.waitFor(e => e.type === 'state' && e.state.turn === 2);
    assert.equal(botTurn.type, 'state');
    assert.equal(botTurn.state.activeId, guestWelcome.id);
    lateGuest.send({ type: 'fire', angle: 45, power: 50 });
    const aiTurn = await botHost.waitFor(e => e.type === 'state' && e.state.turn === 3);
    assert.equal(aiTurn.type, 'state');
    const aiShot = await botHost.waitFor(e => e.type === 'shot' && e.shot.shooterId === aiTurn.state.activeId);
    assert.equal(aiShot.type, 'shot');
    await botHost.waitFor(e => e.type === 'state' && e.state.turn >= 4);
    botHost.close(); lateGuest.close();
    const trainee = new Client();
    const visitor = new Client();
    await Promise.all([trainee.open(), visitor.open()]);
    trainee.send({ type: 'practice', name: 'Trainee', mobile: 'halo' });
    const practiceWelcome = await trainee.waitFor(e => e.type === 'welcome');
    assert.equal(practiceWelcome.type, 'welcome');
    const practiceState = await trainee.waitFor(e => e.type === 'state' && e.state.mode === 'practice');
    assert.equal(practiceState.type, 'state');
    assert.equal(practiceState.state.phase, 'playing');
    assert.equal(practiceState.state.players[0].mobile, 'halo');
    assert.equal(practiceState.state.deadline, 0);
    visitor.send({ type: 'join', code: practiceWelcome.code, name: 'Visitor' });
    await visitor.waitFor(e => e.type === 'error' && /ไม่พบห้อง/.test(e.message));
    trainee.send({ type: 'fire', angle: 45, power: 50 });
    const practiceShot = await trainee.waitFor(e => e.type === 'shot');
    assert.equal(practiceShot.type, 'shot');
    assert.equal(practiceShot.shot.kind, 'damage');
    await trainee.waitFor(e => e.type === 'state' && e.state.turn === 2 && e.state.activeId === practiceWelcome.id);
    trainee.send({ type: 'fire', angle: 45, power: 50 });
    await trainee.waitFor(e => e.type === 'state' && e.state.turn === 3 && e.state.activeId === practiceWelcome.id);
    trainee.send({ type: 'reset-practice' });
    await trainee.waitFor(e => e.type === 'state' && e.state.turn === 1 && e.state.mode === 'practice');
    trainee.send({ type: 'practice-mobile', mobile: 'aegis' });
    const selected = await trainee.waitFor(e => e.type === 'state' && e.state.players[0].mobile === 'aegis');
    assert.equal(selected.type, 'state');
    assert.equal(selected.state.players[0].hp, 150);
    assert.equal(selected.state.deadline, 0);
    trainee.send({ type: 'practice-mobile', mobile: 'invalid' });
    await trainee.waitFor(e => e.type === 'error' && /Mobile/.test(e.message));
    trainee.close(); visitor.close();
  } finally {
    child.kill();
  }
});

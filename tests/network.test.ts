import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import WebSocket from 'ws';
import type { ServerEvent } from '../shared/game.ts';
import { fireTeleport } from '../shared/game.ts';

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
      if (count === 4) {
        host.send({ type: 'set-mode', mode: 'teams' });
        await host.waitFor(e => e.type === 'state' && e.state.mode === 'teams');
      }
      host.send({ type: 'start' });
      const states = await Promise.all(clients.map(client => client.waitFor(e => e.type === 'state' && e.state.phase === 'playing')));
      for (const event of states) {
        assert.equal(event.type, 'state');
        assert.equal(event.state.players.length, count);
        assert.equal(event.state.activeId, welcome.id);
        assert.equal(event.state.mode, count === 4 ? 'teams' : 'ffa');
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
      host.send({ type: 'fire', angle: 45, power: 65 });
      const damageShots = await Promise.all(clients.map(client => client.waitFor(e => e.type === 'shot')));
      assert.deepEqual(damageShots, Array(count).fill(damageShots[0]));
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
  } finally {
    child.kill();
  }
});

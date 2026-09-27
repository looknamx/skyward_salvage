import Phaser from 'phaser';
import { groundAt, HEIGHT, random, STEP, vehicleTilt, WIDTH } from '../shared/game.ts';
import type { GameState, MobileKind, ShotResult } from '../shared/game.ts';

const backgrounds = {
  'cloud-reef': '/assets/environment/cloud-reef.png',
  'clockwork-orchard': '/assets/environment/clockwork-orchard.png',
  'glass-dunes': '/assets/environment/glass-dunes.png',
};
const kinds: MobileKind[] = ['loom', 'manta', 'borer', 'vesper', 'bramble'];
const surfaceColors = {
  'cloud-reef': { shadow: '#173c50', rim: '#7dc8c6', grass: '#f1eee0', flower: '#ef8d78', water: '#a4e8ed' },
  'clockwork-orchard': { shadow: '#493645', rim: '#cc9c67', grass: '#f6dfad', flower: '#f3a36c', water: '#b5e4ed' },
  'glass-dunes': { shadow: '#18274d', rim: '#629eb5', grass: '#c6f4f1', flower: '#a592f0', water: '#8ce9fa' },
};

function underside(state: GameState, x: number): number {
  return groundAt(state.terrain, x) + 173 + 23 * Math.sin(x / 85 + state.seed * 0.001) + 13 * Math.sin(x / 39);
}

export class GameScene extends Phaser.Scene {
  private state: GameState | null = null;
  private pendingState: GameState | null = null;
  private playerId = '';
  private backdrop!: Phaser.GameObjects.Image;
  private terrainImage!: Phaser.GameObjects.Image;
  private terrainCanvas!: HTMLCanvasElement;
  private terrainTexture!: Phaser.Textures.CanvasTexture;
  private terrainKey = '';
  private effects!: Phaser.GameObjects.Graphics;
  private mobiles = new Map<string, Phaser.GameObjects.Image>();
  private labels = new Map<string, Phaser.GameObjects.Text>();
  private drops = new Map<string, { image: Phaser.GameObjects.Image; started: number }>();
  private effect: { data: ShotResult; started: number } | null = null;

  constructor() { super('battle'); }

  preload(): void {
    for (const [key, url] of Object.entries(backgrounds)) {
      this.load.image(key, url);
      this.load.image(`${key}-rock`, `/assets/terrain/${key}-rock.png`);
    }
    for (const kind of kinds) this.load.image(`mobile-${kind}`, `/assets/characters/${kind}.png`);
    for (const item of ['double', 'repair', 'teleport']) this.load.image(`drop-${item}`, `/assets/ui/${item}.png`);
  }

  create(): void {
    this.backdrop = this.add.image(0, 0, 'cloud-reef').setOrigin(0).setDisplaySize(WIDTH, HEIGHT);
    this.terrainCanvas = document.createElement('canvas');
    this.terrainCanvas.width = WIDTH;
    this.terrainCanvas.height = HEIGHT;
    this.terrainTexture = this.textures.addCanvas('terrain-dynamic', this.terrainCanvas)!;
    this.terrainImage = this.add.image(0, 0, 'terrain-dynamic').setOrigin(0);
    this.effects = this.add.graphics();
    if (this.state) this.applyState(this.state);
  }

  setSnapshot(state: GameState, playerId: string): void {
    this.playerId = playerId;
    if (this.effect && this.time.now - this.effect.started < 820 && this.state?.phase === 'playing') {
      this.pendingState = state;
      return;
    }
    this.applyState(state);
  }

  private applyState(state: GameState): void {
    this.state = state;
    if (!this.backdrop) return;
    if (this.backdrop.texture.key !== state.map) this.backdrop.setTexture(state.map);
    const key = `${state.seed}:${state.map}:${state.terrain.join(',')}`;
    if (state.terrain.length && key !== this.terrainKey) {
      this.terrainKey = key;
      this.paintTerrain(state);
    }
  }

  showShot(shot: ShotResult): void {
    this.effect = { data: shot, started: this.time.now };
    this.pendingState = null;
  }

  update(): void {
    if (!this.effects) return;
    this.effects.clear();
    if (this.effect && this.pendingState && this.time.now - this.effect.started >= 820) {
      this.applyState(this.pendingState);
      this.pendingState = null;
    }
    if (!this.state || this.state.phase === 'lobby' || !this.state.terrain.length) return;
    this.renderMobiles();
    this.renderDrops();
    this.renderShot();
  }

  private renderDrops(): void {
    const state = this.state!;
    const current = new Set(state.drops.map(drop => drop.id));
    for (const [id, entry] of this.drops) {
      if (current.has(id)) continue;
      this.tweens.killTweensOf(entry.image);
      entry.image.destroy();
      this.drops.delete(id);
    }
    for (const drop of state.drops) {
      let entry = this.drops.get(drop.id);
      if (!entry) {
        const image = this.add.image(drop.x, -40, `drop-${drop.item}`).setDisplaySize(46, 46).setDepth(9);
        entry = { image, started: this.time.now };
        this.drops.set(drop.id, entry);
        this.tweens.add({ targets: image, y: drop.y, duration: 950, ease: 'Quad.easeIn' });
      } else if (this.time.now - entry.started >= 950) entry.image.setPosition(drop.x, drop.y);
      const pulse = 0.55 + 0.25 * Math.sin(this.time.now / 180);
      this.effects.lineStyle(2, 0xffdc91, pulse);
      this.effects.strokeCircle(drop.x, entry.image.y, 23);
    }
  }

  private paintTerrain(state: GameState): void {
    const ctx = this.terrainCanvas.getContext('2d')!;
    const colors = surfaceColors[state.map];
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(0, state.terrain[0]);
    state.terrain.forEach((y, i) => ctx.lineTo(i * STEP, y));
    for (let i = state.terrain.length - 1; i >= 0; i--) ctx.lineTo(i * STEP, underside(state, i * STEP));
    ctx.closePath();
    ctx.clip();
    const rock = this.textures.get(`${state.map}-rock`).getSourceImage() as HTMLImageElement;
    ctx.drawImage(rock, 0, 0, WIDTH, HEIGHT);
    const shade = ctx.createLinearGradient(0, 360, 0, HEIGHT);
    shade.addColorStop(0, 'rgba(12,26,48,0.03)');
    shade.addColorStop(1, 'rgba(7,17,38,0.55)');
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.restore();

    const topPath = () => {
      ctx.beginPath();
      ctx.moveTo(0, state.terrain[0]);
      state.terrain.forEach((y, i) => ctx.lineTo(i * STEP, y));
    };
    const bottomPath = () => {
      ctx.beginPath();
      ctx.moveTo(0, underside(state, 0));
      state.terrain.forEach((_, i) => ctx.lineTo(i * STEP, underside(state, i * STEP)));
    };
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    bottomPath(); ctx.strokeStyle = colors.shadow; ctx.lineWidth = 10; ctx.stroke();
    topPath(); ctx.strokeStyle = colors.shadow; ctx.lineWidth = 22; ctx.stroke();
    topPath(); ctx.strokeStyle = colors.rim; ctx.lineWidth = 13; ctx.stroke();
    topPath(); ctx.strokeStyle = colors.grass; ctx.lineWidth = 7; ctx.stroke();
    topPath(); ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 2; ctx.stroke();

    const next = random(state.seed ^ 0xa4739b31);
    for (let i = 0; i < 95; i++) {
      const x = 28 + next() * (WIDTH - 56);
      const y = groundAt(state.terrain, x) - 5;
      const height = 3 + next() * 7;
      ctx.strokeStyle = i % 7 === 0 ? colors.flower : colors.rim;
      ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 3, y - height); ctx.moveTo(x, y); ctx.lineTo(x + 3, y - height * .8); ctx.stroke();
      if (i % 7 === 0) {
        ctx.fillStyle = colors.flower;
        ctx.beginPath(); ctx.arc(x - 3, y - height, 2.5, 0, Math.PI * 2); ctx.fill();
      }
    }
    for (const x of [365, 925]) this.paintWaterfall(ctx, state, x, colors.water);
    for (let i = 0; i < 8; i++) {
      const x = 70 + i * 160 + next() * 40;
      this.paintCoral(ctx, x, groundAt(state.terrain, x) - 3, colors.flower, 13 + next() * 13);
    }
    this.terrainTexture.refresh();
  }

  private paintWaterfall(ctx: CanvasRenderingContext2D, state: GameState, x: number, color: string): void {
    const y = groundAt(state.terrain, x);
    const end = Math.min(HEIGHT + 40, underside(state, x) + 46);
    const gradient = ctx.createLinearGradient(x - 7, y, x + 8, y);
    gradient.addColorStop(0, 'rgba(119,220,242,0)');
    gradient.addColorStop(.35, 'rgba(175,241,252,0.68)');
    gradient.addColorStop(.72, 'rgba(88,187,225,0.55)');
    gradient.addColorStop(1, 'rgba(119,220,242,0)');
    ctx.fillStyle = gradient;
    ctx.beginPath(); ctx.moveTo(x - 8, y + 4); ctx.lineTo(x + 8, y + 4);
    ctx.lineTo(x + 11, end); ctx.lineTo(x - 11, end); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = color; ctx.globalAlpha = .78; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x - 2, y + 5); ctx.bezierCurveTo(x + 1, y + 60, x - 1, end - 40, x + 2, end); ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(220,250,255,0.34)'; ctx.beginPath(); ctx.ellipse(x, end - 2, 18, 5, 0, 0, Math.PI * 2); ctx.fill();
  }

  private paintCoral(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, size: number): void {
    ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - size);
    ctx.moveTo(x, y - size * .42); ctx.lineTo(x - size * .36, y - size * .72);
    ctx.moveTo(x, y - size * .6); ctx.lineTo(x + size * .34, y - size * .91);
    ctx.stroke();
    ctx.fillStyle = color;
    for (const [px, py] of [[x, y - size], [x - size * .36, y - size * .72], [x + size * .34, y - size * .91]]) {
      ctx.beginPath(); ctx.arc(px, py, 2.4, 0, Math.PI * 2); ctx.fill();
    }
  }

  private renderMobiles(): void {
    const state = this.state!;
    const living = new Set(state.players.filter(p => p.hp > 0).map(p => p.id));
    for (const [id, image] of this.mobiles) {
      if (!living.has(id)) { image.destroy(); this.mobiles.delete(id); this.labels.get(id)?.destroy(); this.labels.delete(id); }
    }
    for (const player of state.players) {
      if (player.hp <= 0) continue;
      let image = this.mobiles.get(player.id);
      let label = this.labels.get(player.id);
      if (!image) {
        image = this.add.image(player.x, player.y - 28, `mobile-${player.mobile}`).setDisplaySize(112, 112);
        image.setDepth(10);
        this.mobiles.set(player.id, image);
        label = this.add.text(player.x, player.y - 84, player.name, {
          fontFamily: 'Kanit, sans-serif', fontSize: '13px', fontStyle: 'bold', color: '#fff7dc',
          stroke: '#12233e', strokeThickness: 4,
        }).setOrigin(.5).setDepth(11);
        this.labels.set(player.id, label);
      }
      if (image.texture.key !== `mobile-${player.mobile}`) image.setTexture(`mobile-${player.mobile}`).setDisplaySize(112, 112);
      const targetY = player.y - 28;
      const jump = Math.abs(player.x - image.x) > 140 || Math.abs(targetY - image.y) > 100;
      image.x = jump ? player.x : Phaser.Math.Linear(image.x, player.x, .38);
      image.y = jump ? targetY : Phaser.Math.Linear(image.y, targetY, .38);
      image.setFlipX(player.facing < 0);
      const tilt = vehicleTilt(state.terrain, player.x);
      image.rotation = jump ? tilt : Phaser.Math.Linear(image.rotation, tilt, .38);
      if (label) {
        label.setText(player.name);
        label.setPosition(image.x, image.y - 53);
        label.setColor(player.id === state.activeId ? '#ffe0a0' : '#fff7dc');
      }
      if (player.id === state.activeId) {
        this.effects.lineStyle(2, 0xffd58d, .95);
        this.effects.strokeEllipse(image.x, player.y + 11, 85, 15);
        this.effects.fillStyle(0xffd58d, .92);
        this.effects.fillTriangle(image.x - 5, image.y - 58, image.x + 5, image.y - 58, image.x, image.y - 49);
      }
    }
  }

  private renderShot(): void {
    if (!this.effect) return;
    const elapsed = this.time.now - this.effect.started;
    if (elapsed > 1360) { this.effect = null; return; }
    const g = this.effects;
    const teleport = this.effect.data.kind === 'teleport';
    const special = !!this.effect.data.special;
    if (elapsed < 820) {
      const fraction = elapsed / 820;
      for (const path of this.effect.data.paths) {
        if (!path.length) continue;
        const index = Math.min(path.length - 1, Math.floor(fraction * (path.length - 1)));
        const p = path[index];
        g.fillStyle(teleport ? 0x9d71ef : special ? 0x53e5d3 : 0xffd280, .25); g.fillCircle(p.x, p.y, 15);
        g.fillStyle(teleport ? 0xc6a2ff : special ? 0xbaffef : 0xfff1b7, 1); g.fillCircle(p.x, p.y, 5);
      }
    } else {
      const expansion = Math.min(1, (elapsed - 820) / 540);
      for (const impact of this.effect.data.impacts) {
        g.lineStyle(4 * (1 - expansion), teleport ? 0xb887ff : special ? 0x76f5dc : 0xffe0a0, 1 - expansion);
        g.strokeCircle(impact.x, impact.y, impact.radius * expansion);
      }
    }
  }
}

import Phaser from 'phaser';
import { groundAt, hasGroundAt, HEIGHT, MOBILE_INFO, random, STEP, vehicleTilt, WIDTH } from '../shared/game.ts';
import type { EquipmentSlot, GameState, MeteorEvent, MobileKind, ShotResult } from '../shared/game.ts';
import { drawDeath, drawImpact, drawProjectile, drawWeatherImpact } from './BattleEffects.ts';
import { WeatherEffects } from './WeatherEffects.ts';

export const MAP_BACKGROUNDS = {
  'cloud-reef': '/assets/environment/cloud-reef.png',
  'clockwork-orchard': '/assets/environment/clockwork-orchard.png',
  'glass-dunes': '/assets/environment/glass-dunes.png',
};
const SHOT_TRAVEL_MS = 820;
const SHOT_EFFECT_MS = 1360;
const METEOR_EFFECT_MS = 1150;
const kinds = Object.keys(MOBILE_INFO) as MobileKind[];
const gearSlots: EquipmentSlot[] = ['hat', 'armor', 'flag'];
const surfaceColors = {
  'cloud-reef': { shadow: '#173c50', rim: '#7dc8c6', grass: '#f1eee0', flower: '#ef8d78', water: '#a4e8ed' },
  'clockwork-orchard': { shadow: '#493645', rim: '#cc9c67', grass: '#f6dfad', flower: '#f3a36c', water: '#b5e4ed' },
  'glass-dunes': { shadow: '#18274d', rim: '#629eb5', grass: '#c6f4f1', flower: '#a592f0', water: '#8ce9fa' },
};

function underside(state: GameState, x: number): number {
  return groundAt(state.terrainBottom, x);
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
  private falling = new Set<string>();
  private gear = new Map<string, Partial<Record<EquipmentSlot, Phaser.GameObjects.Image>>>();
  private labels = new Map<string, Phaser.GameObjects.Text>();
  private drops = new Map<string, { image: Phaser.GameObjects.Image; started: number }>();
  private effect: { data: ShotResult; started: number } | null = null;
  private meteorEffect: { data: MeteorEvent; started: number } | null = null;
  private deathEffects: { id: string; mobile: MobileKind; x: number; y: number; fallen: boolean; started: number }[] = [];
  private weather: WeatherEffects | null = null;

  constructor() { super('battle'); }

  preload(): void {
    for (const [key, url] of Object.entries(MAP_BACKGROUNDS)) {
      this.load.image(key, url);
      this.load.image(`${key}-rock`, `/assets/terrain/${key}-rock.png`);
    }
    for (const kind of kinds) this.load.image(`mobile-${kind}`, `/assets/characters/${kind}.png`);
    for (const set of ['attack', 'defense', 'health', 'gold']) for (const slot of gearSlots) this.load.image(`gear-${set}-${slot}`, `/assets/equipment/${set}-${slot}.png`);
    for (const item of ['double', 'repair', 'teleport', 'double-play', 'special']) this.load.image(`drop-${item}`, `/assets/ui/${item}.png`);
  }

  create(): void {
    this.backdrop = this.add.image(0, 0, 'cloud-reef').setOrigin(0).setDisplaySize(WIDTH, HEIGHT);
    this.terrainCanvas = document.createElement('canvas');
    this.terrainCanvas.width = WIDTH;
    this.terrainCanvas.height = HEIGHT;
    this.terrainTexture = this.textures.addCanvas('terrain-dynamic', this.terrainCanvas)!;
    this.terrainImage = this.add.image(0, 0, 'terrain-dynamic').setOrigin(0);
    this.effects = this.add.graphics().setDepth(14);
    this.weather = new WeatherEffects(this);
    if (this.state) this.applyState(this.state);
  }

  setSnapshot(state: GameState, playerId: string): void {
    this.playerId = playerId;
    if (this.effect && this.time.now - this.effect.started < SHOT_TRAVEL_MS && this.state?.phase === 'playing') {
      this.pendingState = state;
      return;
    }
    this.applyState(state);
  }

  private applyState(state: GameState): void {
    const previousMeteorTurn = this.state?.meteor?.turn;
    if (this.state?.phase === 'playing') for (const oldPlayer of this.state.players) {
      const current = state.players.find(player => player.id === oldPlayer.id);
      if (oldPlayer.hp > 0 && current && current.hp <= 0) this.deathEffects.push({
        id: oldPlayer.id, mobile: oldPlayer.mobile, x: oldPlayer.x, y: oldPlayer.y - 28,
        fallen: current.fallen, started: this.time.now,
      });
    }
    this.state = state;
    if (!this.backdrop) return;
    this.weather?.setWeather(state.phase === 'playing' ? state.weather : null);
    if (state.phase === 'lobby') {
      this.effect = null;
      this.meteorEffect = null;
      this.deathEffects = [];
      this.pendingState = null;
      this.terrainImage.setVisible(false);
      for (const image of this.mobiles.values()) { this.tweens.killTweensOf(image); image.destroy(); }
      for (const pieces of this.gear.values()) for (const image of Object.values(pieces)) image?.destroy();
      for (const label of this.labels.values()) label.destroy();
      for (const entry of this.drops.values()) { this.tweens.killTweensOf(entry.image); entry.image.destroy(); }
      this.mobiles.clear();
      this.falling.clear();
      this.gear.clear();
      this.labels.clear();
      this.drops.clear();
      this.terrainKey = '';
      return;
    }
    this.terrainImage.setVisible(true);
    if (state.meteor && state.meteor.turn !== previousMeteorTurn) this.meteorEffect = { data: state.meteor, started: this.time.now };
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

  getPresentationRemainingMs(): number {
    const shotElapsed = this.effect ? this.time.now - this.effect.started : SHOT_EFFECT_MS;
    const meteorElapsed = this.meteorEffect ? this.time.now - this.meteorEffect.started : METEOR_EFFECT_MS;
    const pendingMeteor = this.pendingState?.meteor && this.pendingState.meteor.turn !== this.state?.meteor?.turn;
    const deathRemaining = Math.max(0, ...this.deathEffects.map(effect => 1350 - (this.time.now - effect.started)));
    return Math.max(0, SHOT_EFFECT_MS - shotElapsed, METEOR_EFFECT_MS - meteorElapsed, deathRemaining,
      pendingMeteor ? Math.max(0, SHOT_TRAVEL_MS - shotElapsed) + METEOR_EFFECT_MS : 0);
  }

  update(): void {
    if (!this.effects) return;
    this.effects.clear();
    this.weather?.update();
    if (this.effect && this.pendingState && this.time.now - this.effect.started >= SHOT_TRAVEL_MS) {
      this.applyState(this.pendingState);
      this.pendingState = null;
    }
    if (!this.state || this.state.phase === 'lobby' || !this.state.terrain.length) return;
    this.renderMobiles();
    this.renderDrops();
    this.renderShot();
    this.renderMeteor();
    this.renderDeaths();
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
    // Clip each surviving strip to the fixed underside, leaving real openings
    // where the surface has been drilled through. Trim the edge strips exactly
    // where the interpolated surface meets the bottom.
    const strips: { x1: number; x2: number; t1: number; t2: number; b1: number; b2: number }[] = [];
    for (let i = 0; i < state.terrain.length - 1; i++) {
      const top1 = state.terrain[i], top2 = state.terrain[i + 1];
      const bottom1 = state.terrainBottom[i], bottom2 = state.terrainBottom[i + 1];
      const d1 = bottom1 - top1, d2 = bottom2 - top2;
      if (d1 <= 0 && d2 <= 0) continue;
      const cut = d1 / (d1 - d2);
      const from = d1 > 0 ? 0 : cut, to = d2 > 0 ? 1 : cut;
      const lerp = (a: number, b: number, f: number) => a + (b - a) * f;
      strips.push({x1:(i + from) * STEP, x2:(i + to) * STEP,
        t1:lerp(top1, top2, from), t2:lerp(top1, top2, to),
        b1:lerp(bottom1, bottom2, from), b2:lerp(bottom1, bottom2, to)});
    }
    ctx.save();
    ctx.beginPath();
    for (const s of strips) {
      ctx.moveTo(s.x1, s.t1); ctx.lineTo(s.x2, s.t2);
      ctx.lineTo(s.x2, s.b2); ctx.lineTo(s.x1, s.b1); ctx.closePath();
    }
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
      for (const s of strips) { ctx.moveTo(s.x1, s.t1); ctx.lineTo(s.x2, s.t2); }
    };
    const bottomPath = () => {
      ctx.beginPath();
      for (const s of strips) { ctx.moveTo(s.x1, s.b1); ctx.lineTo(s.x2, s.b2); }
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
      if (!hasGroundAt(state, x)) continue;
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
      if (!hasGroundAt(state, x)) continue;
      this.paintCoral(ctx, x, groundAt(state.terrain, x) - 3, colors.flower, 13 + next() * 13);
    }
    this.terrainTexture.refresh();
  }

  private paintWaterfall(ctx: CanvasRenderingContext2D, state: GameState, x: number, color: string): void {
    if (!hasGroundAt(state, x)) return;
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
      if (!living.has(id)) {
        const player = state.players.find(player => player.id === id);
        if (player?.fallen) {
          if (this.falling.has(id)) continue;
          this.falling.add(id);
          this.labels.get(id)?.setVisible(false);
          const pieces = Object.values(this.gear.get(id) ?? {});
          this.tweens.add({ targets: [image, ...pieces], y: `+=${HEIGHT + 180 - image.y}`,
            rotation: '+=0.6', duration: 750, ease: 'Quad.easeIn', onComplete: () => {
              if (this.mobiles.get(id) !== image) return;
              image.destroy(); this.mobiles.delete(id); this.labels.get(id)?.destroy(); this.labels.delete(id);
              for (const piece of pieces) piece?.destroy();
              this.gear.delete(id); this.falling.delete(id);
            } });
          continue;
        }
        image.destroy(); this.mobiles.delete(id); this.labels.get(id)?.destroy(); this.labels.delete(id);
        for (const piece of Object.values(this.gear.get(id) ?? {})) piece?.destroy();
        this.gear.delete(id);
      }
    }
    for (const player of state.players) {
      if (player.hp <= 0) continue;
      let image = this.mobiles.get(player.id);
      let label = this.labels.get(player.id);
      if (this.falling.delete(player.id)) {
        this.tweens.killTweensOf([image, ...Object.values(this.gear.get(player.id) ?? {})]);
        label?.setVisible(true);
      }
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
      const pieces = this.gear.get(player.id) ?? {};
      this.gear.set(player.id, pieces);
      for (const slot of gearSlots) {
        const set = player.equipment[slot];
        if (!set) { pieces[slot]?.destroy(); delete pieces[slot]; continue; }
        const key = `gear-${set}-${slot}`;
        let piece = pieces[slot];
        if (!piece) {
          piece = this.add.image(0, 0, key).setDepth(slot === 'hat' ? 12 : 11);
          pieces[slot] = piece;
        }
        if (piece.texture.key !== key) piece.setTexture(key);
        const placement = slot === 'hat' ? { x: -7, y: -33, w: 39, h: 39 } : slot === 'armor' ? { x: 0, y: 5, w: 59, h: 42 } : { x: -42, y: -29, w: 48, h: 58 };
        const offsetX = placement.x * player.facing;
        piece.setPosition(image.x + offsetX * Math.cos(image.rotation) - placement.y * Math.sin(image.rotation), image.y + offsetX * Math.sin(image.rotation) + placement.y * Math.cos(image.rotation));
        piece.setDisplaySize(placement.w, placement.h).setRotation(image.rotation).setFlipX(player.facing < 0);
      }
      if (label) {
        label.setText(player.name);
        label.setPosition(image.x, image.y - 53);
        label.setColor(player.id === state.activeId ? '#ffe0a0' : '#fff7dc');
      }
      if (player.wetTurns > 0) {
        this.effects.lineStyle(2, 0x83dfff, .75).strokeEllipse(image.x, image.y + 2, 94, 72);
        for (let i = 0; i < 4; i++) {
          const drift = Math.sin(this.time.now / 200 + i * 2) * 3;
          this.effects.fillStyle(0x89e6ff, .75).fillCircle(image.x - 27 + i * 18 + drift, image.y - 40 + (i % 2) * 12, 2.5);
        }
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
    if (elapsed > SHOT_EFFECT_MS) { this.effect = null; return; }
    const g = this.effects;
    const teleport = this.effect.data.kind === 'teleport';
    const special = !!this.effect.data.special;
    const mobile = this.effect.data.mobile;
    if (elapsed < SHOT_TRAVEL_MS) {
      const fraction = elapsed / SHOT_TRAVEL_MS;
      const longestPath = Math.max(1, ...this.effect.data.paths.map(path => path.length - 1));
      for (const path of this.effect.data.paths) {
        if (!path.length) continue;
        const index = Math.min(path.length - 1, Math.floor(fraction * longestPath));
        const p = path[index];
        const previous = path[Math.max(0, index - 2)];
        if (teleport) {
          g.fillStyle(0x9d71ef, .25).fillCircle(p.x, p.y, 16);
          g.lineStyle(2, 0xc6a2ff, .85).strokeCircle(p.x, p.y, 10);
          g.fillStyle(0xffffff, .9).fillCircle(p.x, p.y, 4);
        } else drawProjectile(g, mobile, special, p.x, p.y, previous.x, previous.y, elapsed);
      }
    } else {
      const expansion = Math.min(1, (elapsed - SHOT_TRAVEL_MS) / (SHOT_EFFECT_MS - SHOT_TRAVEL_MS));
      for (const drop of this.effect.data.destroyedDrops ?? []) {
        g.lineStyle(3 * (1 - expansion), 0xffd277, 1 - expansion).strokeCircle(drop.x, drop.y, 8 + 31 * expansion);
        for (let i = 0; i < 6; i++) {
          const angle = i * Math.PI / 3;
          g.fillStyle(0xffe8ad, 1 - expansion).fillCircle(drop.x + Math.cos(angle) * (9 + 27 * expansion), drop.y + Math.sin(angle) * (9 + 27 * expansion), 3 * (1 - expansion));
        }
      }
      for (const impact of this.effect.data.impacts) {
        if (teleport) g.lineStyle(4 * (1 - expansion), 0xb887ff, 1 - expansion).strokeCircle(impact.x, impact.y, impact.radius * expansion);
        else {
          drawImpact(g, mobile, special, impact.x, impact.y, impact.radius, expansion);
          if (this.effect.data.weatherCharged && this.effect.data.weatherKind) drawWeatherImpact(g, this.effect.data.weatherKind, impact.x, impact.y, expansion);
        }
      }
    }
  }

  private renderDeaths(): void {
    this.deathEffects = this.deathEffects.filter(effect => this.time.now - effect.started < 1350);
    for (const effect of this.deathEffects) drawDeath(this.effects, effect.mobile, effect.x, effect.y,
      Math.max(0, (this.time.now - effect.started) / 1350), effect.fallen);
  }

  private renderMeteor(): void {
    if (!this.meteorEffect) return;
    const elapsed = this.time.now - this.meteorEffect.started;
    if (elapsed > METEOR_EFFECT_MS) { this.meteorEffect = null; return; }
    const { x, y } = this.meteorEffect.data;
    if (elapsed < 650) {
      const progress = elapsed / 650;
      const ballY = -70 + (y + 70) * progress * progress;
      this.effects.lineStyle(7, 0xff8b48, .8);
      this.effects.lineBetween(x - 50, ballY - 80, x, ballY);
      this.effects.fillStyle(0xffd786, 1); this.effects.fillCircle(x, ballY, 12);
      this.effects.fillStyle(0xff6b3f, .9); this.effects.fillCircle(x, ballY, 7);
    } else {
      const progress = (elapsed - 650) / 500;
      this.effects.lineStyle(5 * (1 - progress), 0xffaf66, 1 - progress);
      this.effects.strokeCircle(x, y, 91 * progress);
      this.effects.fillStyle(0xffd28b, .35 * (1 - progress));
      this.effects.fillCircle(x, y, 27 + 26 * progress);
    }
  }
}

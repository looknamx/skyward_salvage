import type Phaser from 'phaser';
import type { MobileKind } from '../shared/game.ts';
import type { WeatherKind } from '../shared/game.ts';

type Palette = { glow: number; core: number; accent: number };
const colors: Record<MobileKind, Palette> = {
  loom: { glow: 0xff7a58, core: 0xffe2a0, accent: 0xff665b },
  manta: { glow: 0x3edacc, core: 0xd9fff5, accent: 0x38a7a8 },
  borer: { glow: 0xf4a544, core: 0xffe29b, accent: 0xa44f23 },
  vesper: { glow: 0x9b75f5, core: 0xf2dcff, accent: 0x7155d5 },
  bramble: { glow: 0x71ca62, core: 0xe7ffac, accent: 0x348d55 },
  halo: { glow: 0x70d9f7, core: 0xffffff, accent: 0x2e94e0 },
  kestrel: { glow: 0x63d7bd, core: 0xfcf1d0, accent: 0x3b9a9c },
  cinder: { glow: 0xff653c, core: 0xffe29a, accent: 0xae321f },
  aegis: { glow: 0x78ddff, core: 0xffffff, accent: 0xffd46b },
  gale: { glow: 0x87ecd6, core: 0xffffff, accent: 0x43bca8 },
  tempest: { glow: 0xaf7dff, core: 0xf8e7ff, accent: 0x6340cb },
};

export function drawProjectile(g: Phaser.GameObjects.Graphics, mobile: MobileKind, special: boolean, x: number, y: number, previousX: number, previousY: number, time: number): void {
  const c = colors[mobile];
  const dx = x - previousX, dy = y - previousY;
  const heading = Math.atan2(dy, dx);
  const size = special ? 10 : 6;
  g.lineStyle(special ? 6 : 3, c.glow, .48).lineBetween(previousX, previousY, x, y);
  g.fillStyle(c.glow, .22).fillCircle(x, y, special ? 22 : 13);
  g.fillStyle(c.core, .92).fillCircle(x, y, size);
  g.lineStyle(special ? 3 : 2, c.accent, .94);
  switch (mobile) {
    case 'loom':
      g.strokeCircle(x, y, size + 2);
      g.lineBetween(x - 7, y - 7, x + 7, y + 7);
      g.lineBetween(x - 7, y + 7, x + 7, y - 7);
      break;
    case 'manta':
    case 'kestrel': {
      const side = mobile === 'manta' ? 9 : 13;
      g.fillStyle(c.accent, .95);
      g.fillTriangle(x - side, y - 3, x + 2, y, x - side, y + 3);
      g.fillTriangle(x - 4, y - side / 2, x + 5, y, x - 4, y + side / 2);
      break;
    }
    case 'borer':
      g.fillStyle(c.accent, .95).fillTriangle(x + size + 10, y, x + 1, y - size, x + 1, y + size);
      g.lineBetween(x - size - 5, y, x + size + 9, y);
      break;
    case 'vesper':
    case 'halo':
      g.lineBetween(x - size - 6, y, x + size + 6, y);
      g.lineBetween(x, y - size - 6, x, y + size + 6);
      if (mobile === 'halo') g.strokeCircle(x, y, size + 5);
      break;
    case 'bramble':
      g.fillStyle(c.accent, 1).fillEllipse(x - size / 2, y - 2, size + 7, size);
      g.lineBetween(x - size, y + size, x + size, y - size);
      break;
    case 'cinder':
      g.fillStyle(c.accent, 1).fillCircle(x - 7, y + 4, 4);
      g.fillStyle(c.core, 1).fillCircle(x + 4, y - 4, 3);
      break;
    case 'aegis':
      for (let n = 0; n < 6; n++) {
        const a = n * Math.PI / 3;
        const b = (n + 1) * Math.PI / 3;
        g.lineBetween(x + Math.cos(a) * (size + 7), y + Math.sin(a) * (size + 7), x + Math.cos(b) * (size + 7), y + Math.sin(b) * (size + 7));
      }
      break;
    case 'gale':
      g.strokeCircle(x + 3, y - 2, size + 4);
      g.lineBetween(x - size - 7, y + 5, x + size + 4, y + 5);
      break;
    case 'tempest':
      g.lineBetween(x - 11, y - 8, x - 3, y + 1);
      g.lineBetween(x - 3, y + 1, x + 2, y - 6);
      g.lineBetween(x + 2, y - 6, x + 11, y + 8);
      break;
  }
  if (special) {
    g.lineStyle(2, c.core, .8).strokeCircle(x, y, 17 + Math.sin(time / 80) * 2);
    for (let i = 0; i < 3; i++) {
      const a = heading + time / 150 + i * Math.PI * 2 / 3;
      const px = x + Math.cos(a) * 17, py = y + Math.sin(a) * 17;
      g.fillStyle(c.accent, .9).fillCircle(px, py, 3);
    }
  }
}

export function drawImpact(g: Phaser.GameObjects.Graphics, mobile: MobileKind, special: boolean, x: number, y: number, radius: number, progress: number): void {
  const c = colors[mobile];
  const fade = 1 - progress;
  const reach = radius * progress;
  g.lineStyle(special ? 7 * fade : 4 * fade, c.glow, fade).strokeCircle(x, y, reach);
  g.fillStyle(c.core, .25 * fade).fillCircle(x, y, 14 + reach * .38);
  const rays = special ? 14 : 6;
  const phase = mobile === 'tempest' ? .28 : mobile === 'gale' ? .8 : 0;
  g.lineStyle(special ? 3.5 * fade : 2 * fade, c.accent, fade);
  for (let i = 0; i < rays; i++) {
    const a = phase + i * Math.PI * 2 / rays;
    g.lineBetween(x + Math.cos(a) * reach * .58, y + Math.sin(a) * reach * .58,
      x + Math.cos(a) * reach * 1.1, y + Math.sin(a) * reach * 1.1);
  }
  if (special) {
    g.lineStyle(3 * fade, c.core, .9 * fade).strokeCircle(x, y, reach * 1.35);
    g.lineStyle(2 * fade, c.accent, .7 * fade).strokeCircle(x, y, reach * .48);
    if (mobile === 'tempest' || mobile === 'vesper') for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + .4;
      g.lineBetween(x + Math.cos(a) * reach * .2, y + Math.sin(a) * reach * .2,
        x + Math.cos(a + .25) * reach * 1.4, y + Math.sin(a + .25) * reach * 1.4);
    }
  }
}

export function drawDeath(g: Phaser.GameObjects.Graphics, mobile: MobileKind, x: number, y: number, progress: number, fallen: boolean): void {
  const c = colors[mobile];
  const fade = 1 - progress;
  g.fillStyle(c.core, .34 * fade).fillCircle(x, y, 18 + 35 * progress);
  g.lineStyle(4 * fade, c.glow, fade).strokeCircle(x, y, 14 + 52 * progress);
  for (let i = 0; i < 16; i++) {
    const a = i * Math.PI / 8 + (i % 3) * .13;
    const reach = (22 + i % 4 * 7) * progress;
    const px = x + Math.cos(a) * reach;
    const py = y + Math.sin(a) * reach + (fallen ? progress * progress * 65 : -progress * 12);
    g.fillStyle(i % 3 === 0 ? c.core : c.glow, fade).fillCircle(px, py, 2 + i % 3);
    g.lineStyle(2 * fade, c.accent, fade).lineBetween(px, py, px + Math.cos(a) * 7, py + Math.sin(a) * 7);
  }
}

export function drawWeatherImpact(g: Phaser.GameObjects.Graphics, kind: WeatherKind, x: number, y: number, progress: number): void {
  const fade = 1 - progress;
  if (kind === 'lightning') {
    g.lineStyle(4 * fade, 0x8be5ff, fade).strokeCircle(x, y, 22 + progress * 32);
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3;
      const outerX = x + Math.cos(a) * (28 + progress * 23);
      const outerY = y + Math.sin(a) * (28 + progress * 23);
      g.lineStyle(3 * fade, 0xffffff, fade).lineBetween(x + Math.cos(a) * 13, y + Math.sin(a) * 13, outerX, outerY);
    }
  } else if (kind === 'rain') {
    g.lineStyle(2 * fade, 0x8ee9ff, fade).strokeCircle(x, y, 15 + progress * 32);
    for (let i = 0; i < 9; i++) {
      const a = i * Math.PI * 2 / 9;
      g.fillStyle(0xa8f1ff, fade).fillCircle(x + Math.cos(a) * (18 + progress * 38), y + Math.sin(a) * (18 + progress * 38), 2);
    }
  } else {
    for (let i = 0; i < 3; i++) {
      const reach = 14 + progress * (28 + i * 9);
      g.lineStyle(2 * fade, 0xd2c4ff, fade).strokeEllipse(x, y, reach * 2, reach * .7);
    }
  }
}

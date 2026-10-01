import Phaser from 'phaser';
import { HEIGHT } from '../shared/game.ts';
import type { WeatherState } from '../shared/game.ts';

// The visual lane uses the same world coordinates as the server's collision band.
export class WeatherEffects {
  private graphics: Phaser.GameObjects.Graphics;
  private weather: WeatherState | null = null;

  constructor(private scene: Phaser.Scene) {
    this.graphics = scene.add.graphics().setDepth(9);
  }

  setWeather(weather: WeatherState | null): void {
    this.weather = weather;
  }

  update(): void {
    const g = this.graphics;
    g.clear();
    const weather = this.weather;
    if (!weather) return;
    const { x, width, kind } = weather;
    const time = this.scene.time.now;
    const left = x - width / 2;
    const color = kind === 'lightning' ? 0x4da8ff : kind === 'storm' ? 0x8b83cf : 0x74d8f0;
    g.fillStyle(color, kind === 'lightning' ? .09 : .12).fillRect(left, 56, width, HEIGHT - 96);
    g.lineStyle(2, color, .42).lineBetween(left, 56, left, HEIGHT - 42).lineBetween(left + width, 56, left + width, HEIGHT - 42);
    if (kind === 'lightning') {
      for (let bolt = 0; bolt < 3; bolt++) {
        const phase = time / (95 + bolt * 13);
        const base = x + (bolt - 1) * 20;
        g.lineStyle(13, 0x1768ff, .20).beginPath();
        for (let y = 56; y <= HEIGHT - 42; y += 25) {
          const px = base + Math.sin(y * .053 + phase + bolt) * 13;
          if (y === 56) g.moveTo(px, y); else g.lineTo(px, y);
        }
        g.strokePath();
        g.lineStyle(3 + bolt % 2, bolt === 1 ? 0xffffff : 0x8de7ff, .66 + Math.sin(time / 80 + bolt) * .18).beginPath();
        for (let y = 56; y <= HEIGHT - 42; y += 25) {
          const px = base + Math.sin(y * .053 + phase + bolt) * 13;
          if (y === 56) g.moveTo(px, y); else g.lineTo(px, y);
        }
        g.strokePath();
      }
    } else {
      const count = kind === 'storm' ? 65 : 48;
      g.lineStyle(kind === 'storm' ? 2 : 1.5, kind === 'storm' ? 0xd1d5ff : 0xb5efff, .54);
      for (let i = 0; i < count; i++) {
        const px = left + ((i * 37) % width);
        const py = 56 + ((i * 111 + time * (kind === 'storm' ? .75 : .48)) % (HEIGHT - 98));
        const lean = kind === 'storm' ? weather.direction * 14 : -3;
        g.lineBetween(px, py, px + lean, py + (kind === 'storm' ? 24 : 17));
      }
      if (kind === 'storm') {
        g.lineStyle(3, 0xd5ccff, .45);
        for (let i = 0; i < 5; i++) {
          const py = 110 + i * 110;
          const drift = (time * .07 + i * 31) % width;
          g.lineBetween(left + drift, py, left + drift + weather.direction * 24, py - 5);
        }
      }
    }
  }

  destroy(): void { this.graphics.destroy(); }
}

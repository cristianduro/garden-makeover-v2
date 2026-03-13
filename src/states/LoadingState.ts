import * as PIXI from 'pixi.js';
import { GameState } from './GameState';
import { Game }      from '../core/Game';

export class LoadingState extends GameState {
  private _container!: PIXI.Container;
  private _bar!:       PIXI.Graphics;
  private _label!:     PIXI.Text;
  private _barMaxW     = 360;

  enter(): void {
    const game = this._game as Game;
    const app  = game.uiManager.app;
    const W    = innerWidth;
    const H    = innerHeight;

    this._container = new PIXI.Container();

    // ── Gradient background (dark green) ──────────────────────
    const bg = new PIXI.Graphics();
    bg.beginFill(0x1a2a1a);
    bg.drawRect(0, 0, W, H);
    bg.endFill();
    this._container.addChild(bg);

    // ── Title ──────────────────────────────────────────────────
    const title = new PIXI.Text('🌱 Garden Makeover', {
      fontFamily: 'Arial, sans-serif',
      fontSize:   Math.min(44, Math.max(26, W * 0.05)),
      fill:       0xffffff,
      dropShadow: true,
      dropShadowColor: 0x3ddc68,
      dropShadowDistance: 0,
      dropShadowBlur: 20,
      dropShadowAlpha: 0.5,
    });
    title.anchor.set(0.5);
    title.x = W / 2;
    title.y = H / 2 - 60;
    this._container.addChild(title);

    // ── Progress bar track ────────────────────────────────────
    this._barMaxW = Math.min(360, W * 0.8);
    const barTrack = new PIXI.Graphics();
    barTrack.beginFill(0xffffff, 0.15);
    barTrack.drawRoundedRect(0, 0, this._barMaxW, 10, 10);
    barTrack.endFill();
    barTrack.x = W / 2 - this._barMaxW / 2;
    barTrack.y = H / 2;
    this._container.addChild(barTrack);

    // ── Progress bar fill ─────────────────────────────────────
    this._bar = new PIXI.Graphics();
    this._bar.x = barTrack.x;
    this._bar.y = barTrack.y;
    this._drawBar(0);
    this._container.addChild(this._bar);

    // ── Label ─────────────────────────────────────────────────
    this._label = new PIXI.Text('Loading assets…', {
      fontFamily: 'Arial, sans-serif',
      fontSize:   14,
      fill:       'rgba(255,255,255,0.6)',
    });
    this._label.anchor.set(0.5, 0);
    this._label.x = W / 2;
    this._label.y = H / 2 + 24;
    this._container.addChild(this._label);

    game.uiManager.overlayLayer.addChild(this._container);
  }

  setProgress(pct: number, msg?: string): void {
    this._drawBar(pct);
    if (msg) this._label.text = msg;
  }

  private _drawBar(pct: number): void {
    const w = Math.max(0, (pct / 100) * this._barMaxW);
    this._bar.clear();
    if (w > 0) {
      this._bar.beginFill(0x3ddc68);
      this._bar.drawRoundedRect(0, 0, w, 10, 10);
      this._bar.endFill();
    }
  }

  exit(): void {
    const app = (this._game as Game).uiManager.app;
    // Fade out
    let t = 0;
    const fn = (dt: number) => {
      t = Math.min(t + dt / 60 / 0.5, 1);
      this._container.alpha = 1 - t;
      if (t >= 1) {
        app.ticker.remove(fn);
        (this._game as Game).uiManager.overlayLayer.removeChild(this._container);
      }
    };
    app.ticker.add(fn);
  }

  update(_dt: number): void {}
}

import * as PIXI from 'pixi.js';
import { GameState } from './GameState';
import { Game }      from '../core/Game';

export class LoadingState extends GameState {
  private container!:     PIXI.Container;
  private progressBar!:   PIXI.Graphics;
  private progressLabel!: PIXI.Text;
  private barMaxWidth     = 360;

  enter(): void {
    const game   = this.game as Game;
    const app    = game.uiManager.app;
    const width  = innerWidth;
    const height = innerHeight;

    this.container = new PIXI.Container();

    const bg = new PIXI.Graphics();
    bg.beginFill(0x1a2a1a);
    bg.drawRect(0, 0, width, height);
    bg.endFill();
    this.container.addChild(bg);

    const title = new PIXI.Text('🌱 Garden Makeover', {
      fontFamily: 'Arial, sans-serif',
      fontSize:   Math.min(44, Math.max(26, width * 0.05)),
      fill:       0xffffff,
      dropShadow: true,
      dropShadowColor: 0x3ddc68,
      dropShadowDistance: 0,
      dropShadowBlur: 20,
      dropShadowAlpha: 0.5,
    });
    title.anchor.set(0.5);
    title.x = width / 2;
    title.y = height / 2 - 60;
    this.container.addChild(title);

    this.barMaxWidth = Math.min(360, width * 0.8);
    const barTrack = new PIXI.Graphics();
    barTrack.beginFill(0xffffff, 0.15);
    barTrack.drawRoundedRect(0, 0, this.barMaxWidth, 10, 10);
    barTrack.endFill();
    barTrack.x = width / 2 - this.barMaxWidth / 2;
    barTrack.y = height / 2;
    this.container.addChild(barTrack);

    this.progressBar = new PIXI.Graphics();
    this.progressBar.x = barTrack.x;
    this.progressBar.y = barTrack.y;
    this.drawBar(0);
    this.container.addChild(this.progressBar);

    this.progressLabel = new PIXI.Text('Loading assets…', {
      fontFamily: 'Arial, sans-serif',
      fontSize:   14,
      fill:       'rgba(255,255,255,0.6)',
    });
    this.progressLabel.anchor.set(0.5, 0);
    this.progressLabel.x = width / 2;
    this.progressLabel.y = height / 2 + 24;
    this.container.addChild(this.progressLabel);

    game.uiManager.overlayLayer.addChild(this.container);
  }

  setProgress(pct: number, msg?: string): void {
    this.drawBar(pct);
    if (msg) this.progressLabel.text = msg;
  }

  private drawBar(pct: number): void {
    const fillWidth = Math.max(0, (pct / 100) * this.barMaxWidth);
    this.progressBar.clear();
    if (fillWidth > 0) {
      this.progressBar.beginFill(0x3ddc68);
      this.progressBar.drawRoundedRect(0, 0, fillWidth, 10, 10);
      this.progressBar.endFill();
    }
  }

  exit(): void {
    const app = (this.game as Game).uiManager.app;
    let animProgress = 0;
    const fn = (dt: number) => {
      animProgress = Math.min(animProgress + dt / 60 / 0.5, 1);
      this.container.alpha = 1 - animProgress;
      if (animProgress >= 1) {
        app.ticker.remove(fn);
        (this.game as Game).uiManager.overlayLayer.removeChild(this.container);
      }
    };
    app.ticker.add(fn);
  }

  update(_dt: number): void {}
}

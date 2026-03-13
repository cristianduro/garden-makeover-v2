import { GameConfig } from '../core/GameConfig';

export class AudioManager {
  private _sounds = new Map<string, HTMLAudioElement>();
  private _theme:  HTMLAudioElement | null = null;
  private _muted = false;

  async init(): Promise<void> {
    const entries = Object.entries(GameConfig.ASSETS.SOUNDS);
    entries.forEach(([k, url]) => {
      const a = new Audio(url);
      a.preload = 'auto';
      if (k === 'theme') { a.loop = true; a.volume = 0.35; this._theme = a; }
      else               { a.volume = 0.6; }
      this._sounds.set(k, a);
    });
  }

  startTheme(): void {
    if (this._muted || !this._theme) return;
    this._theme.play().catch(() => {/* autoplay blocked */});
  }

  play(key: string): void {
    if (this._muted) return;
    const a = this._sounds.get(key);
    if (!a) return;
    a.currentTime = 0;
    a.play().catch(() => {});
  }

  toggleMute(): void {
    this._muted = !this._muted;
    if (this._theme) this._theme.muted = this._muted;
  }

  get muted(): boolean { return this._muted; }
}

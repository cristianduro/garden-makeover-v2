import { GameConfig } from '../core/GameConfig';

export class AudioManager {
  private sounds = new Map<string, HTMLAudioElement>();
  private theme:  HTMLAudioElement | null = null;
  private isMuted = false;

  async init(): Promise<void> {
    const entries = Object.entries(GameConfig.ASSETS.SOUNDS);
    entries.forEach(([k, url]) => {
      const audio = new Audio(url);
      audio.preload = 'auto';
      if (k === 'theme') { audio.loop = true; audio.volume = 0.35; this.theme = audio; }
      else               { audio.volume = 0.6; }
      this.sounds.set(k, audio);
    });
  }

  startTheme(): void {
    if (this.isMuted || !this.theme) return;
    this.theme.play().catch(() => {});
  }

  play(key: string): void {
    if (this.isMuted) return;
    const audio = this.sounds.get(key);
    if (!audio) return;
    audio.currentTime = 0;
    audio.play().catch(() => {});
  }

  toggleMute(): void {
    this.isMuted = !this.isMuted;
    if (this.theme) this.theme.muted = this.isMuted;
  }

  get muted(): boolean { return this.isMuted; }
}

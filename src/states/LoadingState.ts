import { GameState } from './GameState';
import { Game }      from '../core/Game';

export class LoadingState extends GameState {
  private _overlay!: HTMLElement;
  private _bar!:     HTMLElement;
  private _label!:   HTMLElement;

  enter(): void {
    this._overlay = document.createElement('div');
    Object.assign(this._overlay.style, {
      position:   'absolute', inset: '0',
      background: 'linear-gradient(135deg,#1a2a1a,#2a3a1a)',
      display:    'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      zIndex:     '100', gap: '20px',
    });

    const title = document.createElement('div');
    title.textContent = '🌱 Garden Makeover';
    Object.assign(title.style, {
      color:      '#fff', fontSize: 'clamp(26px,5vw,44px)',
      fontFamily: "'Fredoka One', cursive",
      textShadow: '0 4px 20px rgba(61,220,104,0.5)',
    });

    const barWrap = document.createElement('div');
    Object.assign(barWrap.style, {
      width: 'min(360px,80vw)', height: '10px',
      background: 'rgba(255,255,255,0.15)', borderRadius: '10px', overflow: 'hidden',
    });
    this._bar = document.createElement('div');
    Object.assign(this._bar.style, {
      height: '100%', width: '0%', borderRadius: '10px',
      background: 'linear-gradient(90deg,#3ddc68,#a0e080)',
      transition: 'width 0.3s ease',
    });
    barWrap.appendChild(this._bar);

    this._label = document.createElement('div');
    Object.assign(this._label.style, {
      color: 'rgba(255,255,255,0.6)', fontSize: '14px', fontFamily: 'Nunito, sans-serif',
    });
    this._label.textContent = 'Loading assets…';

    this._overlay.append(title, barWrap, this._label);
    (this._game as Game).container.appendChild(this._overlay);
  }

  setProgress(pct: number, msg?: string): void {
    this._bar.style.width  = `${pct}%`;
    if (msg) this._label.textContent = msg;
  }

  exit(): void {
    this._overlay.style.transition = 'opacity 0.5s';
    this._overlay.style.opacity    = '0';
    setTimeout(() => this._overlay.remove(), 500);
  }

  update(_dt: number): void {}
}

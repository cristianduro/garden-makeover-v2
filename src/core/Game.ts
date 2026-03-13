import { SceneManager }  from '../managers/SceneManager';
import { AssetManager }  from '../managers/AssetManager';
import { AudioManager }  from '../managers/AudioManager';
import { UIManager }     from '../managers/UIManager';
import { LoadingState }  from '../states/LoadingState';
import { TutorialState } from '../states/TutorialState';
import { PlayState }     from '../states/PlayState';
import { GameState }     from '../states/GameState';

export class Game {
  readonly sceneManager = new SceneManager();
  readonly assetManager = new AssetManager();
  readonly audioManager = new AudioManager();
  readonly uiManager    = new UIManager();

  readonly container: HTMLElement;

  private _states:  Map<string, GameState>;
  private _current: GameState | null = null;
  private _lastTime = 0;
  private _raf = 0;

  readonly stateMachine = {
    transition: (name: string) => this._transition(name),
  };

  constructor(container: HTMLElement) {
    this.container = container;
    this._states = new Map<string, GameState>([
      ['loading',  new LoadingState(this)],
      ['tutorial', new TutorialState(this)],
      ['play',     new PlayState(this)],
    ]);
  }

  async start(): Promise<void> {
    // Setup container
    Object.assign(this.container.style, {
      position: 'relative', overflow: 'hidden',
      width: '100%', height: '100%',
      userSelect: 'none', touchAction: 'none',
    });

    await this.sceneManager.init(this.container);
    await this.audioManager.init();
    await this.uiManager.init(this.container);

    // Start loading
    this._transition('loading');
    const loading = this._states.get('loading') as LoadingState;

    try {
      await this.assetManager.loadAll((pct) => {
        loading.setProgress(pct, `Loading… ${Math.round(pct)}%`);
      });
      loading.setProgress(100, 'Ready!');
      this.sceneManager.loadGround(new Map([['ground', this.assetManager.getGLTF('ground')]]));
      await new Promise(r => setTimeout(r, 400));
    } catch(e) {
      console.error('Asset loading failed', e);
    }

    this._transition('tutorial');
    this._loop(0);
  }

  private _transition(name: string): void {
    this._current?.exit();
    const next = this._states.get(name);
    if (!next) throw new Error(`Unknown state: ${name}`);
    this._current = next;
    this._current.enter();
  }

  private _loop = (time: number): void => {
    const dt = Math.min((time - this._lastTime) / 1000, 0.05);
    this._lastTime = time;

    this._current?.update(dt);
    this.sceneManager.update();
    this.sceneManager.render();

    this._raf = requestAnimationFrame(this._loop);
  };

  dispose(): void {
    cancelAnimationFrame(this._raf);
    this._current?.exit();
  }
}

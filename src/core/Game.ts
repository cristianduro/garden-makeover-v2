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

  private states:      Map<string, GameState>;
  private currentState: GameState | null = null;
  private lastTime  = 0;
  private rafId     = 0;

  readonly stateMachine = {
    transition: (name: string) => this.transition(name),
  };

  constructor(container: HTMLElement) {
    this.container = container;
    this.states = new Map<string, GameState>([
      ['loading',  new LoadingState(this)],
      ['tutorial', new TutorialState(this)],
      ['play',     new PlayState(this)],
    ]);
  }

  async start(): Promise<void> {
    Object.assign(this.container.style, {
      position: 'relative', overflow: 'hidden',
      width: '100%', height: '100%',
      userSelect: 'none', touchAction: 'none',
    });

    await this.sceneManager.init(this.container);
    await this.audioManager.init();
    await this.uiManager.init(this.container);

    this.sceneManager.bindControlsTo(this.uiManager.canvas);

    this.transition('loading');
    const loading = this.states.get('loading') as LoadingState;

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

    this.transition('tutorial');
    this.loop(0);
  }

  private transition(name: string): void {
    this.currentState?.exit();
    const next = this.states.get(name);
    if (!next) throw new Error(`Unknown state: ${name}`);
    this.currentState = next;
    this.currentState.enter();
  }

  private loop = (time: number): void => {
    const dt = Math.min((time - this.lastTime) / 1000, 0.05);
    this.lastTime = time;

    this.currentState?.update(dt);
    this.sceneManager.update();
    this.sceneManager.render();

    this.rafId = requestAnimationFrame(this.loop);
  };

  dispose(): void {
    cancelAnimationFrame(this.rafId);
    this.currentState?.exit();
  }
}

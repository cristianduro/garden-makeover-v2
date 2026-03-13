import * as PIXI from 'pixi.js';
import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { GameState } from './GameState';
import { Game } from '../core/Game';
import { GameConfig } from '../core/GameConfig';

interface TutStep { text: string; camIdx: number; }

const STEPS: TutStep[] = [
  { text: "Welcome to your Farm!\nSmall but full of potential...", camIdx: 0 },
  { text: "This is your Cropland.\nPlant fruits and vegetables here!", camIdx: 1 },
  { text: "And this is the Animal Pen.\nKeep your livestock safe!", camIdx: 2 },
  { text: "Tap the ＋ buttons\nto add crops or animals.\nLet's build your farm!", camIdx: 3 },
];

// Maximum line count across all steps — used to pre-size the box
const MAX_LINES = Math.max(...STEPS.map(s => s.text.split('\n').length));

export class TutorialState extends GameState {
  private _step = 0;
  private _hudObj: THREE.Object3D | null = null;
  private _hudMixer?: THREE.AnimationMixer;
  // Fixed local rotation for the sheep in camera space (set once, reused every frame)
  private readonly _sheepLocalQuat = new THREE.Quaternion()
    .setFromEuler(new THREE.Euler(0.08, 2.4, 0.08, 'XYZ'));

  private _tweenT   = 0;
  private _tweening = false;
  private _camFrom  = { pos: new THREE.Vector3(), target: new THREE.Vector3() };
  private _camTo    = { pos: new THREE.Vector3(), target: new THREE.Vector3() };

  private _fullText  = '';
  private _shownText = '';
  private _typeT     = 0;
  private readonly _typeSpeed = 26;

  // ── PixiJS UI ─────────────────────────────────────────────────
  private _pixiOverlay!: PIXI.Container;
  private _textEl!:      PIXI.Text;
  private _clickEl!:     PIXI.Text;
  private _boxCont!:     PIXI.Container;
  private _boxBg!:       PIXI.Graphics;
  private _blinkT  = 0;
  private _blinkFn: ((dt: number) => void) | null = null;
  private _resizeFn: (() => void) | null = null;

  constructor(game: Game) { super(game); }

  enter(): void {
    const game = this._game as Game;
    game.audioManager.startTheme();
    this._buildPixiUI();
    this._spawnGuide();
    this._startStep(0);
  }

  // ════════════════════════════════════════════════════════════════
  //  PIXI UI
  // ════════════════════════════════════════════════════════════════
  private _buildPixiUI(): void {
    const game = this._game as Game;
    const app  = game.uiManager.app;

    this._pixiOverlay = new PIXI.Container();

    // ── Transparent clickable backdrop (sized in _layoutPixiUI) ──
    const backdrop = new PIXI.Graphics();
    backdrop.eventMode = 'static';
    backdrop.name = 'backdrop';
    backdrop.on('pointertap', (e: PIXI.FederatedPointerEvent) => {
      (e.nativeEvent as PointerEvent).stopImmediatePropagation();
      this._advance();
    });
    this._pixiOverlay.addChild(backdrop);

    // ── Text box ──────────────────────────────────────────────
    this._boxCont = new PIXI.Container();
    this._boxBg   = new PIXI.Graphics();
    this._boxCont.addChild(this._boxBg);

    this._textEl  = new PIXI.Text('', { fontFamily: 'Fredoka One, cursive', fill: 0xffffff, align: 'center', wordWrap: true });
    this._textEl.anchor.set(0.5, 0);
    this._boxCont.addChild(this._textEl);

    this._clickEl = new PIXI.Text('tap to continue', { fontFamily: 'Nunito, sans-serif', fontWeight: '700', fill: 'rgba(255,255,255,0.4)' });
    this._clickEl.anchor.set(0.5, 0);
    this._clickEl.alpha = 0;
    this._boxCont.addChild(this._clickEl);

    this._boxCont.eventMode = 'none';
    this._pixiOverlay.addChild(this._boxCont);

    // ── Blink animation on "tap to continue" ──────────────────
    this._blinkFn = (dt: number) => {
      this._blinkT += dt / 60;
      if (this._clickEl.alpha > 0) {
        this._clickEl.alpha = 0.35 + 0.65 * (Math.sin(this._blinkT * Math.PI / 0.7) * 0.5 + 0.5);
      }
    };
    app.ticker.add(this._blinkFn);

    // ── Resize listener — reposition on viewport changes ──────
    this._resizeFn = () => this._layoutPixiUI();
    window.addEventListener('resize', this._resizeFn);

    game.uiManager.overlayLayer.addChild(this._pixiOverlay);

    // Initial layout
    this._layoutPixiUI();
  }

  /** Recalculates all positions/sizes from current viewport dimensions.
   *  Safe to call any time (resize, orientation change). */
  private _layoutPixiUI(): void {
    const W = innerWidth;
    const H = innerHeight;

    // ── Backdrop ──────────────────────────────────────────────
    const backdrop = this._pixiOverlay.getChildByName('backdrop') as PIXI.Graphics;
    backdrop.clear();
    backdrop.beginFill(0x000000, 0.001);
    backdrop.drawRect(0, 0, W, H);
    backdrop.endFill();
    backdrop.hitArea = new PIXI.Rectangle(0, 0, W, H);

    // ── Box dimensions ─────────────────────────────────────────
    const boxW = Math.min(600, W * 0.9);
    const fs   = Math.min(24, Math.max(17, W * 0.028));
    const lh   = fs * 1.55;
    // Height: top padding + all lines at max line count + gap + "tap" row
    const boxH = Math.ceil(20 + MAX_LINES * lh + 36);

    // ── Text styles ────────────────────────────────────────────
    this._textEl.style = new PIXI.TextStyle({
      fontFamily:    'Fredoka One, cursive',
      fontSize:      fs,
      fill:          0xffffff,
      align:         'center',
      wordWrap:      true,
      wordWrapWidth: boxW - 48,
      lineHeight:    lh,
    });
    this._textEl.x = boxW / 2;
    this._textEl.y = 20;

    this._clickEl.style = new PIXI.TextStyle({
      fontFamily: 'Nunito, sans-serif',
      fontSize:   Math.min(15, Math.max(12, W * 0.018)),
      fontWeight: '700',
      fill:       'rgba(255,255,255,0.4)',
    });
    this._clickEl.x = boxW / 2;
    this._clickEl.y = boxH - 26;

    // ── Box background ─────────────────────────────────────────
    this._boxBg.clear();
    this._boxBg.lineStyle(1.5, 0xffffff, 0.12);
    this._boxBg.beginFill(0x080c08, 0.90);
    this._boxBg.drawRoundedRect(0, 0, boxW, boxH, 16);
    this._boxBg.endFill();

    // ── Box position — bottom-centre with safe margin ──────────
    const margin = Math.max(14, H * 0.04);
    this._boxCont.x = (W - boxW) / 2;
    this._boxCont.y = H - boxH - margin;
  }

  // ════════════════════════════════════════════════════════════════
  //  3D GUIDE SHEEP  (in scene, position tracks camera every frame)
  // ════════════════════════════════════════════════════════════════
  private _spawnGuide(): void {
    const game = this._game as Game;
    try {
      const gltf = game.assetManager.getGLTF('objects');
      const src  = gltf.scene.getObjectByName('sheep_1');
      if (!src) { console.warn('sheep_1 not found'); return; }

      const obj = SkeletonUtils.clone(src) as THREE.Object3D;

      obj.traverse((o: THREE.Object3D) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.castShadow    = false;
          mesh.receiveShadow = false;
          mesh.frustumCulled = false;
          mesh.renderOrder   = 999;
          if (mesh.material) {
            const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            mats.forEach(m => {
              (m as THREE.Material).depthTest  = false;
              (m as THREE.Material).depthWrite = false;
            });
          }
        }
      });

      game.sceneManager.scene.add(obj);
      this._hudObj = obj;

      const clip = gltf.animations?.find((a: THREE.AnimationClip) => a.name === 'idle_sheep');
      if (clip) {
        this._hudMixer = new THREE.AnimationMixer(obj);
        this._hudMixer.clipAction(clip).play();
      }
    } catch(e) { console.warn('Could not spawn guide', e); }
  }

  // ════════════════════════════════════════════════════════════════
  //  STEP LOGIC
  // ════════════════════════════════════════════════════════════════
  private _startStep(idx: number): void {
    this._step      = idx;
    this._fullText  = STEPS[idx].text;
    this._shownText = '';
    this._typeT     = 0;
    this._clickEl.alpha = 0;
    this._tweenToCam(STEPS[idx].camIdx);
  }

  private _tweenToCam(idx: number): void {
    const game = this._game as Game;
    const isPortrait = innerWidth < innerHeight;
    const camList = isPortrait ? GameConfig.TUTORIAL_CAMS_PORTRAIT : GameConfig.TUTORIAL_CAMS;
    const cam = camList[idx];
    this._camFrom.pos.copy(game.sceneManager.camera.position);
    this._camFrom.target.copy(game.sceneManager.controls.target);
    this._camTo.pos.set(cam.pos.x, cam.pos.y, cam.pos.z);
    this._camTo.target.set(cam.target.x, cam.target.y, cam.target.z);
    this._tweenT   = 0;
    this._tweening = true;
    game.sceneManager.setControlsEnabled(false);
  }

  private _advance(): void {
    if (this._shownText.length < this._fullText.length) {
      this._shownText = this._fullText;
      this._textEl.text = this._shownText;
      this._clickEl.alpha = 1;
      return;
    }
    const next = this._step + 1;
    if (next >= STEPS.length) this._finish();
    else this._startStep(next);
  }

  private _finish(): void {
    const game = this._game as Game;
    const app  = game.uiManager.app;

    // Fade out overlay
    let t = 0;
    const fn = (dt: number) => {
      t = Math.min(t + dt / 60 / 0.5, 1);
      this._pixiOverlay.alpha = 1 - t;
      if (t >= 1) {
        app.ticker.remove(fn);
        game.uiManager.overlayLayer.removeChild(this._pixiOverlay);
        if (this._blinkFn) app.ticker.remove(this._blinkFn);

        if (this._hudObj) {
          game.sceneManager.scene.remove(this._hudObj);
          this._hudObj = null;
        }
        game.sceneManager.setControlsEnabled(true);
        game.uiManager.showSidebar();
        game.stateMachine.transition('play');
      }
    };
    app.ticker.add(fn);
  }

  // ════════════════════════════════════════════════════════════════
  //  UPDATE
  // ════════════════════════════════════════════════════════════════
  update(dt: number): void {
    const game = this._game as Game;

    // Camera tween
    if (this._tweening) {
      this._tweenT = Math.min(this._tweenT + dt * 0.55, 1);
      const t = this._ease(this._tweenT);
      game.sceneManager.camera.position.lerpVectors(this._camFrom.pos, this._camTo.pos, t);
      game.sceneManager.controls.target.lerpVectors(this._camFrom.target, this._camTo.target, t);
      game.sceneManager.controls.update();
      if (this._tweenT >= 1) this._tweening = false;
    }

    // Typewriter
    if (this._shownText.length < this._fullText.length) {
      this._typeT += dt;
      this._shownText = this._fullText.substring(0, Math.floor(this._typeT * this._typeSpeed));
      this._textEl.text = this._shownText;
      if (this._shownText.length >= this._fullText.length) {
        this._clickEl.alpha = 1;
      }
    }

    // Guide sheep — world-space object that shadows the camera position.
    // Position: camera-space offset converted to world using cam.quaternion.
    // Rotation: cam.quaternion × fixed local rotation (pure quaternion math —
    //   avoids the Euler-copy + rotateY/X/Z gimbal issues of the old approach).
    if (this._hudObj) {
      this._hudMixer?.update(dt);
      const cam = game.sceneManager.camera;

      // FOV_y = 52° → tan(26°) = 0.4877.  Depth oz must be > near (1.0).
      // IMPORTANT: use cam.aspect (updated by _onResize from container size),
      // NOT innerWidth/innerHeight which can differ (scrollbars, browser chrome).
      const tanHalfFovY = Math.tan((cam.fov / 2) * (Math.PI / 180));
      const oz = -1.6;
      const d  = Math.abs(oz);
      const aspect = cam.aspect; // always matches the actual projection matrix

      // Convert NDC targets to camera-local offsets:
      //   NDC_x = –0.72  → ~14% from left edge (sheep body left of popup)
      //   NDC_y = –0.38  → ~69% from top (popup zone — PixiJS popup renders on top)
      // In landscape, screen height shrinks while width grows (same FOV_y).
      // A fixed NDC fraction looks tiny in px — boost scale by aspect so the
      // sheep keeps the same apparent pixel size as in portrait (aspect ≤ 1).
      const scaleBoost = Math.max(0.9, aspect);
      const ox = -0.32 * d * tanHalfFovY * aspect;
      const oy = -0.79 * d * tanHalfFovY + Math.sin(Date.now() * 0.0015) * 0.012;
      const sc =  0.25 * d * tanHalfFovY * scaleBoost;

      const localOffset = new THREE.Vector3(ox, oy, oz);
      localOffset.applyQuaternion(cam.quaternion);
      this._hudObj.position.copy(cam.position).add(localOffset);
      this._hudObj.scale.setScalar(sc);

      // world_rotation = cam_rotation × local_rotation  (no Euler decomposition)
      this._hudObj.quaternion.copy(cam.quaternion).multiply(this._sheepLocalQuat);
    }
  }

  exit(): void {
    const game = this._game as Game;

    if (this._resizeFn) {
      window.removeEventListener('resize', this._resizeFn);
      this._resizeFn = null;
    }
    if (this._pixiOverlay.parent) {
      game.uiManager.overlayLayer.removeChild(this._pixiOverlay);
    }
    if (this._blinkFn) {
      game.uiManager.app.ticker.remove(this._blinkFn);
      this._blinkFn = null;
    }
    if (this._hudObj) {
      game.sceneManager.scene.remove(this._hudObj);
      this._hudObj = null;
    }
  }

  private _ease(t: number): number {
    return t < 0.5 ? 2*t*t : -1+(4-2*t)*t;
  }
}

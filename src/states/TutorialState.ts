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

export class TutorialState extends GameState {
  private _step = 0;
  private _hudObj: THREE.Object3D | null = null;
  private _hudMixer?: THREE.AnimationMixer;

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
    const W    = innerWidth;
    const H    = innerHeight;

    this._pixiOverlay = new PIXI.Container();

    // ── Transparent clickable backdrop ────────────────────────
    const backdrop = new PIXI.Graphics();
    backdrop.beginFill(0x000000, 0.001); // near-transparent but hittable
    backdrop.drawRect(0, 0, W, H);
    backdrop.endFill();
    backdrop.eventMode = 'static';
    backdrop.hitArea   = new PIXI.Rectangle(0, 0, W, H);
    backdrop.on('pointertap', (e: PIXI.FederatedPointerEvent) => {
      (e.nativeEvent as PointerEvent).stopImmediatePropagation();
      this._advance();
    });
    backdrop.name = 'backdrop';
    this._pixiOverlay.addChild(backdrop);

    // ── Text box ──────────────────────────────────────────────
    this._boxCont = new PIXI.Container();

    this._boxBg = new PIXI.Graphics();
    this._boxCont.addChild(this._boxBg);

    const boxW = Math.min(600, W * 0.9);
    const boxH = 130;

    this._textEl = new PIXI.Text('', {
      fontFamily: 'Fredoka One, cursive',
      fontSize:   Math.min(24, Math.max(17, W * 0.028)),
      fill:       0xffffff,
      align:      'center',
      wordWrap:   true,
      wordWrapWidth: boxW - 56,
      lineHeight: Math.min(24, Math.max(17, W * 0.028)) * 1.55,
    });
    this._textEl.anchor.set(0.5, 0);
    this._textEl.x = boxW / 2;
    this._textEl.y = 20;
    this._boxCont.addChild(this._textEl);

    this._clickEl = new PIXI.Text('tap to continue', {
      fontFamily: 'Nunito, sans-serif',
      fontSize:   Math.min(15, Math.max(12, W * 0.018)),
      fontWeight: '700',
      fill:       0xffffff66,
    });
    this._clickEl.anchor.set(0.5, 0);
    this._clickEl.x = boxW / 2;
    this._clickEl.y = boxH - 28;
    this._clickEl.alpha = 0;
    this._boxCont.addChild(this._clickEl);

    // Draw box background
    this._boxBg.lineStyle(1.5, 0xffffff, 0.12);
    this._boxBg.beginFill(0x080c08, 0.90);
    this._boxBg.drawRoundedRect(0, 0, boxW, boxH, 16);
    this._boxBg.endFill();

    // Position box at bottom center
    this._boxCont.x = (W - boxW) / 2;
    this._boxCont.y = H - boxH - Math.max(12, H * 0.06);
    this._boxCont.eventMode = 'none'; // let parent handle clicks

    this._pixiOverlay.addChild(this._boxCont);

    // ── Blink animation on "tap to continue" ──────────────────
    this._blinkFn = (dt: number) => {
      this._blinkT += dt / 60;
      if (this._clickEl.alpha > 0) {
        const v = 0.35 + 0.65 * (Math.sin(this._blinkT * Math.PI / 0.7) * 0.5 + 0.5);
        this._clickEl.alpha = v;
      }
    };
    app.ticker.add(this._blinkFn);

    game.uiManager.overlayLayer.addChild(this._pixiOverlay);
  }

  // ════════════════════════════════════════════════════════════════
  //  3D GUIDE SHEEP  (Three.js — stays in 3D scene)
  // ════════════════════════════════════════════════════════════════
  private _spawnGuide(): void {
    const game = this._game as Game;
    try {
      const gltf = game.assetManager.getGLTF('objects');
      const src  = gltf.scene.getObjectByName('sheep_1');
      if (!src) { console.warn('sheep_1 not found'); return; }

      const obj = SkeletonUtils.clone(src) as THREE.Object3D;
      obj.scale.setScalar(0.20);
      obj.position.set(-0.38, -0.44, -1.1);
      obj.rotation.set(0.08, 2.4, 0.10);

      obj.traverse((o: THREE.Object3D) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.castShadow    = false;
          mesh.receiveShadow = false;
          mesh.frustumCulled = false;
          mesh.renderOrder   = 999;
          if (mesh.material) {
            const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            mats.forEach(m => { (m as THREE.Material).depthTest = false; });
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

    // Guide sheep (3D, camera-space)
    if (this._hudObj) {
      this._hudMixer?.update(dt);
      const cam = game.sceneManager.camera;
      const aspect    = innerWidth / innerHeight;
      const isPortrait = aspect < 1;

      const ox = isPortrait ? -0.22 : -0.38;
      const oy = isPortrait ? -0.52 : -0.44;
      const oz = isPortrait ? -0.95 : -1.1;
      const sc = isPortrait ? 0.14  : 0.20;

      this._hudObj.scale.setScalar(sc);
      const bobY = oy + Math.sin(Date.now() * 0.0015) * 0.012;
      const localOffset = new THREE.Vector3(ox, bobY, oz);
      localOffset.applyQuaternion(cam.quaternion);
      this._hudObj.position.copy(cam.position).add(localOffset);

      this._hudObj.rotation.copy(cam.rotation);
      this._hudObj.rotateY(2.4);
      this._hudObj.rotateX(0.08);
      this._hudObj.rotateZ(0.10);
    }
  }

  exit(): void {
    const game = this._game as Game;
    // Clean up if overlay still exists (e.g. fast skip)
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

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

const MAX_LINES = Math.max(...STEPS.map(s => s.text.split('\n').length));

export class TutorialState extends GameState {
  private step = 0;
  private hudObj: THREE.Object3D | null = null;
  private hudMixer?: THREE.AnimationMixer;
  private readonly sheepLocalQuat = new THREE.Quaternion()
    .setFromEuler(new THREE.Euler(0.08, 2.4, 0.08, 'XYZ'));

  private tweenT   = 0;
  private tweening = false;
  private camFrom  = { pos: new THREE.Vector3(), target: new THREE.Vector3() };
  private camTo    = { pos: new THREE.Vector3(), target: new THREE.Vector3() };

  private fullText  = '';
  private shownText = '';
  private typeT     = 0;
  private readonly typeSpeed = 26;

  private pixiOverlay!: PIXI.Container;
  private textEl!:      PIXI.Text;
  private clickEl!:     PIXI.Text;
  private boxCont!:     PIXI.Container;
  private boxBg!:       PIXI.Graphics;
  private blinkT  = 0;
  private blinkFn: ((dt: number) => void) | null = null;
  private resizeFn: (() => void) | null = null;

  constructor(game: Game) { super(game); }

  enter(): void {
    const game = this.game as Game;
    game.audioManager.startTheme();
    this.buildPixiUI();
    this.spawnGuide();
    this.startStep(0);
  }

  private buildPixiUI(): void {
    const game = this.game as Game;
    const app  = game.uiManager.app;

    this.pixiOverlay = new PIXI.Container();

    const backdrop = new PIXI.Graphics();
    backdrop.eventMode = 'static';
    backdrop.name = 'backdrop';
    backdrop.on('pointertap', (e: PIXI.FederatedPointerEvent) => {
      (e.nativeEvent as PointerEvent).stopImmediatePropagation();
      this.advance();
    });
    this.pixiOverlay.addChild(backdrop);

    this.boxCont = new PIXI.Container();
    this.boxBg   = new PIXI.Graphics();
    this.boxCont.addChild(this.boxBg);

    this.textEl  = new PIXI.Text('', { fontFamily: 'Fredoka One, cursive', fill: 0xffffff, align: 'center', wordWrap: true });
    this.textEl.anchor.set(0.5, 0);
    this.boxCont.addChild(this.textEl);

    this.clickEl = new PIXI.Text('tap to continue', { fontFamily: 'Nunito, sans-serif', fontWeight: '700', fill: 'rgba(255,255,255,0.4)' });
    this.clickEl.anchor.set(0.5, 0);
    this.clickEl.alpha = 0;
    this.boxCont.addChild(this.clickEl);

    this.boxCont.eventMode = 'none';
    this.pixiOverlay.addChild(this.boxCont);

    this.blinkFn = (dt: number) => {
      this.blinkT += dt / 60;
      if (this.clickEl.alpha > 0) {
        this.clickEl.alpha = 0.35 + 0.65 * (Math.sin(this.blinkT * Math.PI / 0.7) * 0.5 + 0.5);
      }
    };
    app.ticker.add(this.blinkFn);

    this.resizeFn = () => this.layoutPixiUI();
    window.addEventListener('resize', this.resizeFn);

    game.uiManager.overlayLayer.addChild(this.pixiOverlay);

    this.layoutPixiUI();
  }

  private layoutPixiUI(): void {
    const W = innerWidth;
    const H = innerHeight;

    const backdrop = this.pixiOverlay.getChildByName('backdrop') as PIXI.Graphics;
    backdrop.clear();
    backdrop.beginFill(0x000000, 0.001);
    backdrop.drawRect(0, 0, W, H);
    backdrop.endFill();
    backdrop.hitArea = new PIXI.Rectangle(0, 0, W, H);

    const boxW = Math.min(600, W * 0.9);
    const fs   = Math.min(24, Math.max(17, W * 0.028));
    const lh   = fs * 1.55;
    const boxH = Math.ceil(20 + MAX_LINES * lh + 36);

    this.textEl.style = new PIXI.TextStyle({
      fontFamily:    'Fredoka One, cursive',
      fontSize:      fs,
      fill:          0xffffff,
      align:         'center',
      wordWrap:      true,
      wordWrapWidth: boxW - 48,
      lineHeight:    lh,
    });
    this.textEl.x = boxW / 2;
    this.textEl.y = 20;

    this.clickEl.style = new PIXI.TextStyle({
      fontFamily: 'Nunito, sans-serif',
      fontSize:   Math.min(15, Math.max(12, W * 0.018)),
      fontWeight: '700',
      fill:       'rgba(255,255,255,0.4)',
    });
    this.clickEl.x = boxW / 2;
    this.clickEl.y = boxH - 26;

    this.boxBg.clear();
    this.boxBg.lineStyle(1.5, 0xffffff, 0.12);
    this.boxBg.beginFill(0x080c08, 0.90);
    this.boxBg.drawRoundedRect(0, 0, boxW, boxH, 16);
    this.boxBg.endFill();

    const margin = Math.max(14, H * 0.04);
    this.boxCont.x = (W - boxW) / 2;
    this.boxCont.y = H - boxH - margin;
  }

  private spawnGuide(): void {
    const game = this.game as Game;
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
            mats.forEach(mat => {
              (mat as THREE.Material).depthTest  = false;
              (mat as THREE.Material).depthWrite = false;
            });
          }
        }
      });

      game.sceneManager.scene.add(obj);
      this.hudObj = obj;

      const clip = gltf.animations?.find((a: THREE.AnimationClip) => a.name === 'idle_sheep');
      if (clip) {
        this.hudMixer = new THREE.AnimationMixer(obj);
        this.hudMixer.clipAction(clip).play();
      }
    } catch(_error) { console.warn('Could not spawn guide', _error); }
  }

  private startStep(idx: number): void {
    this.step      = idx;
    this.fullText  = STEPS[idx].text;
    this.shownText = '';
    this.typeT     = 0;
    this.clickEl.alpha = 0;
    this.tweenToCam(STEPS[idx].camIdx);
  }

  private tweenToCam(idx: number): void {
    const game = this.game as Game;
    const isPortrait = innerWidth < innerHeight;
    const camList = isPortrait ? GameConfig.TUTORIAL_CAMS_PORTRAIT : GameConfig.TUTORIAL_CAMS;
    const cam = camList[idx];
    this.camFrom.pos.copy(game.sceneManager.camera.position);
    this.camFrom.target.copy(game.sceneManager.controls.target);
    this.camTo.pos.set(cam.pos.x, cam.pos.y, cam.pos.z);
    this.camTo.target.set(cam.target.x, cam.target.y, cam.target.z);
    this.tweenT   = 0;
    this.tweening = true;
    game.sceneManager.setControlsEnabled(false);
  }

  private advance(): void {
    if (this.shownText.length < this.fullText.length) {
      this.shownText = this.fullText;
      this.textEl.text = this.shownText;
      this.clickEl.alpha = 1;
      return;
    }
    const next = this.step + 1;
    if (next >= STEPS.length) this.finish();
    else this.startStep(next);
  }

  private finish(): void {
    const game = this.game as Game;
    const app  = game.uiManager.app;

    let animProgress = 0;
    const fn = (dt: number) => {
      animProgress = Math.min(animProgress + dt / 60 / 0.5, 1);
      this.pixiOverlay.alpha = 1 - animProgress;
      if (animProgress >= 1) {
        app.ticker.remove(fn);
        game.uiManager.overlayLayer.removeChild(this.pixiOverlay);
        if (this.blinkFn) app.ticker.remove(this.blinkFn);

        if (this.hudObj) {
          game.sceneManager.scene.remove(this.hudObj);
          this.hudObj = null;
        }
        game.sceneManager.setControlsEnabled(true);
        game.uiManager.showSidebar();
        game.stateMachine.transition('play');
      }
    };
    app.ticker.add(fn);
  }

  update(dt: number): void {
    const game = this.game as Game;

    if (this.tweening) {
      this.tweenT = Math.min(this.tweenT + dt * 0.55, 1);
      const factor = this.ease(this.tweenT);
      game.sceneManager.camera.position.lerpVectors(this.camFrom.pos, this.camTo.pos, factor);
      game.sceneManager.controls.target.lerpVectors(this.camFrom.target, this.camTo.target, factor);
      game.sceneManager.controls.update();
      if (this.tweenT >= 1) this.tweening = false;
    }

    if (this.shownText.length < this.fullText.length) {
      this.typeT += dt;
      this.shownText = this.fullText.substring(0, Math.floor(this.typeT * this.typeSpeed));
      this.textEl.text = this.shownText;
      if (this.shownText.length >= this.fullText.length) {
        this.clickEl.alpha = 1;
      }
    }

    if (this.hudObj) {
      this.hudMixer?.update(dt);
      const cam = game.sceneManager.camera;

      const tanHalfFovY = Math.tan((cam.fov / 2) * (Math.PI / 180));
      const oz = -1.6;
      const depth = Math.abs(oz);
      const aspect = cam.aspect;

      const scaleBoost = Math.max(1, aspect);
      const ox = -0.32 * depth * tanHalfFovY * aspect;
      const oy = -0.79 * depth * tanHalfFovY + Math.sin(Date.now() * 0.0015) * 0.012;
      const sc =  0.30 * depth * tanHalfFovY * scaleBoost;

      const localOffset = new THREE.Vector3(ox, oy, oz);
      localOffset.applyQuaternion(cam.quaternion);
      this.hudObj.position.copy(cam.position).add(localOffset);
      this.hudObj.scale.setScalar(sc);

      this.hudObj.quaternion.copy(cam.quaternion).multiply(this.sheepLocalQuat);
    }
  }

  exit(): void {
    const game = this.game as Game;

    if (this.resizeFn) {
      window.removeEventListener('resize', this.resizeFn);
      this.resizeFn = null;
    }
    if (this.pixiOverlay.parent) {
      game.uiManager.overlayLayer.removeChild(this.pixiOverlay);
    }
    if (this.blinkFn) {
      game.uiManager.app.ticker.remove(this.blinkFn);
      this.blinkFn = null;
    }
    if (this.hudObj) {
      game.sceneManager.scene.remove(this.hudObj);
      this.hudObj = null;
    }
  }

  private ease(progress: number): number {
    return progress < 0.5 ? 2*progress*progress : -1+(4-2*progress)*progress;
  }
}

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

// Tutorial guide: 2D DOM overlay (not 3D scene object)

export class TutorialState extends GameState {
  private _step = 0;
  private _guideEl: HTMLElement | null = null;
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

  private _overlay!: HTMLElement;
  private _box!:     HTMLElement;
  private _textEl!:  HTMLElement;
  private _clickEl!: HTMLElement;

  constructor(game: Game) { super(game); }

  enter(): void {
    const game = this._game as Game;
    game.audioManager.startTheme();
    this._buildDOM();
    this._spawnGuide();
    this._startStep(0);
    this._overlay.addEventListener('click', () => this._advance());
  }

  private _spawnGuide(): void {
    const game = this._game as Game;
    try {
      const gltf = game.assetManager.getGLTF('objects');
      const src  = gltf.scene.getObjectByName('sheep_1');
      if (!src) { console.warn('sheep_1 not found'); return; }

      // SkeletonUtils.clone preserves bone bindings for SkinnedMesh
      const obj = SkeletonUtils.clone(src) as THREE.Object3D;

      obj.scale.setScalar(0.20);
      // Camera-local space: left side, slightly low, in front (-Z = forward)
      obj.position.set(-0.38, -0.44, -1.1);
      // Turned ~140° on Y (side-facing like reference chicken), slight lean
      obj.rotation.set(0.08, 2.4, 0.10);

      obj.traverse((o: THREE.Object3D) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.castShadow    = false;
          mesh.receiveShadow = false;
          mesh.frustumCulled = false;
          // Render on top of everything else
          mesh.renderOrder   = 999;
          if (mesh.material) {
            const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            mats.forEach(m => { (m as THREE.Material).depthTest = false; });
          }
        }
      });

      // Add to main scene — we'll manually update position each frame
      // to follow the camera (camera is NOT in scene graph in Three.js)
      game.sceneManager.scene.add(obj);
      this._hudObj = obj;

      const clip = gltf.animations?.find((a: THREE.AnimationClip) => a.name === 'idle_sheep');
      if (clip) {
        this._hudMixer = new THREE.AnimationMixer(obj);
        this._hudMixer.clipAction(clip).play();
      }
    } catch(e) { console.warn('Could not spawn guide', e); }
  }

  private _buildDOM(): void {
    const game = this._game as Game;

    this._overlay = document.createElement('div');
    Object.assign(this._overlay.style, {
      position: 'absolute', inset: '0',
      zIndex: '30', cursor: 'pointer', pointerEvents: 'all',
    });
    game.container.appendChild(this._overlay);

    if (!document.getElementById('gm-tut-style')) {
      const s = document.createElement('style');
      s.id = 'gm-tut-style';
      s.textContent = `
        @import url('https://fonts.googleapis.com/css2?family=Fredoka+One&family=Nunito:wght@700;800&display=swap');
        @keyframes gm-blink { 0%,100%{opacity:0.35} 50%{opacity:1} }

        /* Portrait: compact popup */
        @media (orientation: portrait) {
          #gm-tut-box {
            bottom: clamp(8px, 3vh, 30px) !important;
            min-width: min(300px, 88vw) !important;
            max-width: 92vw !important;
            padding: 14px 18px !important;
          }
          #gm-tut-text { font-size: clamp(14px, 4.5vw, 20px) !important; min-height: 2.5em !important; }
          #gm-tut-click { font-size: clamp(11px, 3.2vw, 14px) !important; margin-top: 6px !important; }
        }

        /* Narrow landscape: shorter popup */
        @media (orientation: landscape) and (max-height: 500px) {
          #gm-tut-box {
            bottom: 6px !important;
            padding: 8px 20px !important;
          }
          #gm-tut-text { font-size: clamp(13px, 2.2vh, 18px) !important; min-height: 2em !important; }
        }
      `;
      document.head.appendChild(s);
    }

    this._box = document.createElement('div');
    this._box.id = 'gm-tut-box';
    Object.assign(this._box.style, {
      position:       'absolute',
      bottom:         'clamp(12px,6vh,80px)',
      left:           '50%',
      transform:      'translateX(-50%)',
      background:     'rgba(8,18,8,0.90)',
      backdropFilter: 'blur(8px)',
      borderRadius:   '16px',
      padding:        'clamp(18px,3vw,28px) clamp(28px,5vw,56px)',
      minWidth:       'min(360px,84vw)',
      maxWidth:       'min(600px,90vw)',
      textAlign:      'center',
      zIndex:         '31',
      pointerEvents:  'none',
      border:         '1.5px solid rgba(255,255,255,0.12)',
      boxShadow:      '0 8px 40px rgba(0,0,0,0.6)',
    });

    this._textEl = document.createElement('div');
    this._textEl.id = 'gm-tut-text';
    Object.assign(this._textEl.style, {
      color: '#fff', fontSize: 'clamp(17px,2.8vw,24px)',
      fontFamily: "'Fredoka One', cursive", lineHeight: '1.55',
      minHeight: '3em', whiteSpace: 'pre-line',
    });
    this._box.appendChild(this._textEl);

    this._clickEl = document.createElement('div');
    this._clickEl.id = 'gm-tut-click';
    Object.assign(this._clickEl.style, {
      color: 'rgba(255,255,255,0.4)', fontSize: 'clamp(12px,1.8vw,15px)',
      marginTop: '10px', fontFamily: "'Nunito', sans-serif",
      animation: 'gm-blink 1.4s ease-in-out infinite', opacity: '0',
    });
    this._clickEl.textContent = 'tap to continue';
    this._box.appendChild(this._clickEl);
    this._overlay.appendChild(this._box);
  }

  private _startStep(idx: number): void {
    this._step      = idx;
    this._fullText  = STEPS[idx].text;
    this._shownText = '';
    this._typeT     = 0;
    this._clickEl.style.opacity = '0';
    this._tweenToCam(STEPS[idx].camIdx);
  }

  private _tweenToCam(idx: number): void {
    const game = this._game as Game;
    const isPortrait = innerWidth < innerHeight;
    const camList = isPortrait ? GameConfig.TUTORIAL_CAMS_PORTRAIT : GameConfig.TUTORIAL_CAMS;
    const cam  = camList[idx];
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
      this._textEl.textContent = this._shownText;
      this._clickEl.style.opacity = '1';
      return;
    }
    const next = this._step + 1;
    if (next >= STEPS.length) this._finish();
    else this._startStep(next);
  }

  private _finish(): void {
    const game = this._game as Game;
    this._overlay.style.transition = 'opacity 0.5s';
    this._overlay.style.opacity    = '0';
    setTimeout(() => {
      this._overlay.remove();
      if (this._guideEl) this._guideEl.style.opacity = '0';
      if (this._hudObj) {
        game.sceneManager.scene.remove(this._hudObj);
        this._hudObj = null;
      }
      game.sceneManager.setControlsEnabled(true);
      const sidebar = document.getElementById('gm-sidebar');
      if (sidebar) {
        sidebar.style.transition    = 'opacity 0.6s';
        sidebar.style.opacity       = '1';
        sidebar.style.pointerEvents = 'all';
      }
      game.stateMachine.transition('play');
    }, 500);
  }

  update(dt: number): void {
    const game = this._game as Game;

    if (this._tweening) {
      this._tweenT = Math.min(this._tweenT + dt * 0.55, 1);
      const t = this._ease(this._tweenT);
      game.sceneManager.camera.position.lerpVectors(this._camFrom.pos, this._camTo.pos, t);
      game.sceneManager.controls.target.lerpVectors(this._camFrom.target, this._camTo.target, t);
      game.sceneManager.controls.update();
      if (this._tweenT >= 1) this._tweening = false;
    }

    if (this._shownText.length < this._fullText.length) {
      this._typeT += dt;
      this._shownText = this._fullText.substring(0, Math.floor(this._typeT * this._typeSpeed));
      this._textEl.textContent = this._shownText;
      if (this._shownText.length >= this._fullText.length) {
        this._clickEl.style.opacity = '1';
      }
    }

    if (this._hudObj) {
      this._hudMixer?.update(dt);
      const game = this._game as Game;
      const cam = game.sceneManager.camera;

      // Adapt offset to aspect ratio so sheep stays bottom-left regardless of orientation
      // In portrait (aspect < 1) the screen is taller — push X less negative, Y more negative
      const aspect = innerWidth / innerHeight;
      const isPortrait = aspect < 1;

      // X: how far left in camera space. In portrait, screen is narrower so less offset needed
      const ox = isPortrait ? -0.22 : -0.38;
      // Y: how far down. In portrait the popup is lower on screen → sheep goes lower too
      const oy = isPortrait ? -0.52 : -0.44;
      // Z: distance in front of camera
      const oz = isPortrait ? -0.95 : -1.1;
      // Scale: smaller on portrait so it doesn't dominate
      const sc = isPortrait ? 0.14 : 0.20;
      this._hudObj.scale.setScalar(sc);

      const bobY = oy + Math.sin(Date.now() * 0.0015) * 0.012;
      const localOffset = new THREE.Vector3(ox, bobY, oz);
      localOffset.applyQuaternion(cam.quaternion);
      this._hudObj.position.copy(cam.position).add(localOffset);

      // Match camera rotation + fixed side-facing offset
      this._hudObj.rotation.copy(cam.rotation);
      this._hudObj.rotateY(2.4);
      this._hudObj.rotateX(0.08);
      this._hudObj.rotateZ(0.10);
    }
  }

  exit(): void {
    this._overlay?.remove();
    // guideEl is a child of _overlay, removed with it
    if (this._hudObj) {
      (this._game as Game).sceneManager.scene.remove(this._hudObj);
      this._hudObj = null;
    }
  }

  private _ease(t: number): number {
    return t < 0.5 ? 2*t*t : -1+(4-2*t)*t;
  }
}

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GameConfig } from '../core/GameConfig';

export class SceneManager {
  private _renderer!: THREE.WebGLRenderer;
  private _scene!:    THREE.Scene;
  private _camera!:   THREE.PerspectiveCamera;
  private _controls!: OrbitControls;
  private _ambient!:  THREE.AmbientLight;
  private _sun!:      THREE.DirectionalLight;
  private _fillLight!: THREE.DirectionalLight;

  async init(container: HTMLElement): Promise<void> {
    const cfg = GameConfig;

    // Renderer
    this._renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this._renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this._renderer.setSize(innerWidth, innerHeight);
    this._renderer.shadowMap.enabled = true;
    this._renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
    this._renderer.toneMapping       = THREE.ACESFilmicToneMapping;
    this._renderer.toneMappingExposure = 1.05;
    Object.assign(this._renderer.domElement.style, {
      position: 'absolute', inset: '0', zIndex: '1',
    });
    container.appendChild(this._renderer.domElement);

    // Scene
    this._scene = new THREE.Scene();
    this._scene.background = new THREE.Color(cfg.SKY_DAY);
    this._scene.fog = new THREE.Fog(cfg.FOG_DAY.color, cfg.FOG_DAY.near, cfg.FOG_DAY.far);

    // Camera
    this._camera = new THREE.PerspectiveCamera(
      cfg.CAM_FOV, innerWidth/innerHeight, cfg.CAM_NEAR, cfg.CAM_FAR
    );
    // Pull back further in portrait so full farm is visible
    const isPortrait = innerWidth < innerHeight;
    const camPos = isPortrait
      ? { x: cfg.CAM_POS.x, y: cfg.CAM_POS.y * 1.5, z: cfg.CAM_POS.z * 1.5 }
      : cfg.CAM_POS;
    this._camera.position.set(camPos.x, camPos.y, camPos.z);

    // Lights
    this._ambient = new THREE.AmbientLight(cfg.AMBIENT_DAY.color, cfg.AMBIENT_DAY.intensity);
    this._scene.add(this._ambient);

    this._sun = new THREE.DirectionalLight(cfg.DIR_DAY.color, cfg.DIR_DAY.intensity);
    this._sun.position.set(12, 28, 18);
    this._sun.target.position.set(-1, 0, -6);
    this._sun.castShadow = true;
    this._sun.shadow.mapSize.set(2048, 2048);
    this._sun.shadow.camera.near = 5;
    this._sun.shadow.camera.far  = 120;
    this._sun.shadow.camera.left = this._sun.shadow.camera.bottom = -35;
    this._sun.shadow.camera.right = this._sun.shadow.camera.top   =  35;
    this._sun.shadow.bias = -0.0003;
    this._scene.add(this._sun);
    this._scene.add(this._sun.target);

    this._fillLight = new THREE.DirectionalLight(0xaaccff, 0.35);
    this._fillLight.position.set(-15, 10, -10);
    this._scene.add(this._fillLight);

    // OrbitControls
    this._controls = new OrbitControls(this._camera, this._renderer.domElement);
    this._controls.target.set(cfg.CAM_TARGET.x, cfg.CAM_TARGET.y, cfg.CAM_TARGET.z);
    this._controls.minPolarAngle  = cfg.CAM_MIN_POLAR;
    this._controls.maxPolarAngle  = cfg.CAM_MAX_POLAR;
    this._controls.minDistance    = cfg.CAM_MIN_DIST;
    this._controls.maxDistance    = cfg.CAM_MAX_DIST;
    this._controls.enableDamping  = true;
    this._controls.dampingFactor  = 0.08;
    this._controls.enablePan      = true;
    this._controls.screenSpacePanning = true;
    this._controls.update();

    window.addEventListener('resize', this._onResize);
  }

  loadGround(assets: any): void {
    const gltf = assets.get('ground');
    if (!gltf) { console.error('ground.glb not loaded'); return; }
    const g = gltf.scene.clone(true);
    g.traverse((o: THREE.Object3D) => {
      if (o instanceof THREE.Mesh) {
        o.castShadow    = true;
        o.receiveShadow = true;
      }
    });
    this._scene.add(g);
  }

  setControlsEnabled(v: boolean): void {
    this._controls.enabled = v;
  }

  update(): void {
    this._controls.update();
  }

  render(): void {
    this._renderer.render(this._scene, this._camera);
  }

  private _onResize = (): void => {
    // Use container size if available, fallback to window
    const w = this._renderer.domElement.parentElement?.clientWidth || innerWidth;
    const h = this._renderer.domElement.parentElement?.clientHeight || innerHeight;
    this._camera.aspect = w / h;
    this._camera.updateProjectionMatrix();
    this._renderer.setSize(w, h);
  };

  get renderer(): THREE.WebGLRenderer { return this._renderer; }
  get scene():    THREE.Scene          { return this._scene;    }
  get camera():   THREE.PerspectiveCamera { return this._camera; }
  get controls(): OrbitControls        { return this._controls; }
  get ambient():  THREE.AmbientLight      { return this._ambient;   }
  get sun():      THREE.DirectionalLight  { return this._sun;       }
  get fill():     THREE.DirectionalLight  { return this._fillLight; }
}

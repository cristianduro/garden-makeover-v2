import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GameConfig } from '../core/GameConfig';

export class SceneManager {
  private webGLRenderer!: THREE.WebGLRenderer;
  private threeScene!:    THREE.Scene;
  private perspCamera!:   THREE.PerspectiveCamera;
  private orbitControls!: OrbitControls;
  private ambientLight!:  THREE.AmbientLight;
  private sunLight!:      THREE.DirectionalLight;
  private fillDirectionalLight!: THREE.DirectionalLight;

  async init(container: HTMLElement): Promise<void> {
    this.webGLRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.webGLRenderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.webGLRenderer.setSize(innerWidth, innerHeight);
    this.webGLRenderer.shadowMap.enabled = true;
    this.webGLRenderer.shadowMap.type    = THREE.PCFSoftShadowMap;
    this.webGLRenderer.toneMapping       = THREE.ACESFilmicToneMapping;
    this.webGLRenderer.toneMappingExposure = 1.05;
    Object.assign(this.webGLRenderer.domElement.style, {
      position: 'absolute', inset: '0', zIndex: '1',
    });
    container.appendChild(this.webGLRenderer.domElement);

    this.threeScene = new THREE.Scene();
    this.threeScene.background = new THREE.Color(GameConfig.SKY_DAY);
    this.threeScene.fog = new THREE.Fog(GameConfig.FOG_DAY.color, GameConfig.FOG_DAY.near, GameConfig.FOG_DAY.far);

    this.perspCamera = new THREE.PerspectiveCamera(
      GameConfig.CAM_FOV, innerWidth/innerHeight, GameConfig.CAM_NEAR, GameConfig.CAM_FAR
    );
    const isPortrait = innerWidth < innerHeight;
    const camPos = isPortrait
      ? { x: GameConfig.CAM_POS.x, y: GameConfig.CAM_POS.y * 1.5, z: GameConfig.CAM_POS.z * 1.5 }
      : GameConfig.CAM_POS;
    this.perspCamera.position.set(camPos.x, camPos.y, camPos.z);

    this.ambientLight = new THREE.AmbientLight(GameConfig.AMBIENT_DAY.color, GameConfig.AMBIENT_DAY.intensity);
    this.threeScene.add(this.ambientLight);

    this.sunLight = new THREE.DirectionalLight(GameConfig.DIR_DAY.color, GameConfig.DIR_DAY.intensity);
    this.sunLight.position.set(12, 28, 18);
    this.sunLight.target.position.set(-1, 0, -6);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    this.sunLight.shadow.camera.near = 5;
    this.sunLight.shadow.camera.far  = 120;
    this.sunLight.shadow.camera.left = this.sunLight.shadow.camera.bottom = -35;
    this.sunLight.shadow.camera.right = this.sunLight.shadow.camera.top   =  35;
    this.sunLight.shadow.bias = -0.0003;
    this.threeScene.add(this.sunLight);
    this.threeScene.add(this.sunLight.target);

    this.fillDirectionalLight = new THREE.DirectionalLight(0xaaccff, 0.35);
    this.fillDirectionalLight.position.set(-15, 10, -10);
    this.threeScene.add(this.fillDirectionalLight);

    this.orbitControls = new OrbitControls(this.perspCamera, this.webGLRenderer.domElement);
    this.orbitControls.target.set(GameConfig.CAM_TARGET.x, GameConfig.CAM_TARGET.y, GameConfig.CAM_TARGET.z);
    this.orbitControls.minPolarAngle  = GameConfig.CAM_MIN_POLAR;
    this.orbitControls.maxPolarAngle  = GameConfig.CAM_MAX_POLAR;
    this.orbitControls.minDistance    = GameConfig.CAM_MIN_DIST;
    this.orbitControls.maxDistance    = GameConfig.CAM_MAX_DIST;
    this.orbitControls.enableDamping  = true;
    this.orbitControls.dampingFactor  = 0.08;
    this.orbitControls.enablePan      = false;
    this.orbitControls.screenSpacePanning = true;
    this.orbitControls.update();

    window.addEventListener('resize', this.onResize);
  }

  loadGround(assets: any): void {
    const gltf = assets.get('ground');
    if (!gltf) { console.error('ground.glb not loaded'); return; }
    const groundMesh = gltf.scene.clone(true);
    groundMesh.traverse((o: THREE.Object3D) => {
      if (o instanceof THREE.Mesh) {
        o.castShadow    = true;
        o.receiveShadow = true;
      }
    });
    this.threeScene.add(groundMesh);
  }

  setControlsEnabled(v: boolean): void {
    this.orbitControls.enabled = v;
  }

  /**
   * Rebind OrbitControls to a new DOM element (e.g. the Pixi canvas overlay).
   * Call this once, after the overlay canvas is in the DOM.
   */
  bindControlsTo(element: HTMLElement): void {
    const target  = this.orbitControls.target.clone();
    const enabled = this.orbitControls.enabled;
    this.orbitControls.dispose();

    this.orbitControls = new OrbitControls(this.perspCamera, element);
    this.orbitControls.target.copy(target);
    this.orbitControls.minPolarAngle      = GameConfig.CAM_MIN_POLAR;
    this.orbitControls.maxPolarAngle      = GameConfig.CAM_MAX_POLAR;
    this.orbitControls.minDistance        = GameConfig.CAM_MIN_DIST;
    this.orbitControls.maxDistance        = GameConfig.CAM_MAX_DIST;
    this.orbitControls.enableDamping      = true;
    this.orbitControls.dampingFactor      = 0.08;
    this.orbitControls.enablePan          = false;
    this.orbitControls.screenSpacePanning = true;
    this.orbitControls.enabled            = enabled;
    this.orbitControls.update();
  }

  update(): void {
    this.orbitControls.update();
  }

  render(): void {
    this.webGLRenderer.render(this.threeScene, this.perspCamera);
  }

  private onResize = (): void => {
    const width  = this.webGLRenderer.domElement.parentElement?.clientWidth || innerWidth;
    const height = this.webGLRenderer.domElement.parentElement?.clientHeight || innerHeight;
    this.perspCamera.aspect = width / height;
    this.perspCamera.updateProjectionMatrix();
    this.webGLRenderer.setSize(width, height);
  };

  get renderer(): THREE.WebGLRenderer        { return this.webGLRenderer; }
  get scene():    THREE.Scene                { return this.threeScene;    }
  get camera():   THREE.PerspectiveCamera    { return this.perspCamera;   }
  get controls(): OrbitControls              { return this.orbitControls; }
  get ambient():  THREE.AmbientLight         { return this.ambientLight;  }
  get sun():      THREE.DirectionalLight     { return this.sunLight;      }
  get fill():     THREE.DirectionalLight     { return this.fillDirectionalLight; }
}

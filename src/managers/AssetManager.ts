import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GameConfig } from '../core/GameConfig';

export class AssetManager {
  private _gltfs   = new Map<string, any>();
  private _textures = new Map<string, THREE.Texture>();
  private _loader  = new GLTFLoader();
  private _texLoader = new THREE.TextureLoader();

  async loadAll(onProgress?: (pct: number) => void): Promise<void> {
    // Load both GLBs in parallel
    const [ground, objects] = await Promise.all([
      this._loadGLTF(GameConfig.ASSETS.GROUND_GLB),
      this._loadGLTF(GameConfig.ASSETS.OBJECTS_GLB),
    ]);
    this._gltfs.set('ground',  ground);
    this._gltfs.set('objects', objects);

    // Load textures
    const imgKeys = Object.entries(GameConfig.ASSETS.IMAGES);
    let loaded = 0;
    await Promise.all(imgKeys.map(([k, url]) =>
      this._loadTexture(url).then(t => {
        this._textures.set(k, t);
        onProgress?.((++loaded / imgKeys.length) * 100);
      })
    ));
  }

  private _loadGLTF(url: string): Promise<any> {
    return new Promise((res, rej) => this._loader.load(url, res, undefined, rej));
  }

  private _loadTexture(url: string): Promise<THREE.Texture> {
    return new Promise((res, rej) => this._texLoader.load(url, res, undefined, rej));
  }

  getGLTF(key: string): any {
    const g = this._gltfs.get(key);
    if (!g) throw new Error(`GLTF '${key}' not loaded`);
    return g;
  }

  getTexture(key: string): THREE.Texture | undefined {
    return this._textures.get(key);
  }
}

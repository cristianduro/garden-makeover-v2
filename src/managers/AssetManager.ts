import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GameConfig } from '../core/GameConfig';

export class AssetManager {
  private gltfs   = new Map<string, any>();
  private textureCache = new Map<string, THREE.Texture>();
  private gltfLoader  = new GLTFLoader();
  private textureLoader = new THREE.TextureLoader();

  async loadAll(onProgress?: (pct: number) => void): Promise<void> {
    const [ground, objects] = await Promise.all([
      this.loadGLTF(GameConfig.ASSETS.GROUND_GLB),
      this.loadGLTF(GameConfig.ASSETS.OBJECTS_GLB),
    ]);
    this.gltfs.set('ground',  ground);
    this.gltfs.set('objects', objects);

    const imgKeys = Object.entries(GameConfig.ASSETS.IMAGES);
    let loaded = 0;
    await Promise.all(imgKeys.map(([k, url]) =>
      this.loadTexture(url).then(texture => {
        this.textureCache.set(k, texture);
        onProgress?.((++loaded / imgKeys.length) * 100);
      })
    ));
  }

  private loadGLTF(url: string): Promise<any> {
    return new Promise((res, rej) => this.gltfLoader.load(url, res, undefined, rej));
  }

  private loadTexture(url: string): Promise<THREE.Texture> {
    return new Promise((res, rej) => this.textureLoader.load(url, res, undefined, rej));
  }

  getGLTF(key: string): any {
    const gltf = this.gltfs.get(key);
    if (!gltf) throw new Error(`GLTF '${key}' not loaded`);
    return gltf;
  }

  getTexture(key: string): THREE.Texture | undefined {
    return this.textureCache.get(key);
  }
}

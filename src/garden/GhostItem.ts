import * as THREE from 'three';
import { GameConfig } from '../core/GameConfig';

export class GhostItem {
  private _obj:    THREE.Object3D | null = null;
  private _scene:  THREE.Scene;
  private _valid   = true;
  private _feetY   = 0;
  private _scale   = 1;

  constructor(scene: THREE.Scene) { this._scene = scene; }

  setMesh(source: THREE.Object3D, scale: number, feetY: number): void {
    this.remove();
    this._feetY = feetY;
    this._scale = scale;

    const obj = source.clone(true);
    obj.scale.setScalar(scale);
    obj.traverse((o: THREE.Object3D) => {
      if (o instanceof THREE.Mesh) {
        o.material = new THREE.MeshStandardMaterial({
          color: 0x44ff77, transparent: true, opacity: 0.55,
          emissive: 0x22cc44, emissiveIntensity: 0.3, depthWrite: false,
        });
        o.castShadow = false;
      }
    });
    this._scene.add(obj);
    this._obj = obj;
  }

  moveTo(x: number, z: number, valid: boolean): void {
    if (!this._obj) return;
    this._valid = valid;
    // Feet are at Y≈0 in GLB world space → place at GRID_Y directly
    this._obj.position.set(x, GameConfig.GRID_Y, z);
    const color   = valid ? 0x44ff77 : 0xff3333;
    const emissive = valid ? 0x22cc44 : 0xaa1111;
    this._obj.traverse((o: THREE.Object3D) => {
      if (o instanceof THREE.Mesh) {
        const m = o.material as THREE.MeshStandardMaterial;
        m.color.setHex(color);
        m.emissive.setHex(emissive);
      }
    });
  }

  hide(): void { if (this._obj) this._obj.visible = false; }
  show(): void { if (this._obj) this._obj.visible = true; }
  get isValid(): boolean { return this._valid; }

  remove(): void {
    if (this._obj) { this._scene.remove(this._obj); this._obj = null; }
  }

  update(): void {
    if (!this._obj) return;
    const pulse = 0.45 + Math.sin(Date.now() * 0.006) * 0.12;
    this._obj.traverse((o: THREE.Object3D) => {
      if (o instanceof THREE.Mesh) {
        (o.material as THREE.MeshStandardMaterial).opacity = pulse;
      }
    });
  }
}

import * as THREE from 'three';
import { GameConfig } from '../core/GameConfig';

export class GhostItem {
  private object3d:   THREE.Object3D | null = null;
  private scene:      THREE.Scene;
  private valid      = true;
  private feetY      = 0;
  private targetScale = 1;

  constructor(scene: THREE.Scene) { this.scene = scene; }

  setMesh(source: THREE.Object3D, scale: number, feetY: number): void {
    this.remove();
    this.feetY = feetY;
    this.targetScale = scale;

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
    this.scene.add(obj);
    this.object3d = obj;
  }

  moveTo(x: number, z: number, valid: boolean): void {
    if (!this.object3d) return;
    this.valid = valid;
    this.object3d.position.set(x, GameConfig.GRID_Y, z);
    const color    = valid ? 0x44ff77 : 0xff3333;
    const emissive = valid ? 0x22cc44 : 0xaa1111;
    this.object3d.traverse((o: THREE.Object3D) => {
      if (o instanceof THREE.Mesh) {
        const material = o.material as THREE.MeshStandardMaterial;
        material.color.setHex(color);
        material.emissive.setHex(emissive);
      }
    });
  }

  hide(): void { if (this.object3d) this.object3d.visible = false; }
  show(): void { if (this.object3d) this.object3d.visible = true; }
  get isValid(): boolean { return this.valid; }

  remove(): void {
    if (this.object3d) { this.scene.remove(this.object3d); this.object3d = null; }
  }

  update(): void {
    if (!this.object3d) return;
    const pulse = 0.45 + Math.sin(Date.now() * 0.006) * 0.12;
    this.object3d.traverse((o: THREE.Object3D) => {
      if (o instanceof THREE.Mesh) {
        (o.material as THREE.MeshStandardMaterial).opacity = pulse;
      }
    });
  }
}

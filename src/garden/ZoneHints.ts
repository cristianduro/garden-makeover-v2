import * as THREE from 'three';
import { GardenGrid } from './GardenGrid';
import { GameConfig } from '../core/GameConfig';

export class ZoneHints {
  private scene:       THREE.Scene;
  private fieldGrid:   GardenGrid;
  private fenceGrid:   GardenGrid;

  private fieldPlusSprite!:  THREE.Sprite;
  private fencePlusSprite!:  THREE.Sprite;
  private fieldPlusHidden = false;
  private fencePlusHidden = false;

  private overlayPool: THREE.Mesh[] = [];
  private overlayGroup = new THREE.Group();

  private placingMode = false;
  private placingZone: 'field' | 'fence' | null = null;

  constructor(scene: THREE.Scene, fieldGrid: GardenGrid, fenceGrid: GardenGrid) {
    this.scene     = scene;
    this.fieldGrid = fieldGrid;
    this.fenceGrid = fenceGrid;
    scene.add(this.overlayGroup);
    this.buildPlusSprites();
  }

  private buildPlusSprites(): void {
    this.fieldPlusSprite = this.makePlus();
    this.fieldPlusSprite.position.set(
      this.fieldGrid.centerX,
      GameConfig.GRID_Y + 3.5,
      this.fieldGrid.centerZ,
    );
    this.scene.add(this.fieldPlusSprite);

    this.fencePlusSprite = this.makePlus();
    this.fencePlusSprite.position.set(
      this.fenceGrid.centerX,
      GameConfig.GRID_Y + 3.0,
      this.fenceGrid.centerZ,
    );
    this.scene.add(this.fencePlusSprite);
  }

  private makePlus(): THREE.Sprite {
    const tex = new THREE.TextureLoader().load('/assets/images/plus.png');
    const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, sizeAttenuation: true, transparent: true });
    const spr = new THREE.Sprite(mat);
    spr.scale.set(3.2, 3.2, 1);
    return spr;
  }

  enterPlacingMode(zone: 'field' | 'fence'): void {
    this.placingMode = true;
    this.placingZone = zone;
    this.fieldPlusSprite.visible = false;
    this.fencePlusSprite.visible = false;
    this.rebuildOverlays();
  }

  exitPlacingMode(): void {
    this.placingMode = false;
    this.placingZone = null;
    if (!this.fieldPlusHidden) this.fieldPlusSprite.visible = true;
    if (!this.fencePlusHidden) this.fencePlusSprite.visible = true;
    this.clearOverlays();
  }

  highlightCell(gx: number, gz: number, grid: GardenGrid): void {
    if (!this.placingMode) return;
    this.rebuildOverlays(gx, gz, grid);
  }

  private rebuildOverlays(hoverGx = -1, hoverGz = -1, hoverGrid?: GardenGrid): void {
    this.clearOverlays();
    if (!this.placingZone) return;

    const grid  = this.placingZone === 'field' ? this.fieldGrid : this.fenceGrid;
    const slots = this.placingZone === 'fence'
      ? this.allSlots(grid).filter(s => !GameConfig.FENCE_EXCLUDE.some((e: {gx:number,gz:number}) => e.gx === s.gx && e.gz === s.gz))
      : this.allSlots(grid);

    for (const { gx, gz } of slots) {
      const { wx, wz } = grid.gridToWorld(gx, gz);
      const occupied   = grid.isOccupied(gx, gz);
      const isHover    = hoverGrid === grid && hoverGx === gx && hoverGz === gz;

      let color   = occupied ? 0x882222 : 0x22aa44;
      let opacity = 0.38;
      if (isHover && !occupied) { color = 0x55ff77; opacity = 0.70; }
      if (isHover &&  occupied) { color = 0xff4444; opacity = 0.70; }

      const mesh = this.getOverlay(grid.cellSize);
      mesh.position.set(wx, GameConfig.GRID_Y + 0.05, wz);
      const mat = mesh.material as THREE.MeshBasicMaterial;
      mat.color.setHex(color);
      mat.opacity  = opacity;
      mesh.visible = true;
      this.overlayGroup.add(mesh);
    }
  }

  private allSlots(grid: GardenGrid): { gx: number; gz: number }[] {
    const out: { gx: number; gz: number }[] = [];
    for (let gz = 0; gz < grid.rows; gz++)
      for (let gx = 0; gx < grid.cols; gx++)
        out.push({ gx, gz });
    return out;
  }

  private getOverlay(cs?: number): THREE.Mesh {
    const existing = this.overlayPool.find(m => !m.visible);
    if (existing) return existing;

    if (cs === undefined) cs = (this.placingZone === 'fence' ? this.fenceGrid : this.fieldGrid).cellSize;
    const geo = new THREE.PlaneGeometry(cs * 0.88, cs * 0.88);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x22aa44, transparent: true, opacity: 0.35,
      depthWrite: false, side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    this.overlayPool.push(mesh);
    return mesh;
  }

  private clearOverlays(): void {
    this.overlayPool.forEach(mesh => {
      mesh.visible = false;
      this.overlayGroup.remove(mesh);
    });
  }

  update(dt: number): void {
    const time = Date.now() * 0.002;
    if (this.fieldPlusSprite.visible) this.fieldPlusSprite.position.y = GameConfig.GRID_Y + 3.5 + Math.sin(time) * 0.25;
    if (this.fencePlusSprite.visible) this.fencePlusSprite.position.y = GameConfig.GRID_Y + 3.0 + Math.sin(time + 1) * 0.25;
  }

  /** Permanently hide the + for a zone after something is placed */
  hidePlus(zone: 'field' | 'fence'): void {
    if (zone === 'field') { this.fieldPlusHidden = true;  this.fieldPlusSprite.visible = false; }
    else                  { this.fencePlusHidden = true;  this.fencePlusSprite.visible = false; }
  }

  dispose(): void {
    this.scene.remove(this.fieldPlusSprite);
    this.scene.remove(this.fencePlusSprite);
    this.scene.remove(this.overlayGroup);
  }
}

import * as THREE from 'three';
import { GardenGrid } from './GardenGrid';
import { GameConfig } from '../core/GameConfig';

/**
 * ZoneHints — shows the two "+" sprites floating over each zone,
 * plus green/red tile overlays during placement mode.
 */
export class ZoneHints {
  private _scene:       THREE.Scene;
  private _fieldGrid:   GardenGrid;
  private _fenceGrid:   GardenGrid;

  // The two big + sprites
  private _fieldPlus!:  THREE.Sprite;
  private _fencePlus!:  THREE.Sprite;
  private _fieldPlusHidden = false;
  private _fencePlusHidden = false;

  // Tile overlays (pool reuse)
  private _overlayPool: THREE.Mesh[] = [];
  private _overlayGroup = new THREE.Group();

  private _placingMode = false;
  private _placingZone: 'field' | 'fence' | null = null;



  constructor(scene: THREE.Scene, fieldGrid: GardenGrid, fenceGrid: GardenGrid) {
    this._scene     = scene;
    this._fieldGrid = fieldGrid;
    this._fenceGrid = fenceGrid;
    scene.add(this._overlayGroup);
    this._buildPlusSprites();
  }

  private _buildPlusSprites(): void {
    this._fieldPlus = this._makePlus();
    this._fieldPlus.position.set(
      this._fieldGrid.centerX,
      GameConfig.GRID_Y + 3.5,
      this._fieldGrid.centerZ,
    );
    this._scene.add(this._fieldPlus);

    this._fencePlus = this._makePlus();
    this._fencePlus.position.set(
      this._fenceGrid.centerX,
      GameConfig.GRID_Y + 3.0,
      this._fenceGrid.centerZ,
    );
    this._scene.add(this._fencePlus);
  }

  private _makePlus(): THREE.Sprite {
    const tex = new THREE.TextureLoader().load('/assets/images/plus.png');
    const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, sizeAttenuation: true, transparent: true });
    const spr = new THREE.Sprite(mat);
    spr.scale.set(3.2, 3.2, 1);
    return spr;
  }

  enterPlacingMode(zone: 'field' | 'fence'): void {
    this._placingMode = true;
    this._placingZone = zone;
    this._fieldPlus.visible = false;
    this._fencePlus.visible = false;
    this._rebuildOverlays();
  }

  exitPlacingMode(): void {
    this._placingMode = false;
    this._placingZone = null;
    if (!this._fieldPlusHidden) this._fieldPlus.visible = true;
    if (!this._fencePlusHidden) this._fencePlus.visible = true;
    this._clearOverlays();
  }

  highlightCell(gx: number, gz: number, grid: GardenGrid): void {
    if (!this._placingMode) return;
    this._rebuildOverlays(gx, gz, grid);
  }

  private _rebuildOverlays(hoverGx = -1, hoverGz = -1, hoverGrid?: GardenGrid): void {
    this._clearOverlays();
    if (!this._placingZone) return;

    const grid  = this._placingZone === 'field' ? this._fieldGrid : this._fenceGrid;
    const slots = this._placingZone === 'fence'
      ? this._allSlots(grid).filter(s => !GameConfig.FENCE_EXCLUDE.some((e: {gx:number,gz:number}) => e.gx === s.gx && e.gz === s.gz))
      : this._allSlots(grid);

    for (const { gx, gz } of slots) {
      const { wx, wz } = grid.gridToWorld(gx, gz);
      const occupied   = grid.isOccupied(gx, gz);
      const isHover    = hoverGrid === grid && hoverGx === gx && hoverGz === gz;

      let color   = occupied ? 0x882222 : 0x22aa44;
      let opacity = 0.38;
      if (isHover && !occupied) { color = 0x55ff77; opacity = 0.70; }
      if (isHover &&  occupied) { color = 0xff4444; opacity = 0.70; }

      const mesh = this._getOverlay(grid.cellSize);
      mesh.position.set(wx, GameConfig.GRID_Y + 0.05, wz);
      const mat = mesh.material as THREE.MeshBasicMaterial;
      mat.color.setHex(color);
      mat.opacity  = opacity;
      mesh.visible = true;
      this._overlayGroup.add(mesh);
    }
  }

  private _allSlots(grid: GardenGrid): { gx: number; gz: number }[] {
    const out: { gx: number; gz: number }[] = [];
    for (let gz = 0; gz < grid.rows; gz++)
      for (let gx = 0; gx < grid.cols; gx++)
        out.push({ gx, gz });
    return out;
  }

  private _getOverlay(cs?: number): THREE.Mesh {
    const existing = this._overlayPool.find(m => !m.visible);
    if (existing) return existing;

    if (cs === undefined) cs = (this._placingZone === 'fence' ? this._fenceGrid : this._fieldGrid).cellSize;
    const geo = new THREE.PlaneGeometry(cs * 0.88, cs * 0.88);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x22aa44, transparent: true, opacity: 0.35,
      depthWrite: false, side: THREE.DoubleSide,
    });
    const m = new THREE.Mesh(geo, mat);
    this._overlayPool.push(m);
    return m;
  }

  private _clearOverlays(): void {
    this._overlayPool.forEach(m => {
      m.visible = false;
      this._overlayGroup.remove(m);
    });
  }

  update(dt: number): void {
    // Bob the + sprites
    const t = Date.now() * 0.002;
    if (this._fieldPlus.visible) this._fieldPlus.position.y = GameConfig.GRID_Y + 3.5 + Math.sin(t) * 0.25;
    if (this._fencePlus.visible) this._fencePlus.position.y = GameConfig.GRID_Y + 3.0 + Math.sin(t + 1) * 0.25;
  }

  /** Permanently hide the + for a zone after something is placed */
  hidePlus(zone: 'field' | 'fence'): void {
    if (zone === 'field') { this._fieldPlusHidden = true;  this._fieldPlus.visible = false; }
    else                  { this._fencePlusHidden = true;  this._fencePlus.visible = false; }
  }

  dispose(): void {
    this._scene.remove(this._fieldPlus);
    this._scene.remove(this._fencePlus);
    this._scene.remove(this._overlayGroup);
  }
}

import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { GameState }  from './GameState';
import { Game }       from '../core/Game';
import { GameConfig } from '../core/GameConfig';
import { GardenGrid } from '../garden/GardenGrid';
import { ZoneHints }  from '../garden/ZoneHints';
import { GhostItem }  from '../garden/GhostItem';
import { DayNightTransition } from '../lighting/DayNightTransition';
import { ItemData }   from '../garden/ItemCatalog';

export class PlayState extends GameState {
  private _fieldGrid!: GardenGrid;
  private _fenceGrid!: GardenGrid;
  private _dayNight!: DayNightTransition;
  private _zoneHints!: ZoneHints;
  private _ghost!:     GhostItem;

  private _placed: Array<{ obj: THREE.Object3D; mixer?: THREE.AnimationMixer }> = [];

  private _ray   = new THREE.Raycaster();
  private _mouse = new THREE.Vector2();
  private _groundPlane = new THREE.Plane(new THREE.Vector3(0,1,0), -GameConfig.GRID_Y);

  private _pointerDown      = false;
  private _pointerDragDist  = 0;
  private _lastPX = 0;
  private _lastPY = 0;

  private _selItem: ItemData | null = null;

  constructor(game: Game) { super(game); }

  enter(): void {
    const game = this._game as Game;
    const cfg  = GameConfig;

    this._fieldGrid = new GardenGrid(
      cfg.FIELD.COLS, cfg.FIELD.ROWS, cfg.FIELD.CELL_SIZE,
      cfg.FIELD.OFFSET_X, cfg.FIELD.OFFSET_Z, cfg.GRID_Y, 'field'
    );
    this._fenceGrid = new GardenGrid(
      cfg.FENCE.COLS, cfg.FENCE.ROWS, cfg.FENCE.CELL_SIZE,
      cfg.FENCE.OFFSET_X, cfg.FENCE.OFFSET_Z, cfg.GRID_Y, 'fence'
    );

    this._zoneHints = new ZoneHints(game.sceneManager.scene, this._fieldGrid, this._fenceGrid);

    // Day→Night transition system
    const sm = game.sceneManager;
    this._dayNight = new DayNightTransition(
      sm.scene, sm.renderer, sm.ambient, sm.sun, sm.fill
    );
    this._ghost     = new GhostItem(game.sceneManager.scene);

    game.sceneManager.setControlsEnabled(true);
    game.uiManager.on('itemSelected', this._onItemSelected);

    const cv = game.sceneManager.renderer.domElement;
    cv.addEventListener('pointerdown', this._onPointerDown);
    cv.addEventListener('pointermove', this._onPointerMove);
    cv.addEventListener('pointerup',   this._onPointerUp);
  }

  private _onItemSelected = (item: ItemData | null): void => {
    const game = this._game as Game;
    this._selItem = item;

    if (item) {
      const { MAX_ANIMALS, MAX_PLANTS } = GameConfig;
      if (item.zone === 'fence' && game.uiManager.animalCount >= MAX_ANIMALS) {
        game.uiManager.showUpgradeModal('animals');
        game.uiManager.clearSelection();
        return;
      }
      if (item.zone === 'field' && game.uiManager.plantCount >= MAX_PLANTS) {
        game.uiManager.showUpgradeModal('plants');
        game.uiManager.clearSelection();
        return;
      }

      this._zoneHints.enterPlacingMode(item.zone);
      game.sceneManager.setControlsEnabled(true);

      try {
        const { scene: s } = game.assetManager.getGLTF('objects');
        const src = s.getObjectByName(item.nodeName);
        if (src) this._ghost.setMesh(src, item.scale, item.feetY);
      } catch(e) { /* noop */ }
    } else {
      this._zoneHints.exitPlacingMode();
      this._ghost.remove();
      game.sceneManager.setControlsEnabled(true);
    }
  };

  private _onPointerDown = (e: PointerEvent): void => {
    this._pointerDown     = true;
    this._pointerDragDist = 0;
    this._lastPX = e.clientX;
    this._lastPY = e.clientY;
  };

  private _onPointerMove = (e: PointerEvent): void => {
    if (this._pointerDown) {
      const dx = e.clientX - this._lastPX;
      const dy = e.clientY - this._lastPY;
      this._pointerDragDist += Math.sqrt(dx*dx + dy*dy);
      this._lastPX = e.clientX;
      this._lastPY = e.clientY;
    }
    if (!this._selItem) return;
    this._updateGhost(e.clientX, e.clientY);
  };

  private _onPointerUp = (e: PointerEvent): void => {
    if (!this._pointerDown) return;
    this._pointerDown = false;
    if (this._pointerDragDist > 10 || !this._selItem) return;
    this._tryPlace(e.clientX, e.clientY);
  };



  private _updateGhost(cx: number, cy: number): void {
    if (!this._selItem) return;
    const hit = this._raycastGround(cx, cy);
    if (!hit) { this._ghost.hide(); return; }

    const grid = this._getGrid(this._selItem.zone);

    if (this._selItem.zone === 'fence') {
      // Snap to grid cell under cursor, same as field
      const fw = GameConfig.FENCE_WORLD;
      const inPen = hit.x >= fw.xMin && hit.x <= fw.xMax && hit.z >= fw.zMin && hit.z <= fw.zMax;
      if (!inPen) { this._ghost.hide(); return; }
      const { gx, gz } = grid.worldToGrid(hit.x, hit.z);
      const excluded = GameConfig.FENCE_EXCLUDE.some((e: {gx:number,gz:number}) => e.gx === gx && e.gz === gz);
      const valid = grid.isValid(gx, gz) && !grid.isOccupied(gx, gz) && !excluded;
      if (grid.isValid(gx, gz)) {
        const { wx, wz } = grid.gridToWorld(gx, gz);
        this._ghost.moveTo(wx, wz, valid);
      } else {
        this._ghost.moveTo(hit.x, hit.z, false);
      }
      this._ghost.show();
      this._zoneHints.highlightCell(gx, gz, grid);
    } else {
      const { gx, gz } = grid.worldToGrid(hit.x, hit.z);
      const valid = grid.isValid(gx, gz) && !grid.isOccupied(gx, gz);
      if (valid) {
        const { wx, wz } = grid.gridToWorld(gx, gz);
        this._ghost.moveTo(wx, wz, true);
      } else {
        this._ghost.moveTo(hit.x, hit.z, false);
      }
      this._ghost.show();
      this._zoneHints.highlightCell(gx, gz, grid);
    }
  }



  private _tryPlace(cx: number, cy: number): void {
    if (!this._selItem) return;
    const game = this._game as Game;
    const hit  = this._raycastGround(cx, cy);
    if (!hit) return;

    const grid = this._getGrid(this._selItem.zone);
    let gx: number, gz: number;
    if (this._selItem.zone === 'fence') {
      // Only allow placement inside the real pen world bounds
      const fw = GameConfig.FENCE_WORLD;
      if (hit.x < fw.xMin || hit.x > fw.xMax || hit.z < fw.zMin || hit.z > fw.zMax) {
        game.uiManager.showToast('🐄 Place animals inside the pen!');
        return;
      }
      // Also reject clicks on excluded cells (troughs/obstacles)
      const { gx: hgx, gz: hgz } = this._fenceGrid.worldToGrid(hit.x, hit.z);
      const isExcluded = GameConfig.FENCE_EXCLUDE.some((e: {gx:number,gz:number}) => e.gx === hgx && e.gz === hgz);
      if (isExcluded) {
        game.uiManager.showToast('🚫 Something is in the way!');
        return;
      }
      ({ gx, gz } = grid.worldToGrid(hit.x, hit.z));
    } else {
      ({ gx, gz } = grid.worldToGrid(hit.x, hit.z));
    }

    if (this._selItem.zone === 'fence') {
      const excl = GameConfig.FENCE_EXCLUDE.some((e: {gx:number,gz:number}) => e.gx === gx && e.gz === gz);
      if (excl) { game.uiManager.showToast('🚫 Something is in the way!'); return; }
    }
    if (!grid.isValid(gx, gz) || grid.isOccupied(gx, gz)) {
      game.uiManager.showToast('❌ Cannot place here!');
      return;
    }

    const { wx, wz } = grid.gridToWorld(gx, gz);
    this._placeItem(this._selItem, wx, wz, gx, gz, grid);

    const canvas = game.sceneManager.renderer.domElement;
    const rect   = canvas.getBoundingClientRect();
    game.uiManager.onItemPlaced(this._selItem.name, this._selItem.cost, cx - rect.left, cy - rect.top);
    game.uiManager.incrementCount(this._selItem.zone);
    game.audioManager.play(this._selItem.soundKey ?? 'click');

    const placedItem = this._selItem;
    game.uiManager.clearSelection();

    const { MAX_ANIMALS, MAX_PLANTS } = GameConfig;
    if (placedItem.zone === 'fence' && game.uiManager.animalCount >= MAX_ANIMALS) {
      setTimeout(() => game.uiManager.showUpgradeModal('animals'), 600);
    } else if (placedItem.zone === 'field' && game.uiManager.plantCount >= MAX_PLANTS) {
      setTimeout(() => game.uiManager.showUpgradeModal('plants'), 600);
    }

    // Mostrar botón Skip Day tras el primer placement
    const total = game.uiManager.animalCount + game.uiManager.plantCount;
    if (total >= 1) {
      this._skipDay();
    }
  }



  /** Muestra el botón Skip. Al pulsarlo: día→noche (2.2s) → pausa 2s → noche→día (2.2s) → botón de nuevo */
  private _skipDay(): void {
    const game = this._game as Game;
    game.uiManager.showSkipDay(() => {
      if (this._dayNight.isCycleRunning) return;
      game.uiManager.hideSkipDay();
      this._dayNight.playCycle(() => {
        this._skipDay();
      }, 2.0);
    });
  }

  private _showSkipBtn(): void {
    const game = this._game as Game;
    game.uiManager.showSkipDay(() => {
      if (this._dayNight.isCycleRunning) return;
      game.uiManager.hideSkipDay();
      // Ciclo completo: día→noche (pausa 2s)→amanecer→botón aparece de nuevo
      this._dayNight.playCycle(() => {
        this._showSkipBtn();
      }, 2.0);
    });
  }

  private _placeItem(item: ItemData, wx: number, wz: number,
                     gx: number, gz: number, grid: GardenGrid): void {
    const game = this._game as Game;
    try {
      const { scene: s, animations } = game.assetManager.getGLTF('objects');
      const src = s.getObjectByName(item.nodeName);
      if (!src) { console.warn(`Node not found: ${item.nodeName}`); return; }

      // SkeletonUtils.clone is required for SkinnedMesh — preserves bone bindings
      const obj = SkeletonUtils.clone(src);

      const targetScale = item.scale;
      obj.scale.setScalar(targetScale);

      // The cloned node inherits its source local position (non-zero in the GLB).
      // Reset local position/rotation before placing so we get clean world coords.
      // Terrain surface = GRID_Y. Feet of all items are at Y≈0 in local space.
      obj.position.set(wx, GameConfig.GRID_Y, wz);
      obj.rotation.set(0, Math.random() * Math.PI * 2, 0);



      obj.traverse((o: THREE.Object3D) => {
        if (o instanceof THREE.Mesh) { o.castShadow = true; o.receiveShadow = true; }
      });
      game.sceneManager.scene.add(obj);
      grid.occupy(gx, gz);
      this._zoneHints.hidePlus(item.zone);

      let mixer: THREE.AnimationMixer | undefined;
      if (item.animIdle && animations?.length) {
        mixer = new THREE.AnimationMixer(obj);
        const clip = animations.find((a: THREE.AnimationClip) => a.name === item.animIdle);
        if (clip) mixer.clipAction(clip).play();
      }
      this._placed.push({ obj, mixer });

      // Drop-in bounce (scale only, no Y offset)
      obj.scale.setScalar(0.01);
      const start = performance.now();
      const bounce = () => {
        const t = Math.min((performance.now() - start) / 450, 1);
        obj.scale.setScalar(this._easeOutBounce(t) * targetScale);
        if (t < 1) requestAnimationFrame(bounce);
        else obj.scale.setScalar(targetScale);
      };
      bounce();

    } catch(e) { console.warn('placeItem error', e); }
  }


  private _getGrid(zone: 'field' | 'fence'): GardenGrid {
    return zone === 'field' ? this._fieldGrid : this._fenceGrid;
  }


  private _raycastGround(cx: number, cy: number): THREE.Vector3 | null {
    const game   = this._game as Game;
    const canvas = game.sceneManager.renderer.domElement;
    const rect   = canvas.getBoundingClientRect();
    this._mouse.set(
      ((cx - rect.left) / rect.width)  * 2 - 1,
      -((cy - rect.top) / rect.height) * 2 + 1,
    );
    this._ray.setFromCamera(this._mouse, game.sceneManager.camera);
    const hit = new THREE.Vector3();
    return this._ray.ray.intersectPlane(this._groundPlane, hit) ? hit : null;
  }

  update(dt: number): void {
    this._zoneHints.update(dt);
    this._dayNight.update(dt);
    this._ghost.update();
    this._placed.forEach(p => p.mixer?.update(dt));
  }

  exit(): void {
    const game = this._game as Game;
    const cv   = game.sceneManager.renderer.domElement;
    cv.removeEventListener('pointerdown', this._onPointerDown);
    cv.removeEventListener('pointermove', this._onPointerMove);
    cv.removeEventListener('pointerup',   this._onPointerUp);
    this._zoneHints.dispose();
    this._ghost.remove();
    game.uiManager.off('itemSelected', this._onItemSelected);
  }

  private _easeOutBounce(t: number): number {
    if (t < 1/2.75)       return 7.5625*t*t;
    if (t < 2/2.75)     { t -= 1.5/2.75;   return 7.5625*t*t+0.75; }
    if (t < 2.5/2.75)   { t -= 2.25/2.75;  return 7.5625*t*t+0.9375; }
                          t -= 2.625/2.75;  return 7.5625*t*t+0.984375;
  }
}

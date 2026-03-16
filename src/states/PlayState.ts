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
  private fieldGrid!: GardenGrid;
  private fenceGrid!: GardenGrid;
  private dayNight!: DayNightTransition;
  private zoneHints!: ZoneHints;
  private ghost!:     GhostItem;

  private placed: Array<{ obj: THREE.Object3D; mixer?: THREE.AnimationMixer }> = [];

  private raycaster   = new THREE.Raycaster();
  private mouseCoords = new THREE.Vector2();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0,1,0), -GameConfig.GRID_Y);

  private pointerDown       = false;
  private pointerDragDistance = 0;
  private lastPointerX = 0;
  private lastPointerY = 0;

  private selectedItem: ItemData | null = null;

  constructor(game: Game) { super(game); }

  enter(): void {
    const game = this.game as Game;

    this.fieldGrid = new GardenGrid(
      GameConfig.FIELD.COLS, GameConfig.FIELD.ROWS, GameConfig.FIELD.CELL_SIZE,
      GameConfig.FIELD.OFFSET_X, GameConfig.FIELD.OFFSET_Z, GameConfig.GRID_Y, 'field'
    );
    this.fenceGrid = new GardenGrid(
      GameConfig.FENCE.COLS, GameConfig.FENCE.ROWS, GameConfig.FENCE.CELL_SIZE,
      GameConfig.FENCE.OFFSET_X, GameConfig.FENCE.OFFSET_Z, GameConfig.GRID_Y, 'fence'
    );

    this.zoneHints = new ZoneHints(game.sceneManager.scene, this.fieldGrid, this.fenceGrid);

    const sm = game.sceneManager;
    this.dayNight = new DayNightTransition(
      sm.scene, sm.renderer, sm.ambient, sm.sun, sm.fill
    );
    this.ghost = new GhostItem(game.sceneManager.scene);

    game.sceneManager.setControlsEnabled(true);
    game.uiManager.on('itemSelected', this.onItemSelected);

    const cv = game.uiManager.canvas;
    cv.addEventListener('pointerdown', this.onPointerDown);
    cv.addEventListener('pointermove', this.onPointerMove);
    cv.addEventListener('pointerup',   this.onPointerUp);
  }

  private onItemSelected = (item: ItemData | null): void => {
    const game = this.game as Game;
    this.selectedItem = item;

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

      this.zoneHints.enterPlacingMode(item.zone);
      game.sceneManager.setControlsEnabled(true);

      try {
        const { scene: gltfScene } = game.assetManager.getGLTF('objects');
        const src = gltfScene.getObjectByName(item.nodeName);
        if (src) this.ghost.setMesh(src, item.scale, item.feetY);
      } catch(_error) { /* noop */ }
    } else {
      this.zoneHints.exitPlacingMode();
      this.ghost.remove();
      game.sceneManager.setControlsEnabled(true);
    }
  };

  private onPointerDown = (e: PointerEvent): void => {
    this.pointerDown          = true;
    this.pointerDragDistance  = 0;
    this.lastPointerX = e.clientX;
    this.lastPointerY = e.clientY;
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (this.pointerDown) {
      const dx = e.clientX - this.lastPointerX;
      const dy = e.clientY - this.lastPointerY;
      this.pointerDragDistance += Math.sqrt(dx*dx + dy*dy);
      this.lastPointerX = e.clientX;
      this.lastPointerY = e.clientY;
    }
    if (!this.selectedItem) return;
    this.updateGhost(e.clientX, e.clientY);
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (!this.pointerDown) return;
    this.pointerDown = false;
    if (this.pointerDragDistance > 10 || !this.selectedItem) return;
    this.tryPlace(e.clientX, e.clientY);
  };

  private updateGhost(cx: number, cy: number): void {
    if (!this.selectedItem) return;
    const hit = this.raycastGround(cx, cy);
    if (!hit) { this.ghost.hide(); return; }

    const grid = this.getGrid(this.selectedItem.zone);

    if (this.selectedItem.zone === 'fence') {
      const fw = GameConfig.FENCE_WORLD;
      const inPen = hit.x >= fw.xMin && hit.x <= fw.xMax && hit.z >= fw.zMin && hit.z <= fw.zMax;
      if (!inPen) { this.ghost.hide(); return; }
      const { gx, gz } = grid.worldToGrid(hit.x, hit.z);
      const excluded = GameConfig.FENCE_EXCLUDE.some((e: {gx:number,gz:number}) => e.gx === gx && e.gz === gz);
      const valid = grid.isValid(gx, gz) && !grid.isOccupied(gx, gz) && !excluded;
      if (grid.isValid(gx, gz)) {
        const { wx, wz } = grid.gridToWorld(gx, gz);
        this.ghost.moveTo(wx, wz, valid);
      } else {
        this.ghost.moveTo(hit.x, hit.z, false);
      }
      this.ghost.show();
      this.zoneHints.highlightCell(gx, gz, grid);
    } else {
      const { gx, gz } = grid.worldToGrid(hit.x, hit.z);
      const valid = grid.isValid(gx, gz) && !grid.isOccupied(gx, gz);
      if (valid) {
        const { wx, wz } = grid.gridToWorld(gx, gz);
        this.ghost.moveTo(wx, wz, true);
      } else {
        this.ghost.moveTo(hit.x, hit.z, false);
      }
      this.ghost.show();
      this.zoneHints.highlightCell(gx, gz, grid);
    }
  }

  private tryPlace(cx: number, cy: number): void {
    if (!this.selectedItem) return;
    const game = this.game as Game;
    const hit  = this.raycastGround(cx, cy);
    if (!hit) return;

    const grid = this.getGrid(this.selectedItem.zone);
    let gx: number, gz: number;
    if (this.selectedItem.zone === 'fence') {
      const fw = GameConfig.FENCE_WORLD;
      if (hit.x < fw.xMin || hit.x > fw.xMax || hit.z < fw.zMin || hit.z > fw.zMax) {
        game.uiManager.showToast('🐄 Place animals inside the pen!');
        return;
      }
      const { gx: hgx, gz: hgz } = this.fenceGrid.worldToGrid(hit.x, hit.z);
      const isExcluded = GameConfig.FENCE_EXCLUDE.some((e: {gx:number,gz:number}) => e.gx === hgx && e.gz === hgz);
      if (isExcluded) {
        game.uiManager.showToast('🚫 Something is in the way!');
        return;
      }
      ({ gx, gz } = grid.worldToGrid(hit.x, hit.z));
    } else {
      ({ gx, gz } = grid.worldToGrid(hit.x, hit.z));
    }

    if (this.selectedItem.zone === 'fence') {
      const excl = GameConfig.FENCE_EXCLUDE.some((e: {gx:number,gz:number}) => e.gx === gx && e.gz === gz);
      if (excl) { game.uiManager.showToast('🚫 Something is in the way!'); return; }
    }
    if (!grid.isValid(gx, gz) || grid.isOccupied(gx, gz)) {
      game.uiManager.showToast('❌ Cannot place here!');
      return;
    }

    const { wx, wz } = grid.gridToWorld(gx, gz);
    this.placeItem(this.selectedItem, wx, wz, gx, gz, grid);

    const canvas = game.sceneManager.renderer.domElement;
    const rect   = canvas.getBoundingClientRect();
    game.uiManager.onItemPlaced(this.selectedItem.name, this.selectedItem.cost, cx - rect.left, cy - rect.top);
    game.uiManager.incrementCount(this.selectedItem.zone);
    game.audioManager.play(this.selectedItem.soundKey ?? 'click');

    const placedItem = this.selectedItem;
    game.uiManager.clearSelection();

    const { MAX_ANIMALS, MAX_PLANTS } = GameConfig;
    if (placedItem.zone === 'fence' && game.uiManager.animalCount >= MAX_ANIMALS) {
      setTimeout(() => game.uiManager.showUpgradeModal('animals'), 600);
    } else if (placedItem.zone === 'field' && game.uiManager.plantCount >= MAX_PLANTS) {
      setTimeout(() => game.uiManager.showUpgradeModal('plants'), 600);
    }

    const total = game.uiManager.animalCount + game.uiManager.plantCount;
    if (total >= 1) {
      this.skipDay();
    }
  }

  private skipDay(): void {
    const game = this.game as Game;
    game.uiManager.showSkipDay(() => {
      if (this.dayNight.isCycleRunning) return;
      game.uiManager.hideSkipDay();
      this.dayNight.playCycle(() => {
        this.skipDay();
      }, 2.0);
    });
  }

  private placeItem(item: ItemData, wx: number, wz: number,
                    gx: number, gz: number, grid: GardenGrid): void {
    const game = this.game as Game;
    try {
      const { scene: gltfScene, animations } = game.assetManager.getGLTF('objects');
      const src = gltfScene.getObjectByName(item.nodeName);
      if (!src) { console.warn(`Node not found: ${item.nodeName}`); return; }

      // SkeletonUtils.clone is required for SkinnedMesh — preserves bone bindings
      const obj = SkeletonUtils.clone(src);

      const targetScale = item.scale;
      obj.scale.setScalar(targetScale);
      obj.position.set(wx, GameConfig.GRID_Y, wz);
      obj.rotation.set(0, Math.random() * Math.PI * 2, 0);

      obj.traverse((o: THREE.Object3D) => {
        if (o instanceof THREE.Mesh) { o.castShadow = true; o.receiveShadow = true; }
      });
      game.sceneManager.scene.add(obj);
      grid.occupy(gx, gz);
      this.zoneHints.hidePlus(item.zone);

      let mixer: THREE.AnimationMixer | undefined;
      if (item.animIdle && animations?.length) {
        mixer = new THREE.AnimationMixer(obj);
        const clip = animations.find((clip: THREE.AnimationClip) => clip.name === item.animIdle);
        if (clip) mixer.clipAction(clip).play();
      }
      this.placed.push({ obj, mixer });

      obj.scale.setScalar(0.01);
      const start = performance.now();
      const bounce = () => {
        const progress = Math.min((performance.now() - start) / 450, 1);
        obj.scale.setScalar(this.easeOutBounce(progress) * targetScale);
        if (progress < 1) requestAnimationFrame(bounce);
        else obj.scale.setScalar(targetScale);
      };
      bounce();

    } catch(_error) { console.warn('placeItem error', _error); }
  }

  private getGrid(zone: 'field' | 'fence'): GardenGrid {
    return zone === 'field' ? this.fieldGrid : this.fenceGrid;
  }

  private raycastGround(cx: number, cy: number): THREE.Vector3 | null {
    const game   = this.game as Game;
    const canvas = game.sceneManager.renderer.domElement;
    const rect   = canvas.getBoundingClientRect();
    this.mouseCoords.set(
      ((cx - rect.left) / rect.width)  * 2 - 1,
      -((cy - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.mouseCoords, game.sceneManager.camera);
    const hit = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(this.groundPlane, hit) ? hit : null;
  }

  update(dt: number): void {
    this.zoneHints.update(dt);
    this.dayNight.update(dt);
    this.ghost.update();
    this.placed.forEach(p => p.mixer?.update(dt));
  }

  exit(): void {
    const game = this.game as Game;
    const cv   = game.uiManager.canvas;
    cv.removeEventListener('pointerdown', this.onPointerDown);
    cv.removeEventListener('pointermove', this.onPointerMove);
    cv.removeEventListener('pointerup',   this.onPointerUp);
    this.zoneHints.dispose();
    this.ghost.remove();
    game.uiManager.off('itemSelected', this.onItemSelected);
  }

  private easeOutBounce(progress: number): number {
    if (progress < 1/2.75)       return 7.5625*progress*progress;
    if (progress < 2/2.75)     { progress -= 1.5/2.75;   return 7.5625*progress*progress+0.75; }
    if (progress < 2.5/2.75)   { progress -= 2.25/2.75;  return 7.5625*progress*progress+0.9375; }
                                  progress -= 2.625/2.75; return 7.5625*progress*progress+0.984375;
  }
}

export type ZoneType = 'field' | 'fence';

export class GardenGrid {
  private occupied: Uint8Array;
  readonly zone: ZoneType;

  constructor(
    readonly cols:     number,
    readonly rows:     number,
    readonly cellSize: number,
    readonly originX:  number,
    readonly originZ:  number,
    readonly gridY:    number,
    zone: ZoneType,
  ) {
    this.occupied = new Uint8Array(cols * rows);
    this.zone = zone;
  }

  worldToGrid(wx: number, wz: number) {
    return {
      gx: Math.floor((wx - this.originX) / this.cellSize),
      gz: Math.floor((wz - this.originZ) / this.cellSize),
    };
  }

  gridToWorld(gx: number, gz: number) {
    return {
      wx: this.originX + gx * this.cellSize + this.cellSize / 2,
      wz: this.originZ + gz * this.cellSize + this.cellSize / 2,
    };
  }

  /** World-space center of this entire zone */
  get centerX(): number { return this.originX + (this.cols * this.cellSize) / 2; }
  get centerZ(): number { return this.originZ + (this.rows * this.cellSize) / 2; }

  isValid(gx: number, gz: number)    { return gx >= 0 && gx < this.cols && gz >= 0 && gz < this.rows; }
  isOccupied(gx: number, gz: number) { return !this.isValid(gx,gz) || this.occupied[gz*this.cols+gx]===1; }
  occupy(gx: number, gz: number)     { if (this.isValid(gx,gz)) this.occupied[gz*this.cols+gx]=1; }
  free(gx: number, gz: number)       { if (this.isValid(gx,gz)) this.occupied[gz*this.cols+gx]=0; }
  reset()                            { this.occupied.fill(0); }

  get totalCells() { return this.cols * this.rows; }
  get freeCells()  { return this.occupied.reduce((acc, val) => acc + (1 - val), 0); }
}

import * as THREE from 'three';
import { GameConfig } from '../core/GameConfig';

export class DayNightTransition {
  private scene:    THREE.Scene;
  private renderer: THREE.WebGLRenderer;
  private ambient:  THREE.AmbientLight;
  private sun:      THREE.DirectionalLight;
  private fill:     THREE.DirectionalLight;

  private running     = false;
  private cycleTimer: ReturnType<typeof setTimeout> | null = null;
  private progress  = 0;
  private duration  = 2.2;
  private reverse   = false;
  private onDone?: () => void;

  private readonly dayAmbientColor  = new THREE.Color(GameConfig.AMBIENT_DAY.color);
  private readonly daySunColor      = new THREE.Color(GameConfig.DIR_DAY.color);
  private readonly daySky           = new THREE.Color(GameConfig.SKY_DAY);
  private readonly dayFogColor      = new THREE.Color(GameConfig.FOG_DAY.color);

  private readonly nightAmbientColor = new THREE.Color(GameConfig.AMBIENT_NIGHT.color);
  private readonly nightSunColor     = new THREE.Color(GameConfig.DIR_NIGHT.color);
  private readonly nightSky          = new THREE.Color(GameConfig.SKY_NIGHT);
  private readonly nightFogColor     = new THREE.Color(GameConfig.FOG_NIGHT.color);

  private readonly sunDayPos   = new THREE.Vector3(12, 28, 18);
  private readonly sunNightPos = new THREE.Vector3(-12, 2, -18);

  constructor(
    scene:    THREE.Scene,
    renderer: THREE.WebGLRenderer,
    ambient:  THREE.AmbientLight,
    sun:      THREE.DirectionalLight,
    fill:     THREE.DirectionalLight,
  ) {
    this.scene    = scene;
    this.renderer = renderer;
    this.ambient  = ambient;
    this.sun      = sun;
    this.fill     = fill;
  }

  /** Start transition. reverse=true plays night→day. Calls onDone when complete. */
  play(onDone?: () => void, reverse = false): void {
    if (this.running) return;
    this.running  = true;
    this.progress = 0;
    this.reverse  = reverse;
    this.onDone   = onDone;
  }

  /**
   * Full day→night→day cycle.
   * Transitions to night, pauses for pauseSecs, then transitions back to day.
   */
  playCycle(onDone?: () => void, pauseSecs = 1.5): void {
    if (this.running || this.cycleTimer !== null) return;
    this.play(() => {
      this.cycleTimer = window.setTimeout(() => {
        this.cycleTimer = null;
        this.play(() => { onDone?.(); }, true);
      }, pauseSecs * 1000);
    }, false);
  }

  /** True while a cycle is in any phase (transition or pause) */
  get isCycleRunning(): boolean {
    return this.running || this.cycleTimer !== null;
  }

  /** Call every frame from the game loop. Returns true while animation is running. */
  update(dt: number): boolean {
    if (!this.running) return false;

    this.progress = Math.min(this.progress + dt / this.duration, 1);
    const nightFactor = this.easeInOut(this.reverse ? 1 - this.progress : this.progress);

    this.ambient.color.copy(this.dayAmbientColor).lerp(this.nightAmbientColor, nightFactor);
    this.ambient.intensity = THREE.MathUtils.lerp(
      GameConfig.AMBIENT_DAY.intensity, GameConfig.AMBIENT_NIGHT.intensity, nightFactor
    );

    this.sun.color.copy(this.daySunColor).lerp(this.nightSunColor, nightFactor);
    this.sun.intensity = THREE.MathUtils.lerp(
      GameConfig.DIR_DAY.intensity, GameConfig.DIR_NIGHT.intensity, nightFactor
    );
    this.sun.position.lerpVectors(this.sunDayPos, this.sunNightPos, nightFactor);

    this.fill.intensity = THREE.MathUtils.lerp(0.35, 0.05, nightFactor);

    (this.scene.background as THREE.Color).copy(this.daySky.clone().lerp(this.nightSky, nightFactor));

    if (this.scene.fog instanceof THREE.Fog) {
      this.scene.fog.color.copy(this.dayFogColor).lerp(this.nightFogColor, nightFactor);
      this.scene.fog.near = THREE.MathUtils.lerp(GameConfig.FOG_DAY.near, GameConfig.FOG_NIGHT.near, nightFactor);
      this.scene.fog.far  = THREE.MathUtils.lerp(GameConfig.FOG_DAY.far,  GameConfig.FOG_NIGHT.far,  nightFactor);
    }

    this.renderer.toneMappingExposure = THREE.MathUtils.lerp(1.05, 0.45, nightFactor);

    if (this.progress >= 1) {
      this.running = false;
      this.onDone?.();
    }

    return true;
  }

  get isRunning(): boolean { return this.running; }

  private easeInOut(progress: number): number {
    return progress * progress * (3 - 2 * progress);
  }
}

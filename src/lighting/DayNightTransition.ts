import * as THREE from 'three';
import { GameConfig } from '../core/GameConfig';

/**
 * Animates a fast day→night lighting transition.
 * Tweens ambient light, directional sun, sky color and fog.
 * The sun arc sweeps across the sky during the transition for a cinematic effect.
 */
export class DayNightTransition {
  private _scene:    THREE.Scene;
  private _renderer: THREE.WebGLRenderer;
  private _ambient:  THREE.AmbientLight;
  private _sun:      THREE.DirectionalLight;
  private _fill:     THREE.DirectionalLight;

  private _running     = false;
  private _cycleTimer: ReturnType<typeof setTimeout> | null = null;
  private _t         = 0;               // 0..1 progress
  private _duration  = 2.2;             // seconds for full transition
  private _reverse   = false;           // false = day→night, true = night→day
  private _onDone?: () => void;

  // Day state snapshot
  private readonly _dayAmbientColor  = new THREE.Color(GameConfig.AMBIENT_DAY.color);
  private readonly _daySunColor      = new THREE.Color(GameConfig.DIR_DAY.color);
  private readonly _daySky           = new THREE.Color(GameConfig.SKY_DAY);
  private readonly _dayFogColor      = new THREE.Color(GameConfig.FOG_DAY.color);

  // Night targets
  private readonly _nightAmbientColor = new THREE.Color(GameConfig.AMBIENT_NIGHT.color);
  private readonly _nightSunColor     = new THREE.Color(GameConfig.DIR_NIGHT.color);
  private readonly _nightSky          = new THREE.Color(GameConfig.SKY_NIGHT);
  private readonly _nightFogColor     = new THREE.Color(GameConfig.FOG_NIGHT.color);

  // Sun arc: starts high (day) and sweeps to horizon then below (night)
  private readonly _sunDayPos   = new THREE.Vector3(12, 28, 18);
  private readonly _sunNightPos = new THREE.Vector3(-12, 2, -18);

  constructor(
    scene:    THREE.Scene,
    renderer: THREE.WebGLRenderer,
    ambient:  THREE.AmbientLight,
    sun:      THREE.DirectionalLight,
    fill:     THREE.DirectionalLight,
  ) {
    this._scene    = scene;
    this._renderer = renderer;
    this._ambient  = ambient;
    this._sun      = sun;
    this._fill     = fill;
  }

  /** Start transition. reverse=true plays night→day. Calls onDone when complete. */
  play(onDone?: () => void, reverse = false): void {
    if (this._running) return;
    this._running = true;
    this._t       = 0;
    this._reverse = reverse;
    this._onDone  = onDone;
  }

  /**
   * Full day→night→day cycle.
   * 1) day→night (2.2s)
   * 2) pause at night (pauseSecs)
   * 3) night→day (2.2s)
   * 4) calls onDone
   */
  playCycle(onDone?: () => void, pauseSecs = 1.5): void {
    if (this._running || this._cycleTimer !== null) return;
    // Phase 1: day → night
    this.play(() => {
      // Phase 2: pause at night, then reverse
      this._cycleTimer = window.setTimeout(() => {
        this._cycleTimer = null;
        // Phase 3: night → day
        this.play(() => {
          onDone?.();
        }, true);
      }, pauseSecs * 1000);
    }, false);
  }

  /** True while a cycle is in any phase (transition or pause) */
  get isCycleRunning(): boolean {
    return this._running || this._cycleTimer !== null;
  }

  /** Call every frame from the game loop. Returns true while animation is running. */
  update(dt: number): boolean {
    if (!this._running) return false;

    this._t += dt / this._duration;

    if (this._t >= 1) {
      this._t = 1;
      this._running = false;
    }

    // Use an ease-in-out curve for smooth but fast feel
    // Reverse: night→day interpolates from 1 back to 0
    const e = this._reverse
      ? this._easeInOut(1 - this._t)
      : this._easeInOut(this._t);

    // ── Ambient light ──────────────────────────────────────────────
    this._ambient.color.copy(this._dayAmbientColor).lerp(this._nightAmbientColor, e);
    this._ambient.intensity = THREE.MathUtils.lerp(
      GameConfig.AMBIENT_DAY.intensity,
      GameConfig.AMBIENT_NIGHT.intensity, e
    );

    // ── Sun (directional) ──────────────────────────────────────────
    this._sun.color.copy(this._daySunColor).lerp(this._nightSunColor, e);
    this._sun.intensity = THREE.MathUtils.lerp(
      GameConfig.DIR_DAY.intensity,
      GameConfig.DIR_NIGHT.intensity, e
    );

    // Sun arc across the sky
    this._sun.position.lerpVectors(this._sunDayPos, this._sunNightPos, e);

    // ── Fill light fades out ───────────────────────────────────────
    this._fill.intensity = THREE.MathUtils.lerp(0.35, 0.05, e);

    // ── Sky background ─────────────────────────────────────────────
    const skyColor = this._daySky.clone().lerp(this._nightSky, e);
    (this._scene.background as THREE.Color).copy(skyColor);

    // ── Fog ────────────────────────────────────────────────────────
    if (this._scene.fog instanceof THREE.Fog) {
      this._scene.fog.color.copy(this._dayFogColor).lerp(this._nightFogColor, e);
      this._scene.fog.near  = THREE.MathUtils.lerp(GameConfig.FOG_DAY.near,  GameConfig.FOG_NIGHT.near,  e);
      this._scene.fog.far   = THREE.MathUtils.lerp(GameConfig.FOG_DAY.far,   GameConfig.FOG_NIGHT.far,   e);
    }

    // ── Stars flash on as night approaches ────────────────────────
    // (simple renderer tone-mapping exposure drop)
    this._renderer.toneMappingExposure = THREE.MathUtils.lerp(1.05, 0.45, e);

    if (!this._running) {
      this._onDone?.();
    }

    return true;
  }

  get isRunning(): boolean { return this._running; }

  private _easeInOut(t: number): number {
    // Smooth step — slow start and end, fast middle
    return t * t * (3 - 2 * t);
  }
}

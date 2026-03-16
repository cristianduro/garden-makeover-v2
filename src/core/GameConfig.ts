export const GameConfig = {
  GRID_Y: 4.05,

  // ── FIELD zone — campo abierto completo X[-13..4.6] Z[-8..7.4] ──────────
  FIELD: {
    COLS:      8,
    ROWS:      7,
    CELL_SIZE: 2.2,
    OFFSET_X: -13.0,
    OFFSET_Z:  -8.0,
  },

  // ── FENCE zone — pen interior medido X[4.8..13.8] Z[-7..5] ─────────────
  // Grid 3×4, cell 3.0u
  // Troughs en X≈8-11.5, Z≈-6.5 a -4.5 → row gz=0 cols gx=1,gx=2 excluidos
  FENCE: {
    COLS:      3,
    ROWS:      4,
    CELL_SIZE: 3.0,
    OFFSET_X:  4.8,
    OFFSET_Z: -7.0,
  },

  // Zona de exclusión: troughs/bebederos (row 0, cols 1 y 2)
  FENCE_EXCLUDE: [
    { gx: 1, gz: 0 },
    { gx: 2, gz: 0 },
  ] as Array<{gx:number, gz:number}>,

  // ── World bounds del pen para validar click ──────────────────────────────
  FENCE_WORLD: {
    xMin: 3.8,  xMax: 15.8,
    zMin: -8.5, zMax:  7.5,
  },

  // ── Limits ───────────────────────────────────────────────────────────────
  MAX_ANIMALS: 4,
  MAX_PLANTS:  4,

  // ── Camera ───────────────────────────────────────────────────────────────
  CAM_FOV:    52,
  CAM_NEAR:   1,
  CAM_FAR:    250,
  CAM_POS:    { x: -1, y: 32, z: 32 },
  CAM_TARGET: { x: -1, y: 4.0, z: -6 },
  CAM_MIN_POLAR: 0.25,
  CAM_MAX_POLAR: 1.05,  // ~60° — impide ver bajo el suelo
  CAM_MIN_DIST:  14,
  CAM_MAX_DIST:  60,

  // ── Lighting ─────────────────────────────────────────────────────────────
  AMBIENT_DAY:   { color: 0xfff4e0, intensity: 0.75 },
  DIR_DAY:       { color: 0xfffbe8, intensity: 1.4 },
  SKY_DAY:       0x87ceeb,
  FOG_DAY:       { color: 0x87ceeb, near: 80, far: 160 },
  AMBIENT_NIGHT: { color: 0x202840, intensity: 0.35 },
  DIR_NIGHT:     { color: 0x3a5080, intensity: 0.5 },
  SKY_NIGHT:     0x07081a,
  FOG_NIGHT:     { color: 0x07081a, near: 60, far: 130 },

  // ── Gameplay ─────────────────────────────────────────────────────────────
  START_COINS: 500,

  // ── Tutorial camera waypoints ────────────────────────────────────────────
  // Landscape cameras (aspect >= 1)
  TUTORIAL_CAMS: [
    { pos: { x:-1,  y:9,  z:18 }, target: { x:-1, y:5, z:2  } },
    { pos: { x:-6,  y:18, z:8  }, target: { x:-4, y:4, z:-2 } },
    { pos: { x:12,  y:16, z:2  }, target: { x:9,  y:4, z:-7 } },
    { pos: { x:-1,  y:9,  z:18 }, target: { x:-1, y:5, z:2  } },
  ],

  // Portrait cameras (aspect < 1) — pulled back more so scene fits narrow viewport
  TUTORIAL_CAMS_PORTRAIT: [
    { pos: { x:-1,  y:18, z:28 }, target: { x:-1, y:4, z:0  } },
    { pos: { x:-6,  y:28, z:14 }, target: { x:-4, y:4, z:-2 } },
    { pos: { x:12,  y:26, z:8  }, target: { x:9,  y:4, z:-7 } },
    { pos: { x:-1,  y:18, z:28 }, target: { x:-1, y:4, z:0  } },
  ],

  // ── Assets ───────────────────────────────────────────────────────────────
  ASSETS: {
    GROUND_GLB:  '/assets/gltf/ground.glb',
    OBJECTS_GLB: '/assets/gltf/objects.glb',
    IMAGES: {
      corn:       '/assets/images/corn.png',
      cow:        '/assets/images/cow.png',
      grape:      '/assets/images/grape.png',
      sheep:      '/assets/images/sheep.png',
      strawberry: '/assets/images/strawberry.png',
      tomato:     '/assets/images/tomato.png',
      money:      '/assets/images/money.png',
      chicken:    '/assets/images/chicken.png',
    },
    SOUNDS: {
      theme:   '/assets/sounds/theme.mp3',
      chicken: '/assets/sounds/chicken.mp3',
      cow:     '/assets/sounds/cow.mp3',
      sheep:   '/assets/sounds/sheep.mp3',
      click:   '/assets/sounds/click_003.mp3',
      popup:   '/assets/sounds/popup_chest.mp3',
    },
  },
} as const;

// Motor de Arena Z. Port del bucle de juego del prototipo
// references/started-games/010-zombie/arena-zombie-prototipo.html a una
// factoría con todo el estado en el closure (montable/desmontable en React).

import { createAudio } from "./audio";
import { bossForFloor, isBossWave } from "./bosses";
import { drawBoss, drawBossGround, drawBossHealthBar } from "./bosses-draw";
import {
  damageBoss,
  isBossIntangible,
  isBossWeak,
  spawnBoss,
  updateBoss,
  type BossContext,
  type BossState,
} from "./bosses-logic";
import { GAIT_PARAMS, PLAYER_RADIUS_FACTOR, THEMES, WEAPONS, Z_TYPES, waveConfig } from "./config";
import {
  FLOOR_MAPS,
  MAP_COLS,
  MAP_ROWS,
  WAVES_PER_FLOOR,
  floorIndexForWave,
  isBuildingCleared,
  parseFloor,
  type ParsedFloor,
} from "./maps";
import {
  computeFlowField,
  flowDirection,
  makeDetour,
  moveWithDetour,
  type Detour,
  type FlowField,
} from "./navigation";
import type {
  ArenaZombieCallbacks,
  ArenaZombieHandle,
  HudSnapshot,
  Obstacle,
  Weapon,
  WaveConfig,
  ZombieGait,
} from "./types";

// Recálculo del flow field: como mucho una vez cada 150 ms, o antes si el
// jugador cambia de casilla (nunca por zombi individual).
const FLOW_FIELD_INTERVAL = 0.15;

interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  dmg: number;
  color: string;
  life: number;
  explosive?: boolean;
  blastR?: number;
}

interface Zombie {
  x: number;
  y: number;
  r: number;
  type: string;
  gait: ZombieGait;
  speed: number;
  hp: number;
  maxHp: number;
  dmg: number;
  points: number;
  color: string;
  dark: string;
  wob: number;
  hitFlash: number;
  legAngle: number;
  walkPhase: number;
  limp: number;
  // Un bruto mide 1.6 casillas de ancho y el flow field razona en casillas: sin memoria de
  // rodeo se encaja en las puertas estrechas y la oleada no termina nunca. Ver navigation.ts.
  detour: Detour;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

interface Pickup {
  x: number;
  y: number;
  r: number;
  key: string;
  bob: number;
}

interface Player {
  x: number;
  y: number;
  r: number;
  speed: number;
  angle: number;
  hp: number;
  maxHp: number;
  invuln: number;
  weapon: Weapon;
  ammo: number;
  fireCd: number;
  legAngle: number;
  walkPhase: number;
  moving: boolean;
}

interface Circle {
  x: number;
  y: number;
  r: number;
}

interface TouchZone {
  id: number | null;
  sx: number;
  sy: number;
  dx: number;
  dy: number;
  active: boolean;
}

const GAME_CODES = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Space",
]);

function clamp(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v));
}

function isTextTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
}

function lighten(hex: string, amt = 38): string {
  const c = hex.replace("#", "");
  const num = parseInt(c, 16);
  let r = (num >> 16) + amt;
  let g = ((num >> 8) & 0xff) + amt;
  let b = (num & 0xff) + amt;
  r = Math.min(255, Math.max(0, r));
  g = Math.min(255, Math.max(0, g));
  b = Math.min(255, Math.max(0, b));
  return `rgb(${r},${g},${b})`;
}

export function create(
  canvas: HTMLCanvasElement,
  callbacks: ArenaZombieCallbacks,
): ArenaZombieHandle {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return {
      start: () => {},
      pause: () => {},
      resume: () => {},
      continueAfterWave: () => {},
      initAudio: () => {},
      destroy: () => {},
    };
  }
  const g = ctx;
  const audio = createAudio();
  const { sfx } = audio;

  let W = 0;
  let H = 0;
  function resize(): void {
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = W;
    canvas.height = H;
  }
  resize();

  // ---------- Input ----------
  const keys: Record<string, boolean> = {};
  const mouse = { x: W / 2, y: H / 2, down: false };
  const touchMove: TouchZone = {
    id: null,
    sx: 0,
    sy: 0,
    dx: 0,
    dy: 0,
    active: false,
  };
  const touchAim: TouchZone = {
    id: null,
    sx: 0,
    sy: 0,
    dx: 0,
    dy: 0,
    active: false,
  };

  const onKeyDown = (e: KeyboardEvent) => {
    keys[e.code] = true;
    if (GAME_CODES.has(e.code) && !isTextTarget(e.target)) e.preventDefault();
  };
  const onKeyUp = (e: KeyboardEvent) => {
    keys[e.code] = false;
    if (GAME_CODES.has(e.code) && !isTextTarget(e.target)) e.preventDefault();
  };
  const onMouseMove = (e: MouseEvent) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = e.clientX - rect.left;
    mouse.y = e.clientY - rect.top;
  };
  const onMouseDown = () => {
    mouse.down = true;
    audio.init();
  };
  const onMouseUp = () => {
    mouse.down = false;
  };

  const onTouchStart = (e: TouchEvent) => {
    for (const t of Array.from(e.changedTouches)) {
      const left = t.clientX < window.innerWidth / 2;
      const zone = left ? touchMove : touchAim;
      if (zone.id === null) {
        zone.id = t.identifier;
        zone.sx = t.clientX;
        zone.sy = t.clientY;
        zone.dx = 0;
        zone.dy = 0;
        zone.active = true;
        if (!left) {
          mouse.down = true;
          audio.init();
        }
      }
    }
    e.preventDefault();
  };
  const onTouchMove = (e: TouchEvent) => {
    for (const t of Array.from(e.changedTouches)) {
      for (const zone of [touchMove, touchAim]) {
        if (zone.id === t.identifier) {
          zone.dx = clamp(t.clientX - zone.sx, -55, 55);
          zone.dy = clamp(t.clientY - zone.sy, -55, 55);
        }
      }
    }
    e.preventDefault();
  };
  const onTouchEnd = (e: TouchEvent) => {
    for (const t of Array.from(e.changedTouches)) {
      for (const zone of [touchMove, touchAim]) {
        if (zone.id === t.identifier) {
          zone.id = null;
          zone.active = false;
          zone.dx = 0;
          zone.dy = 0;
          if (zone === touchAim) mouse.down = false;
        }
      }
    }
    e.preventDefault();
  };

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("resize", resize);
  window.addEventListener("mouseup", onMouseUp);
  canvas.addEventListener("mousemove", onMouseMove);
  canvas.addEventListener("mousedown", onMouseDown);
  canvas.addEventListener("touchstart", onTouchStart, { passive: false });
  canvas.addEventListener("touchmove", onTouchMove, { passive: false });
  canvas.addEventListener("touchend", onTouchEnd, { passive: false });
  canvas.addEventListener("touchcancel", onTouchEnd, { passive: false });

  // ---------- Game state ----------
  type Phase = "idle" | "playing" | "gameover" | "victory" | "wavebreak";
  let state: Phase = "idle";
  let paused = false;

  let player: Player = makePlayer();
  let bullets: Bullet[] = [];
  let zombies: Zombie[] = [];
  let particles: Particle[] = [];
  let pickups: Pickup[] = [];
  let obstacles: Obstacle[] = [];

  // Jefe de la planta: mientras no sea null la partida no avanza de oleada ni de planta.
  let boss: BossState | null = null;
  // Ya se ha matado al jefe de esta planta (distingue "aún no ha salido" de "ya no está").
  let bossCleared = false;
  // Respiro tras matarlo, para que se vean las partículas antes de la siguiente pantalla.
  let bossDeathDelay = 0;

  let currentFloor: ParsedFloor = parseFloor(FLOOR_MAPS[0], W, H);
  let currentFloorIndex = -1;
  let flowField: FlowField = new Int32Array(MAP_COLS * MAP_ROWS).fill(-1);
  let lastPlayerTile = { c: -1, r: -1 };
  let flowFieldTimer = 0;

  let score = 0;
  let wave = 0;
  let spawnQueue = 0;
  let spawnTimer = 0;
  let waveCfg: WaveConfig = waveConfig(1);
  let pickupTimer = 0;
  let lastTime = 0;
  // Reloj de animación en segundos: lo usan los ciclos de dibujo del jefe.
  let animTime = 0;
  let shakeT = 0;
  let shakeMag = 0;
  let flameTickTimer = 0;
  let rafId = 0;
  let running = false;
  let lastHud: HudSnapshot | null = null;

  function tileMin(): number {
    return Math.min(W / MAP_COLS, H / MAP_ROWS);
  }

  function makePlayer(): Player {
    return {
      x: W / 2,
      y: H / 2,
      r: tileMin() * PLAYER_RADIUS_FACTOR,
      speed: 230,
      angle: 0,
      hp: 100,
      maxHp: 100,
      invuln: 0,
      weapon: { ...WEAPONS.pistol },
      ammo: Infinity,
      fireCd: 0,
      legAngle: 0,
      walkPhase: 0,
      moving: false,
    };
  }

  function resetGame(): void {
    player = makePlayer();
    bullets = [];
    zombies = [];
    particles = [];
    pickups = [];
    obstacles = [];
    boss = null;
    bossCleared = false;
    bossDeathDelay = 0;
    currentFloorIndex = -1;
    lastPlayerTile = { c: -1, r: -1 };
    flowFieldTimer = 0;
    score = 0;
    wave = 0;
    pickupTimer = 8;
    lastHud = null;
    startNextWave();
  }

  function startNextWave(): void {
    // Seguro: mientras el jefe de la planta siga vivo no se avanza.
    if (boss) return;
    wave++;
    bossCleared = false;
    waveCfg = waveConfig(wave);
    spawnQueue = waveCfg.total;
    spawnTimer = 0;

    const floorIdx = floorIndexForWave(wave);
    currentFloor = parseFloor(FLOOR_MAPS[floorIdx], W, H);
    obstacles = currentFloor.walls;
    // Forzar recálculo del flow field para la planta/posición recién cargada.
    lastPlayerTile = { c: -1, r: -1 };
    flowFieldTimer = 0;

    const floorChanged = floorIdx !== currentFloorIndex;
    if (floorChanged) {
      currentFloorIndex = floorIdx;
      player.x = currentFloor.playerSpawn.x;
      player.y = currentFloor.playerSpawn.y;
      bullets = [];
      pickups = [];
      const floorMap = FLOOR_MAPS[floorIdx];
      callbacks.onBanner(`PLANTA ${floorMap.id} — ${floorMap.name}`, "nueva planta");
    } else {
      callbacks.onBanner(`OLEADA ${wave}`, "se acercan");
    }
    sfx.wave();
  }

  /** Crea un zombi de un tipo concreto en un punto concreto (lo usa la nidada de La Matriarca). */
  function spawnZombieAt(typeKey: string, x: number, y: number): void {
    const t = Z_TYPES[typeKey];
    const gp = GAIT_PARAMS[t.gait];
    const cappedSpeed = Math.min(t.speed * waveCfg.speedMult, player.speed * 0.92);
    const limp = gp.limpRange[0] + Math.random() * (gp.limpRange[1] - gp.limpRange[0]);
    zombies.push({
      x,
      y,
      r: tileMin() * t.radiusFactor,
      type: typeKey,
      gait: t.gait,
      speed: cappedSpeed,
      hp: t.hp * waveCfg.healthMult,
      maxHp: t.hp * waveCfg.healthMult,
      dmg: t.dmg,
      points: t.points,
      color: t.color,
      dark: t.dark,
      wob: Math.random() * Math.PI * 2,
      hitFlash: 0,
      legAngle: 0,
      walkPhase: Math.random() * Math.PI * 2,
      limp,
      detour: makeDetour(),
    });
  }

  function spawnZombie(): void {
    let typeKey = "walker";
    const roll = Math.random();
    const cB = waveCfg.bruteChance;
    const cR = cB + waveCfg.runnerChance;
    const cL = cR + waveCfg.limperChance;
    if (roll < cB) typeKey = "brute";
    else if (roll < cR) typeKey = "runner";
    else if (roll < cL) typeKey = "limper";
    const spawns = currentFloor.zombieSpawns;
    const pos = spawns[Math.floor(Math.random() * spawns.length)];
    spawnZombieAt(typeKey, pos.x, pos.y);
  }

  function spawnParticles(x: number, y: number, color: string, n: number): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 60 + Math.random() * 160;
      particles.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 0.35 + Math.random() * 0.3,
        maxLife: 0.65,
        color,
        size: 2 + Math.random() * 2.5,
      });
    }
  }

  function resolveObstacles(entity: Circle): void {
    for (const o of obstacles) {
      const cx = clamp(entity.x, o.x, o.x + o.w);
      const cy = clamp(entity.y, o.y, o.y + o.h);
      let dx = entity.x - cx;
      let dy = entity.y - cy;
      let d = Math.hypot(dx, dy);
      if (d < entity.r) {
        if (d < 0.0001) {
          dx = 0;
          dy = -1;
          d = 1;
        }
        const push = entity.r - d;
        entity.x += (dx / d) * push;
        entity.y += (dy / d) * push;
      }
    }
  }

  /**
   * Daño al jugador desde una fuente situada en (fromX, fromY): respeta la invulnerabilidad
   * y lo empuja en dirección contraria. Lo usan las habilidades del jefe.
   */
  function damagePlayer(dmg: number, fromX: number, fromY: number): void {
    if (player.invuln > 0 || player.hp <= 0) return;
    player.hp -= dmg;
    player.invuln = 0.7;
    shakeT = 0.18;
    shakeMag = 8;
    sfx.hurt();
    const dx = player.x - fromX;
    const dy = player.y - fromY;
    const d = Math.hypot(dx, dy) || 1;
    player.x += (dx / d) * 14;
    player.y += (dy / d) * 14;
  }

  function onBossPhase(): void {
    sfx.wave();
    shakeT = 0.22;
    shakeMag = 7;
  }

  /** Muerte del jefe: puntos, partículas y, si es Paciente Cero, se lleva la horda con él. */
  function killBoss(dead: BossState): void {
    score += dead.cfg.points;
    spawnParticles(dead.x, dead.y, dead.cfg.dark, 40);
    spawnParticles(dead.x, dead.y, dead.cfg.eye, 22);
    shakeT = 0.5;
    shakeMag = 14;
    sfx.explosion();
    if (dead.cfg.killsHordeOnDeath) {
      for (const z of zombies) spawnParticles(z.x, z.y, z.dark, 10);
      zombies = [];
    }
    boss = null;
    bossCleared = true;
    bossDeathDelay = 1.2;
    callbacks.onBanner(`${dead.cfg.name.toUpperCase()} ABATIDO`, `+${dead.cfg.points} puntos`);
  }

  /** Único camino de daño al jefe: balas, explosiones y lanzallamas pasan por aquí. */
  function hitBoss(dmg: number, x: number, y: number, noise = true): void {
    if (!boss) return;
    const weak = isBossWeak(boss);
    if (noise) {
      spawnParticles(x, y, weak ? "#ffffff" : boss.cfg.color, weak ? 8 : 4);
      sfx.hit();
    }
    const target = boss;
    if (damageBoss(target, dmg, onBossPhase)) killBoss(target);
  }

  function bossContext(): BossContext {
    return {
      player,
      tile: tileMin(),
      tileW: currentFloor.tileW,
      tileH: currentFloor.tileH,
      solid: currentFloor.solid,
      flowField,
      resolveObstacles,
      damagePlayer,
      spawnRunner: (x, y) => spawnZombieAt("runner", x, y),
      spawnParticles,
      shake: (mag, time) => {
        shakeMag = mag;
        shakeT = time;
      },
      sfx,
    };
  }

  function spawnPickup(): void {
    const freeSpots = currentFloor.pickupSpots.filter(
      (spot) => !pickups.some((p) => p.x === spot.x && p.y === spot.y),
    );
    if (freeSpots.length === 0) return;
    const spot = freeSpots[Math.floor(Math.random() * freeSpots.length)];
    const keysList = ["smg", "shotgun", "cannon", "flamer"];
    const key = keysList[Math.floor(Math.random() * keysList.length)];
    pickups.push({
      x: spot.x,
      y: spot.y,
      r: 14,
      key,
      bob: Math.random() * Math.PI * 2,
    });
  }

  function triggerExplosion(x: number, y: number, r: number, dmg: number): void {
    spawnParticles(x, y, "#ffcf8a", 22);
    shakeT = 0.22;
    shakeMag = 10;
    sfx.explosion();
    if (boss && !isBossIntangible(boss) && Math.hypot(boss.x - x, boss.y - y) < r + boss.r) {
      hitBoss(dmg, x, y, false);
    }
    for (let i = zombies.length - 1; i >= 0; i--) {
      const z = zombies[i];
      const d = Math.hypot(z.x - x, z.y - y);
      if (d < r + z.r) {
        z.hp -= dmg;
        z.hitFlash = 0.16;
        if (z.hp <= 0) {
          score += z.points;
          spawnParticles(z.x, z.y, z.dark, 14);
          zombies.splice(i, 1);
          sfx.death();
        }
      }
    }
  }

  function applyFlameStream(w: Weapon, dt: number): void {
    const range = w.range ?? 0;
    const arc = w.arc ?? 0;
    const dps = w.dps ?? 0;
    /** ¿Está el objetivo dentro del cono de llama? */
    const inCone = (tx: number, ty: number, tr: number): boolean => {
      const dx = tx - player.x;
      const dy = ty - player.y;
      if (Math.hypot(dx, dy) >= range + tr) return false;
      let a = Math.atan2(dy, dx) - player.angle;
      a = Math.atan2(Math.sin(a), Math.cos(a));
      return Math.abs(a) < arc;
    };
    if (boss && !isBossIntangible(boss) && inCone(boss.x, boss.y, boss.r)) {
      // Sin ruido ni partículas: la llama ya las genera cada frame y `damageBoss` pone el flash.
      hitBoss(dps * dt, boss.x, boss.y, false);
    }
    for (let i = zombies.length - 1; i >= 0; i--) {
      const z = zombies[i];
      if (inCone(z.x, z.y, z.r)) {
        z.hp -= dps * dt;
        z.hitFlash = 0.1;
        if (z.hp <= 0) {
          score += z.points;
          spawnParticles(z.x, z.y, z.dark, 14);
          zombies.splice(i, 1);
          sfx.death();
        }
      }
    }
    // Dibujo del chorro. Las partículas nacen repartidas a lo largo del cono, no en la
    // boquilla: con el rozamiento del prototipo (`vx *= 0.9` por frame) una partícula solo
    // recorre ~34 px antes de apagarse, así que si nacieran todas juntas la llama se vería
    // hasta 89 px mientras quema hasta `range`. El reparto se deriva de `range` para que la
    // llama visible siga al alcance si se vuelve a tocar el balance.
    const muzzle = player.r + 8;
    const jet = Math.max(0, range - muzzle);
    // El cono crece con el cuadrado del alcance, así que las partículas también: si no, un
    // chorro largo se ve moteado en vez de sólido. Con tope, para no disparar el coste.
    const density = Math.min(12, Math.round(4 * (range / 180) ** 2));
    for (let k = 0; k < density; k++) {
      const spread = (Math.random() - 0.5) * arc * 1.7;
      const a = player.angle + spread;
      const along = Math.random() * jet * 0.82; // el 0.18 restante lo cubre el vuelo
      particles.push({
        x: player.x + Math.cos(player.angle) * muzzle + Math.cos(a) * along,
        y: player.y + Math.sin(player.angle) * muzzle + Math.sin(a) * along,
        vx: Math.cos(a) * (130 + Math.random() * 90),
        vy: Math.sin(a) * (130 + Math.random() * 90),
        life: 0.22 + Math.random() * 0.18,
        maxLife: 0.4,
        color: Math.random() < 0.5 ? "#ff7a2e" : "#ffd166",
        size: 5 + Math.random() * 5,
      });
    }
    flameTickTimer -= dt;
    if (flameTickTimer <= 0) {
      sfx.flame();
      flameTickTimer = 0.09;
    }
    shakeT = 0.05;
    shakeMag = 1.6;
  }

  function fireWeapon(): void {
    const w = player.weapon;
    if (w.kind === "explosive") {
      const speed = w.bulletSpeed ?? 0;
      bullets.push({
        x: player.x + Math.cos(player.angle) * (player.r + 10),
        y: player.y + Math.sin(player.angle) * (player.r + 10),
        vx: Math.cos(player.angle) * speed,
        vy: Math.sin(player.angle) * speed,
        dmg: w.dmg ?? 0,
        color: w.color,
        life: 1.6,
        explosive: true,
        blastR: w.blastR,
      });
      sfx.cannon();
      shakeT = 0.12;
      shakeMag = 6;
    } else {
      const pellets = w.pellets ?? 1;
      const spreadBase = w.spread ?? 0;
      const speed = w.bulletSpeed ?? 0;
      for (let i = 0; i < pellets; i++) {
        const spread = (Math.random() - 0.5) * spreadBase * 2;
        const a = player.angle + spread;
        bullets.push({
          x: player.x + Math.cos(player.angle) * (player.r + 8),
          y: player.y + Math.sin(player.angle) * (player.r + 8),
          vx: Math.cos(a) * speed,
          vy: Math.sin(a) * speed,
          dmg: w.dmg ?? 0,
          color: w.color,
          life: 1.1,
        });
      }
      if (pellets > 1) sfx.shotgun();
      else sfx.shoot();
      shakeT = 0.06;
      shakeMag = pellets > 1 ? 5 : 2.2;
    }
    if (player.ammo !== Infinity) {
      player.ammo -= 1;
      if (player.ammo <= 0) {
        player.weapon = { ...WEAPONS.pistol };
        player.ammo = Infinity;
      }
    }
  }

  function endGame(): void {
    state = "gameover";
    callbacks.onGameOver(Math.floor(score), wave);
  }

  function winGame(): void {
    state = "victory";
    callbacks.onVictory(Math.floor(score), wave);
  }

  function emitHud(): void {
    const snap: HudSnapshot = {
      hp: Math.max(0, Math.round(player.hp)),
      score: Math.floor(score),
      wave,
      floor: currentFloor.map.id,
      floorName: currentFloor.map.name,
      weaponName: player.weapon.name,
      ammo: player.ammo === Infinity ? "∞" : Math.ceil(player.ammo),
    };
    if (
      !lastHud ||
      lastHud.hp !== snap.hp ||
      lastHud.score !== snap.score ||
      lastHud.wave !== snap.wave ||
      lastHud.floor !== snap.floor ||
      lastHud.weaponName !== snap.weaponName ||
      lastHud.ammo !== snap.ammo
    ) {
      lastHud = snap;
      callbacks.onHud(snap);
    }
  }

  // ---------- Update ----------
  function update(dt: number): void {
    if (state !== "playing" || paused) return;

    // movement input
    let mx = 0;
    let my = 0;
    if (keys["KeyW"] || keys["ArrowUp"]) my -= 1;
    if (keys["KeyS"] || keys["ArrowDown"]) my += 1;
    if (keys["KeyA"] || keys["ArrowLeft"]) mx -= 1;
    if (keys["KeyD"] || keys["ArrowRight"]) mx += 1;
    if (touchMove.active) {
      mx = touchMove.dx / 50;
      my = touchMove.dy / 50;
    }
    const mag = Math.hypot(mx, my);
    player.moving = mag > 0.05;
    if (mag > 0.01) {
      const nx = mx / Math.max(mag, 1);
      const ny = my / Math.max(mag, 1);
      player.x += nx * player.speed * dt;
      player.y += ny * player.speed * dt;
      player.legAngle = Math.atan2(ny, nx);
    }
    if (player.moving) player.walkPhase += dt * 11;
    resolveObstacles(player);
    player.x = clamp(player.x, player.r + 10, W - player.r - 10);
    player.y = clamp(player.y, player.r + 10, H - player.r - 10);

    // aim
    let adx: number;
    let ady: number;
    if (touchAim.active) {
      adx = touchAim.dx;
      ady = touchAim.dy;
    } else {
      adx = mouse.x - player.x;
      ady = mouse.y - player.y;
    }
    if (Math.hypot(adx, ady) > 3) player.angle = Math.atan2(ady, adx);

    // fire
    const firing = mouse.down || touchAim.active;
    if (player.weapon.kind === "stream") {
      if (firing && player.ammo > 0) {
        applyFlameStream(player.weapon, dt);
        player.ammo -= (player.weapon.fuelPerSec ?? 0) * dt;
        if (player.ammo <= 0) {
          player.weapon = { ...WEAPONS.pistol };
          player.ammo = Infinity;
        }
      }
    } else {
      player.fireCd -= dt * 1000;
      if (firing && player.fireCd <= 0) {
        fireWeapon();
        player.fireCd = player.weapon.rate ?? 0;
      }
    }
    if (player.invuln > 0) player.invuln -= dt;

    // spawn logic
    if (spawnQueue > 0) {
      spawnTimer -= dt * 1000;
      if (spawnTimer <= 0) {
        spawnZombie();
        spawnQueue--;
        spawnTimer = waveCfg.spawnInterval;
      }
    } else if (zombies.length === 0 && !boss && bossDeathDelay <= 0) {
      // Horda vacía en la última oleada de una planta con jefe: sale el jefe y nada avanza
      // hasta que muera. `bossCleared` distingue "aún no ha salido" de "ya ha caído".
      const cfg =
        !bossCleared && isBossWave(wave, WAVES_PER_FLOOR)
          ? bossForFloor(wave / WAVES_PER_FLOOR)
          : undefined;
      if (cfg) {
        boss = spawnBoss(cfg, currentFloor, player, tileMin());
        callbacks.onBanner(`JEFE — ${cfg.name}`, `planta ${FLOOR_MAPS[currentFloorIndex].id}`);
        sfx.wave();
      } else if (isBuildingCleared(wave)) {
        winGame();
        return;
      } else {
        // Pausa la partida y espera la decisión del jugador (curar o no)
        // antes de arrancar la siguiente oleada; ver continueAfterWave().
        state = "wavebreak";
        callbacks.onWaveClear(wave);
        return;
      }
    }
    if (bossDeathDelay > 0) bossDeathDelay -= dt;

    // flow field: al cambiar de casilla el jugador, o cada FLOW_FIELD_INTERVAL como mucho
    const playerCol = Math.floor(player.x / currentFloor.tileW);
    const playerRow = Math.floor(player.y / currentFloor.tileH);
    flowFieldTimer -= dt;
    if (playerCol !== lastPlayerTile.c || playerRow !== lastPlayerTile.r || flowFieldTimer <= 0) {
      flowField = computeFlowField(currentFloor.solid, playerCol, playerRow);
      lastPlayerTile = { c: playerCol, r: playerRow };
      flowFieldTimer = FLOW_FIELD_INTERVAL;
    }

    // pickups
    pickupTimer -= dt;
    if (pickupTimer <= 0) {
      spawnPickup();
      pickupTimer = 11 + Math.random() * 5;
    }

    // bullets
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      let dead = b.life <= 0 || b.x < -20 || b.x > W + 20 || b.y < -20 || b.y > H + 20;
      if (!dead) {
        for (const o of obstacles) {
          if (b.x > o.x && b.x < o.x + o.w && b.y > o.y && b.y < o.y + o.h) {
            dead = true;
            if (b.explosive) triggerExplosion(b.x, b.y, b.blastR ?? 0, b.dmg);
            else spawnParticles(b.x, b.y, "#c9c2ad", 4);
            break;
          }
        }
      }
      if (dead) {
        bullets.splice(i, 1);
        continue;
      }
    }

    // zombies
    for (let i = zombies.length - 1; i >= 0; i--) {
      const z = zombies[i];
      if (!z) continue;
      z.wob += dt * 6;
      const dx = player.x - z.x;
      const dy = player.y - z.y;
      const d = Math.hypot(dx, dy) || 1;
      const direct = { x: dx / d, y: dy / d };
      const dir =
        flowDirection(
          flowField,
          currentFloor.solid,
          z.x,
          z.y,
          currentFloor.tileW,
          currentFloor.tileH,
        ) ?? direct;
      // Velocidad deseada = camino del flow field + el bamboleo de siempre. Se normaliza para
      // que el rodeo trabaje sobre una dirección unitaria; con el camino libre el resultado es
      // idéntico al de antes (z.x += vx * dt), y solo cuando choca entran los intentos extra.
      const vx = dir.x * z.speed + Math.sin(z.wob) * 6;
      const vy = dir.y * z.speed + Math.cos(z.wob * 0.7) * 6;
      const vlen = Math.hypot(vx, vy) || 1;
      moveWithDetour(z, z.r, z.detour, vx / vlen, vy / vlen, vlen * dt, dt, resolveObstacles);
      z.legAngle = Math.atan2(dy, dx);
      z.walkPhase += dt * (5 + z.speed * 0.03);
      if (z.hitFlash > 0) z.hitFlash -= dt;

      if (d < z.r + player.r && player.invuln <= 0) {
        player.hp -= z.dmg;
        player.invuln = 0.7;
        shakeT = 0.18;
        shakeMag = 8;
        sfx.hurt();
        const kdx = -dx / d;
        const kdy = -dy / d;
        player.x += kdx * 14;
        player.y += kdy * 14;
        if (player.hp <= 0) {
          endGame();
          return;
        }
      }

      // bullet collision
      for (let j = bullets.length - 1; j >= 0; j--) {
        const b = bullets[j];
        const bd = Math.hypot(b.x - z.x, b.y - z.y);
        if (bd < z.r + 4) {
          bullets.splice(j, 1);
          if (b.explosive) {
            triggerExplosion(b.x, b.y, b.blastR ?? 0, b.dmg);
          } else {
            z.hp -= b.dmg;
            z.hitFlash = 0.12;
            sfx.hit();
            spawnParticles(b.x, b.y, z.color, 4);
            if (z.hp <= 0) {
              score += z.points;
              spawnParticles(z.x, z.y, z.dark, 14);
              zombies.splice(i, 1);
              sfx.death();
            }
          }
          break;
        }
      }
    }

    // jefe
    if (boss) {
      updateBoss(boss, dt, bossContext());
      if (player.hp <= 0) {
        endGame();
        return;
      }
      // Balas: mientras es intangible (windup del acelerón) lo atraviesan.
      if (!isBossIntangible(boss)) {
        for (let j = bullets.length - 1; j >= 0; j--) {
          const b = bullets[j];
          if (Math.hypot(b.x - boss.x, b.y - boss.y) >= boss.r + 4) continue;
          bullets.splice(j, 1);
          if (b.explosive) triggerExplosion(b.x, b.y, b.blastR ?? 0, b.dmg);
          else hitBoss(b.dmg, b.x, b.y);
          if (!boss) break;
        }
      }
    }

    // pickups collision
    for (let i = pickups.length - 1; i >= 0; i--) {
      const p = pickups[i];
      p.bob += dt * 4;
      if (Math.hypot(p.x - player.x, p.y - player.y) < p.r + player.r) {
        player.weapon = { ...WEAPONS[p.key] };
        player.ammo = player.weapon.ammo;
        pickups.splice(i, 1);
        sfx.pickup();
      }
    }

    // particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const pt = particles[i];
      pt.life -= dt;
      if (pt.life <= 0) {
        particles.splice(i, 1);
        continue;
      }
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vx *= 0.9;
      pt.vy *= 0.9;
    }

    if (shakeT > 0) shakeT -= dt;

    emitHud();
  }

  // ---------- Humanoid limb helpers ----------
  function drawLegCurve(
    hx: number,
    hy: number,
    fx: number,
    fy: number,
    bend: number,
    width: number,
    color: string,
  ): void {
    const mx = (hx + fx) / 2;
    const my = (hy + fy) / 2;
    const dx = fx - hx;
    const dy = fy - hy;
    const len = Math.hypot(dx, dy) || 1;
    const px = -dy / len;
    const py = dx / len;
    const kx = mx + px * bend;
    const ky = my + py * bend;
    g.strokeStyle = color;
    g.lineWidth = width;
    g.lineCap = "round";
    g.beginPath();
    g.moveTo(hx, hy);
    g.quadraticCurveTo(kx, ky, fx, fy);
    g.stroke();
  }

  function drawLegs(
    angle: number,
    phase: number,
    stepAmp: number,
    kneeBend: number,
    color: string,
    width: number,
    asym = 1,
  ): void {
    g.save();
    g.rotate(angle);
    const a = asym;
    const sA = Math.sin(phase);
    const sB = Math.sin(phase + Math.PI);
    const hipAy = -6;
    const hipBy = 6;
    const footAx = sA * stepAmp;
    const footAy = hipAy + Math.abs(sA) * 1.4;
    const footBx = sB * stepAmp * a;
    const footBy = hipBy + Math.abs(sB) * 1.4 * a;
    const bendA = Math.max(0, sA) * kneeBend;
    const bendB = Math.max(0, sB) * kneeBend * a;
    drawLegCurve(0, hipAy, footAx, footAy, bendA, width, color);
    drawLegCurve(0, hipBy, footBx, footBy, bendB, width, color);
    g.fillStyle = color;
    g.beginPath();
    g.arc(footAx, footAy, width * 0.62, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.arc(footBx, footBy, width * 0.62, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }

  function drawWeaponInHand(w: Weapon): void {
    g.fillStyle = "#232f18";
    g.strokeStyle = "#232f18";
    if (w.key === "pistol") {
      g.fillRect(6, -2.5, 14, 5);
    } else if (w.key === "smg") {
      g.fillRect(-1, -2, 10, 4);
      g.fillRect(6, -3, 26, 6);
      g.fillRect(3, 3, 6, 7);
    } else if (w.key === "shotgun") {
      g.fillRect(-3, -3, 10, 6);
      g.fillRect(6, -5.5, 23, 4);
      g.fillRect(6, 1.5, 23, 4);
    } else if (w.key === "cannon") {
      g.fillRect(2, -7, 28, 14);
      g.fillStyle = "#101410";
      g.beginPath();
      g.arc(30, 0, 4.2, 0, Math.PI * 2);
      g.fill();
    } else if (w.key === "flamer") {
      g.fillRect(-6, -5, 12, 10);
      g.fillRect(6, -5, 18, 10);
      g.fillStyle = "#7a4a20";
      g.beginPath();
      g.moveTo(24, -6);
      g.lineTo(32, -3);
      g.lineTo(32, 3);
      g.lineTo(24, 6);
      g.closePath();
      g.fill();
    }
  }

  // ---------- Render ----------
  function render(): void {
    const theme = THEMES[currentFloor.map.theme] || THEMES[0];
    g.save();
    if (shakeT > 0) {
      g.translate((Math.random() - 0.5) * shakeMag, (Math.random() - 0.5) * shakeMag);
    }

    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, theme.sky[0]);
    grad.addColorStop(1, theme.sky[1]);
    g.fillStyle = grad;
    g.fillRect(-20, -20, W + 40, H + 40);

    // floor grid
    g.strokeStyle = theme.grid;
    g.lineWidth = 1;
    const gap = 46;
    for (let x = 0; x < W; x += gap) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, H);
      g.stroke();
    }
    for (let y = 0; y < H; y += gap) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(W, y);
      g.stroke();
    }

    // arena border
    g.strokeStyle = "rgba(0,0,0,.5)";
    g.lineWidth = 6;
    g.strokeRect(3, 3, W - 6, H - 6);

    if (
      state !== "playing" &&
      state !== "gameover" &&
      state !== "victory" &&
      state !== "wavebreak"
    ) {
      g.restore();
      return;
    }

    // obstacles
    obstacles.forEach((o) => {
      const cx = o.x + o.w / 2;
      g.fillStyle = "rgba(0,0,0,.28)";
      g.beginPath();
      g.ellipse(cx, o.y + o.h + 6, o.w * 0.42, 7, 0, 0, Math.PI * 2);
      g.fill();
      const bg = g.createLinearGradient(o.x, o.y, o.x + o.w, o.y + o.h);
      bg.addColorStop(0, "#7a6a4a");
      bg.addColorStop(1, "#463c29");
      g.fillStyle = bg;
      g.fillRect(o.x, o.y, o.w, o.h);
      g.strokeStyle = "rgba(0,0,0,.55)";
      g.lineWidth = 3;
      g.strokeRect(o.x + 1.5, o.y + 1.5, o.w - 3, o.h - 3);
      g.strokeStyle = "rgba(255,255,255,.12)";
      g.lineWidth = 1;
      g.strokeRect(o.x + 4, o.y + 4, o.w - 8, o.h - 8);
    });

    // pickups
    const labels: Record<string, string> = {
      smg: "FUS",
      shotgun: "12G",
      cannon: "BUM",
      flamer: "FLM",
    };
    pickups.forEach((p) => {
      const bobY = Math.sin(p.bob) * 4;
      g.save();
      g.translate(p.x, p.y + bobY);
      g.fillStyle = WEAPONS[p.key].color;
      g.beginPath();
      g.arc(0, 0, p.r, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = "rgba(0,0,0,.4)";
      g.lineWidth = 2;
      g.stroke();
      g.fillStyle = "#0e1113";
      g.font = "9px Oswald, system-ui, sans-serif";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(labels[p.key] ?? p.key, 0, 1);
      g.restore();
    });

    // particles
    particles.forEach((pt) => {
      g.globalAlpha = clamp(pt.life / pt.maxLife, 0, 1);
      g.fillStyle = pt.color;
      g.beginPath();
      g.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
      g.fill();
    });
    g.globalAlpha = 1;

    // capa de suelo del jefe (estela, onda, telegrafiados) — por debajo de todo el mundo
    if (boss) drawBossGround(g, boss, animTime, tileMin());

    // zombies
    zombies.forEach((z) => {
      g.save();
      g.translate(z.x, z.y);
      const scale = z.r / 15;
      const gp = GAIT_PARAMS[z.gait] || GAIT_PARAMS.shuffle;
      const flash = z.hitFlash > 0;
      const tilt = gp.tiltBias + Math.sin(z.wob * 0.8) * gp.tiltAmp;

      drawLegs(
        z.legAngle,
        z.walkPhase,
        gp.stepAmp * scale,
        gp.kneeBend * scale,
        flash ? "#ffffff" : "#181209",
        gp.legW * scale,
        z.limp,
      );

      g.save();
      g.rotate(z.legAngle + tilt * 0.35);

      const armSwing1 = Math.sin(z.walkPhase * 0.55) * 9 * scale;
      const armSwing2 = Math.sin(z.walkPhase * 0.55 + 2.4) * 9 * scale;
      g.strokeStyle = flash ? "#ffffff" : z.dark;
      g.lineWidth = 3 * scale;
      g.lineCap = "round";
      g.beginPath();
      g.moveTo(-4 * scale, -6 * scale);
      g.lineTo(10 * scale + armSwing1, -3 * scale);
      g.stroke();
      g.beginPath();
      g.moveTo(-4 * scale, 6 * scale);
      g.lineTo(9 * scale + armSwing2, 4 * scale);
      g.stroke();
      g.fillStyle = flash ? "#ffffff" : z.dark;
      g.beginPath();
      g.arc(10 * scale + armSwing1, -3 * scale, 2 * scale, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.arc(9 * scale + armSwing2, 4 * scale, 2 * scale, 0, Math.PI * 2);
      g.fill();

      const tox = gp.torsoOx * scale;
      const toy = gp.torsoOy * scale;
      const trx = gp.torsoRx * scale;
      const tory = gp.torsoRy * scale;
      if (flash) {
        g.fillStyle = "#ffffff";
      } else {
        const tg = g.createRadialGradient(
          tox - trx * 0.3,
          toy - tory * 0.35,
          1,
          tox,
          toy,
          trx * 1.35,
        );
        tg.addColorStop(0, lighten(z.color));
        tg.addColorStop(1, z.color);
        g.fillStyle = tg;
      }
      g.beginPath();
      g.ellipse(tox, toy, trx, tory, 0, 0, Math.PI * 2);
      g.fill();

      g.save();
      g.translate(6 * scale + tox * 0.4, toy * 0.5);
      g.rotate(tilt * 1.7);
      g.fillStyle = flash ? "#ffffff" : z.dark;
      g.beginPath();
      g.arc(0, 0, 5.3 * scale, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#ff3b3b";
      g.beginPath();
      g.arc(1.4 * scale, -1.5 * scale, 1.2 * scale, 0, Math.PI * 2);
      g.arc(1.4 * scale, 1.5 * scale, 1.2 * scale, 0, Math.PI * 2);
      g.fill();
      g.restore();

      g.restore();

      if (z.maxHp > 2) {
        g.fillStyle = "rgba(0,0,0,.5)";
        g.fillRect(-z.r, -z.r - 10, z.r * 2, 3);
        g.fillStyle = "#9fef22";
        g.fillRect(-z.r, -z.r - 10, z.r * 2 * clamp(z.hp / z.maxHp, 0, 1), 3);
      }
      g.restore();
    });

    // jefe, por encima de la horda
    if (boss) drawBoss(g, boss, animTime, tileMin());

    // bullets
    bullets.forEach((b) => {
      if (b.explosive) {
        g.strokeStyle = "rgba(255,106,61,.55)";
        g.lineWidth = 5;
        g.lineCap = "round";
        g.beginPath();
        g.moveTo(b.x, b.y);
        g.lineTo(b.x - b.vx * 0.035, b.y - b.vy * 0.035);
        g.stroke();
        const bgrad = g.createRadialGradient(b.x, b.y, 0, b.x, b.y, 9);
        bgrad.addColorStop(0, "#fff3d6");
        bgrad.addColorStop(0.45, b.color);
        bgrad.addColorStop(1, "rgba(255,106,61,0)");
        g.fillStyle = bgrad;
        g.beginPath();
        g.arc(b.x, b.y, 9, 0, Math.PI * 2);
        g.fill();
      } else {
        g.strokeStyle = b.color;
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(b.x, b.y);
        g.lineTo(b.x - b.vx * 0.02, b.y - b.vy * 0.02);
        g.stroke();
      }
    });

    // player
    g.save();
    g.translate(player.x, player.y);
    if (player.invuln > 0 && Math.floor(player.invuln * 20) % 2 === 0) g.globalAlpha = 0.4;

    drawLegs(player.legAngle, player.walkPhase, player.moving ? 7 : 0, 6, "#232f18", 4.4, 1);

    g.save();
    g.rotate(player.angle);

    g.strokeStyle = "#232f18";
    g.lineWidth = 3.5;
    g.lineCap = "round";
    g.beginPath();
    g.moveTo(-2, 7);
    g.lineTo(9, 10);
    g.stroke();
    drawWeaponInHand(player.weapon);

    const chassisGrad = g.createRadialGradient(-3, -4, 1, 0, 0, 15);
    chassisGrad.addColorStop(0, lighten("#9fef22", 30));
    chassisGrad.addColorStop(1, "#7fd018");
    g.fillStyle = chassisGrad;
    g.beginPath();
    g.moveTo(-10, -9);
    g.lineTo(9, -8);
    g.lineTo(13, 0);
    g.lineTo(9, 8);
    g.lineTo(-10, 9);
    g.lineTo(-13, 0);
    g.closePath();
    g.fill();
    g.fillStyle = "#5f9414";
    g.fillRect(-9, -2, 14, 4);
    g.fillStyle = "#1b230f";
    g.fillRect(-11, -9, 4, 4);
    g.fillRect(-11, 5, 4, 4);

    g.save();
    g.translate(6, 0);
    g.fillStyle = "#101410";
    g.beginPath();
    g.arc(0, 0, 6, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#c8ffb0";
    g.fillRect(-1, -4.5, 7, 2.4);
    g.restore();

    g.restore();
    g.restore();

    // touch joystick indicators
    for (const zone of [touchMove, touchAim]) {
      if (!zone.active) continue;
      g.strokeStyle = "rgba(159,239,34,.35)";
      g.lineWidth = 2;
      g.beginPath();
      g.arc(zone.sx, zone.sy, 42, 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = "rgba(159,239,34,.28)";
      g.beginPath();
      g.arc(zone.sx + zone.dx, zone.sy + zone.dy, 18, 0, Math.PI * 2);
      g.fill();
    }

    g.restore();

    // Barra del jefe: fuera del `save` del temblor, para que no baile con los golpes.
    if (boss) drawBossHealthBar(g, boss, W);
  }

  // ---------- Loop ----------
  function loop(ts: number): void {
    if (!running) return;
    if (!lastTime) lastTime = ts;
    let dt = (ts - lastTime) / 1000;
    dt = Math.min(dt, 0.05);
    lastTime = ts;
    animTime += dt;
    update(dt);
    render();
    rafId = window.requestAnimationFrame(loop);
  }

  // ---------- Public handle ----------
  return {
    start() {
      resetGame();
      state = "playing";
      paused = false;
      lastTime = 0;
      if (!running) {
        running = true;
        rafId = window.requestAnimationFrame(loop);
      }
    },
    pause() {
      paused = true;
    },
    continueAfterWave(healFull) {
      if (state !== "wavebreak") return;
      if (healFull) player.hp = player.maxHp;
      state = "playing";
      paused = false;
      lastTime = 0;
      startNextWave();
    },
    resume() {
      paused = false;
      lastTime = 0;
    },
    initAudio() {
      audio.init();
    },
    destroy() {
      running = false;
      if (rafId) window.cancelAnimationFrame(rafId);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mouseup", onMouseUp);
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("mousedown", onMouseDown);
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("touchend", onTouchEnd);
      canvas.removeEventListener("touchcancel", onTouchEnd);
    },
  };
}

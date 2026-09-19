// Estado y comportamiento de los jefes de Arena Zombie. Archivo nuevo: `bosses.ts` son los
// datos, esto es la máquina de estados común a los cuatro y `bosses-draw.ts` el dibujo.
//
// Idea: un jefe no es una clase por jefe, sino un `BossState` + una máquina de estados por
// habilidad (`idle → windup → active → recovery`). Añadir o retocar un jefe es editar
// `bosses.ts`; los cinco tipos de habilidad viven aquí y se comparten.
//
// Regla de diseño que atraviesa todo el archivo: **ningún golpe sin telegrafiado**. El daño
// solo puede salir de `active` (o del final de `windup` en `throw`), nunca del propio `windup`.

import type { ArenaAudio } from "./audio";
import type { BossAbility, BossAbilityKind, BossConfig, BossPhase } from "./bosses";
import { MAP_COLS, MAP_ROWS, type ParsedFloor } from "./maps";
import { flowDirection, makeDetour, moveWithDetour, type Detour, type FlowField } from "./navigation";

/** Segundos de recuperación tras cualquier habilidad, antes de volver a `idle`. */
const RECOVERY = 0.4;
/** Segundos que tarda la onda del pisotón en llegar a su radio máximo. */
const SLAM_WAVE_TIME = 0.8;
/** Corte de seguridad para la embestida: si no toca ni jugador ni muro, termina igual. */
const CHARGE_MAX_TIME = 2.5;
/** Ídem para el acelerón: el destino se recorta con un rayo desde el centro, pero el jefe
 *  tiene ancho y puede rozar una esquina y no llegar nunca. Sin este corte se congela. */
const DASH_MAX_TIME = 1.5;
/** La estela del Rastreador solo puede dañar una vez por segundo. */
const TRAIL_HIT_INTERVAL = 1;
/** Cada cuánto se deja un punto de estela durante el acelerón. */
const TRAIL_STEP = 0.03;
/**
 * Radio de colisión máximo, en casillas.
 *
 * Los mapas garantizan pasillos de 2 casillas como mínimo, dimensionados para la horda: el
 * zombi más ancho es el bruto, con 0.8 de radio (1.6 casillas de diámetro). Los jefes miden
 * entre 2.3 y 3.8 casillas de diámetro, así que con su radio visual no caben por buena parte
 * del edificio y se quedan encajados para siempre — lo prohíbe el criterio de aceptación.
 * Se separan por tanto los dos radios: `r` es el visual (el que pide `radiusTiles`, y el que
 * usan disparos y contacto) y este es el que choca con los muros, igualado al del bruto para
 * que un jefe pueda ir a donde va la horda. Como mucho, un jefe grande solapa visualmente la
 * esquina de un muro; su centro nunca entra en uno.
 */
const MAX_COLLISION_TILES = 0.85;

export type BossStage = "idle" | "windup" | "active" | "recovery";

export interface BossTrailPoint {
  x: number;
  y: number;
  t: number; // segundos que lleva vivo
}

export interface BossState {
  cfg: BossConfig;
  x: number;
  y: number;
  r: number; // radio visual en píxeles: radiusTiles × tamaño de casilla
  collisionR: number; // radio con el que choca con los muros (ver MAX_COLLISION_TILES)
  hp: number;
  maxHp: number;
  angle: number;
  phaseIndex: number;
  // Valores vivos: arrancan en los de `cfg` y los sustituyen las fases.
  armorMult: number;
  speedMult: number;
  cooldownMult: number;
  spawnCount: number;
  trailDamage: number;
  rage: boolean;
  hitFlash: number;
  phaseFlash: number;
  walkPhase: number;
  ability: {
    kind: BossAbilityKind | null;
    index: number;
    stage: BossStage;
    t: number;
    cooldowns: number[];
    last: BossAbilityKind | null;
  };
  dash?: {
    dirX: number;
    dirY: number;
    targetX: number;
    targetY: number;
    hit: boolean;
    trail: BossTrailPoint[];
    emit: number;
  };
  charge?: { dirX: number; dirY: number; stunned: number };
  throw?: { targetX: number; targetY: number; t: number };
  slam?: { hit: boolean };
  trailHitCd: number;
  // Memoria de rodeo de muros; la comparte con la horda (ver navigation.ts).
  detour: Detour;
}

/** Todo lo que la lógica del jefe necesita del motor, inyectado para no acoplar los módulos. */
export interface BossContext {
  player: { x: number; y: number; r: number; speed: number };
  tile: number; // min(tileW, tileH): la unidad de los radios en casillas
  tileW: number;
  tileH: number;
  solid: boolean[][];
  flowField: FlowField;
  resolveObstacles: (entity: { x: number; y: number; r: number }) => void;
  damagePlayer: (dmg: number, fromX: number, fromY: number) => void;
  spawnRunner: (x: number, y: number) => void;
  spawnParticles: (x: number, y: number, color: string, n: number) => void;
  shake: (mag: number, time: number) => void;
  sfx: ArenaAudio["sfx"];
}

function clamp(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v));
}

/** Saca al jefe de los muros usando su radio de colisión, no el visual. */
function resolveWalls(boss: BossState, ctx: BossContext): void {
  const body = { x: boss.x, y: boss.y, r: boss.collisionR };
  ctx.resolveObstacles(body);
  boss.x = body.x;
  boss.y = body.y;
}

/** El jefe que corresponde a la planta, situado en la 'S' más alejada del jugador. */
export function spawnBoss(
  cfg: BossConfig,
  floor: ParsedFloor,
  player: { x: number; y: number },
  tile: number,
): BossState {
  const spawns = floor.zombieSpawns;
  let spot = { x: floor.tileW * 1.5, y: floor.tileH * 1.5 };
  let bestD = -1;
  for (const s of spawns) {
    const d = Math.hypot(s.x - player.x, s.y - player.y);
    if (d > bestD) {
      bestD = d;
      spot = s;
    }
  }
  const first = cfg.abilities[0];
  return {
    cfg,
    x: spot.x,
    y: spot.y,
    r: cfg.radiusTiles * tile,
    collisionR: Math.min(cfg.radiusTiles, MAX_COLLISION_TILES) * tile,
    hp: cfg.hp,
    maxHp: cfg.hp,
    angle: Math.atan2(player.y - spot.y, player.x - spot.x),
    phaseIndex: 0,
    armorMult: cfg.armorMult,
    speedMult: cfg.speedMult,
    cooldownMult: 1,
    spawnCount: first?.spawnCount ?? 0,
    trailDamage: first?.trailDamage ?? 0,
    rage: false,
    hitFlash: 0,
    phaseFlash: 0,
    walkPhase: 0,
    trailHitCd: 0,
    detour: makeDetour(),
    ability: {
      kind: null,
      index: -1,
      stage: "idle",
      t: 0,
      // Primer uso: medio cooldown, para que no golpee nada más aparecer.
      cooldowns: cfg.abilities.map((a) => a.cooldown * 0.5),
      last: null,
    },
    dash: { dirX: 1, dirY: 0, targetX: spot.x, targetY: spot.y, hit: false, trail: [], emit: 0 },
    charge: { dirX: 1, dirY: 0, stunned: 0 },
    slam: { hit: false },
  };
}

/** Durante el `windup` del acelerón el Rastreador no está: ni recibe daño ni lo hace. */
export function isBossIntangible(boss: BossState): boolean {
  return boss.ability.kind === "dash" && boss.ability.stage === "windup";
}

/** El punto débil: doble daño mientras ejecuta la habilidad marcada como `weakWhile`. */
export function isBossWeak(boss: BossState): boolean {
  return (
    boss.cfg.weakWhile !== undefined &&
    boss.ability.kind === boss.cfg.weakWhile &&
    boss.ability.stage === "windup"
  );
}

function applyPhase(boss: BossState, ph: BossPhase): void {
  if (ph.speedMult !== undefined) boss.speedMult = ph.speedMult;
  if (ph.cooldownMult !== undefined) boss.cooldownMult = ph.cooldownMult;
  if (ph.spawnCount !== undefined) boss.spawnCount = ph.spawnCount;
  if (ph.trailDamage !== undefined) boss.trailDamage = ph.trailDamage;
  if (ph.armorMult !== undefined) boss.armorMult = ph.armorMult;
  if (ph.rage) boss.rage = true;
}

/**
 * Aplica daño al jefe con su armadura y su punto débil, y dispara las fases que se crucen.
 * Devuelve `true` si el golpe lo ha matado.
 */
export function damageBoss(
  boss: BossState,
  dmg: number,
  onPhase?: (phase: BossPhase) => void,
): boolean {
  if (isBossIntangible(boss) || boss.hp <= 0) return false;
  boss.hp -= dmg * boss.armorMult * (isBossWeak(boss) ? 2 : 1);
  boss.hitFlash = 0.12;
  // Las fases están ordenadas de mayor a menor umbral: un golpe grande puede cruzar dos.
  while (boss.phaseIndex < boss.cfg.phases.length) {
    const ph = boss.cfg.phases[boss.phaseIndex];
    if (boss.hp / boss.maxHp >= ph.hpBelow) break;
    applyPhase(boss, ph);
    boss.phaseIndex++;
    boss.phaseFlash = 0.35;
    onPhase?.(ph);
  }
  return boss.hp <= 0;
}

/** Distancia libre en una dirección hasta el primer muro (o `maxDist`). */
function distanceToWall(
  ctx: BossContext,
  fromX: number,
  fromY: number,
  dirX: number,
  dirY: number,
  maxDist: number,
): number {
  const step = Math.min(ctx.tileW, ctx.tileH) * 0.25;
  let d = 0;
  while (d < maxDist) {
    const next = Math.min(d + step, maxDist);
    const c = Math.floor((fromX + dirX * next) / ctx.tileW);
    const r = Math.floor((fromY + dirY * next) / ctx.tileH);
    if (c < 0 || r < 0 || c >= MAP_COLS || r >= MAP_ROWS || ctx.solid[r][c]) return d;
    d = next;
  }
  return maxDist;
}

function currentAbility(boss: BossState): BossAbility | null {
  return boss.ability.index >= 0 ? boss.cfg.abilities[boss.ability.index] : null;
}

/**
 * Habilidad lista para empezar, o -1 si toca esperar. Con más de una habilidad no se puede
 * encadenar dos veces la misma (Paciente Cero alterna pisotón y escombro).
 */
function pickAbility(boss: BossState): number {
  const many = boss.cfg.abilities.length > 1;
  for (let i = 0; i < boss.cfg.abilities.length; i++) {
    if (boss.ability.cooldowns[i] > 0) continue;
    // Con varias habilidades se espera antes que repetir la última: la alternancia
    // es lo que obliga al jugador a leer el telegrafiado en vez de memorizar un ritmo.
    if (many && boss.cfg.abilities[i].kind === boss.ability.last) continue;
    return i;
  }
  return -1;
}

function startAbility(boss: BossState, index: number, ctx: BossContext): void {
  const ab = boss.cfg.abilities[index];
  boss.ability.index = index;
  boss.ability.kind = ab.kind;
  boss.ability.stage = "windup";
  boss.ability.t = 0;
  if (ab.kind === "throw") {
    boss.throw = { targetX: ctx.player.x, targetY: ctx.player.y, t: 0 };
  }
  if (ab.kind === "slam" && boss.slam) boss.slam.hit = false;
  if (ab.kind === "dash" && boss.dash) {
    boss.dash.hit = false;
    boss.dash.emit = 0;
  }
}

function endAbility(boss: BossState): void {
  const ab = currentAbility(boss);
  boss.ability.stage = "recovery";
  boss.ability.t = 0;
  if (ab) boss.ability.last = ab.kind;
}

/** Destino del acelerón: la posición del jugador, recortada por el primer muro. */
function aimDash(boss: BossState, ctx: BossContext): void {
  if (!boss.dash) return;
  const dx = ctx.player.x - boss.x;
  const dy = ctx.player.y - boss.y;
  const len = Math.hypot(dx, dy) || 1;
  const dirX = dx / len;
  const dirY = dy / len;
  const free = distanceToWall(ctx, boss.x, boss.y, dirX, dirY, len);
  const reach = Math.max(0, Math.min(len, free - boss.r * 0.5));
  boss.dash.dirX = dirX;
  boss.dash.dirY = dirY;
  boss.dash.targetX = boss.x + dirX * reach;
  boss.dash.targetY = boss.y + dirY * reach;
}

function releaseSpawn(boss: BossState, ctx: BossContext): void {
  const n = Math.max(1, boss.spawnCount);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.4;
    const d = boss.r + ctx.tile * 0.6;
    const x = clamp(boss.x + Math.cos(a) * d, ctx.tileW, ctx.tileW * (MAP_COLS - 1));
    const y = clamp(boss.y + Math.sin(a) * d, ctx.tileH, ctx.tileH * (MAP_ROWS - 1));
    ctx.spawnRunner(x, y);
    ctx.spawnParticles(x, y, boss.cfg.eye, 8);
  }
  ctx.sfx.wave();
}

function releaseThrow(boss: BossState, ab: BossAbility, ctx: BossContext): void {
  if (!boss.throw) return;
  const radius = (ab.radiusTiles ?? 1) * ctx.tile;
  ctx.spawnParticles(boss.throw.targetX, boss.throw.targetY, "#7a6a4a", 20);
  ctx.shake(9, 0.2);
  ctx.sfx.explosion();
  const d = Math.hypot(ctx.player.x - boss.throw.targetX, ctx.player.y - boss.throw.targetY);
  if (d < radius + ctx.player.r) {
    ctx.damagePlayer(ab.damage ?? 0, boss.throw.targetX, boss.throw.targetY);
  }
}

function updateAbility(boss: BossState, dt: number, ctx: BossContext): void {
  const st = boss.ability;

  if (st.stage === "idle") {
    // Los cooldowns solo corren entre habilidades, no durante una.
    for (let i = 0; i < st.cooldowns.length; i++) st.cooldowns[i] -= dt;
    const idx = pickAbility(boss);
    if (idx >= 0) startAbility(boss, idx, ctx);
    return;
  }

  const ab = currentAbility(boss);
  if (!ab) {
    st.stage = "idle";
    return;
  }
  st.t += dt;

  if (st.stage === "windup") {
    // El acelerón reapunta mientras avisa: el flash siempre marca dónde va a salir.
    if (ab.kind === "dash") aimDash(boss, ctx);
    if (ab.kind === "throw" && boss.throw) boss.throw.t = clamp(st.t / ab.windup, 0, 1);
    if (st.t < ab.windup) return;
    st.t = 0;
    switch (ab.kind) {
      case "charge": {
        const dx = ctx.player.x - boss.x;
        const dy = ctx.player.y - boss.y;
        const len = Math.hypot(dx, dy) || 1;
        if (boss.charge) {
          boss.charge.dirX = dx / len;
          boss.charge.dirY = dy / len;
        }
        ctx.sfx.cannon();
        st.stage = "active";
        break;
      }
      case "spawn":
        releaseSpawn(boss, ctx);
        endAbility(boss);
        break;
      case "dash":
        aimDash(boss, ctx);
        ctx.sfx.shotgun();
        st.stage = "active";
        break;
      case "slam":
        ctx.shake(12, 0.25);
        ctx.sfx.explosion();
        st.stage = "active";
        break;
      case "throw":
        releaseThrow(boss, ab, ctx);
        endAbility(boss);
        break;
    }
    return;
  }

  if (st.stage === "active") {
    switch (ab.kind) {
      case "charge": {
        const c = boss.charge;
        if (!c) {
          endAbility(boss);
          break;
        }
        const speed = ctx.player.speed * boss.speedMult * (ab.speedMult ?? 1);
        const px = boss.x;
        const py = boss.y;
        boss.x += c.dirX * speed * dt;
        boss.y += c.dirY * speed * dt;
        resolveWalls(boss, ctx);
        const advanced = Math.hypot(boss.x - px, boss.y - py);
        const hitPlayer =
          Math.hypot(ctx.player.x - boss.x, ctx.player.y - boss.y) < boss.r + ctx.player.r;
        if (hitPlayer) {
          ctx.damagePlayer(ab.damage ?? 0, boss.x, boss.y);
          ctx.shake(10, 0.2);
          endAbility(boss);
        } else if (advanced < speed * dt * 0.45) {
          // Apenas ha avanzado: la resolución de muros lo ha frenado → choque.
          c.stunned = ab.stunOnWall ?? 0;
          ctx.spawnParticles(boss.x, boss.y, "#c9c2ad", 18);
          ctx.shake(12, 0.3);
          ctx.sfx.explosion();
          endAbility(boss);
        } else if (st.t > CHARGE_MAX_TIME) {
          endAbility(boss);
        }
        break;
      }
      case "dash": {
        const d = boss.dash;
        if (!d) {
          endAbility(boss);
          break;
        }
        const speed = ctx.player.speed * boss.speedMult * (ab.speedMult ?? 1);
        const left = Math.hypot(d.targetX - boss.x, d.targetY - boss.y);
        const step = speed * dt;
        const px = boss.x;
        const py = boss.y;
        if (step >= left) {
          boss.x = d.targetX;
          boss.y = d.targetY;
        } else {
          boss.x += d.dirX * step;
          boss.y += d.dirY * step;
        }
        resolveWalls(boss, ctx);
        const advanced = Math.hypot(boss.x - px, boss.y - py);
        d.emit -= dt;
        if (d.emit <= 0) {
          d.trail.push({ x: boss.x, y: boss.y, t: 0 });
          d.emit = TRAIL_STEP;
        }
        if (
          !d.hit &&
          Math.hypot(ctx.player.x - boss.x, ctx.player.y - boss.y) < boss.r + ctx.player.r
        ) {
          d.hit = true;
          ctx.damagePlayer(ab.damage ?? 0, boss.x, boss.y);
          ctx.shake(10, 0.2);
        }
        // Termina al llegar, al quedarse clavado contra un muro, o por corte de seguridad.
        if (step >= left || advanced < step * 0.45 || st.t > DASH_MAX_TIME) {
          if (advanced < step * 0.45) ctx.spawnParticles(boss.x, boss.y, "#c9c2ad", 12);
          endAbility(boss);
        }
        break;
      }
      case "slam": {
        const radius = (ab.radiusTiles ?? 1) * ctx.tile;
        const wave = radius * clamp(st.t / SLAM_WAVE_TIME, 0, 1);
        if (boss.slam && !boss.slam.hit) {
          const d = Math.hypot(ctx.player.x - boss.x, ctx.player.y - boss.y);
          if (d <= wave + ctx.player.r) {
            boss.slam.hit = true;
            ctx.damagePlayer(ab.damage ?? 0, boss.x, boss.y);
          }
        }
        if (st.t >= SLAM_WAVE_TIME) endAbility(boss);
        break;
      }
      default:
        endAbility(boss);
    }
    return;
  }

  // recovery
  if (st.t >= RECOVERY) {
    const ready = ab.cooldown * boss.cooldownMult;
    st.cooldowns[st.index] = ready;
    st.stage = "idle";
    st.t = 0;
    st.kind = null;
    st.index = -1;
  }
}

/** ¿Se mueve libremente este frame? Las habilidades que no son desplazamiento lo clavan al suelo. */
function canWalk(boss: BossState): boolean {
  return boss.ability.stage === "idle";
}

/**
 * Avance del jefe hacia el jugador por el mismo flow field que la horda.
 *
 * El rodeo de muros vive en `navigation.ts` porque no es exclusivo de los jefes: cualquier
 * cuerpo ancho (un bruto también) se encaja si sigue al pie de la letra un campo de casillas.
 * Aquí solo se elige la dirección y se le pasa el radio de colisión, no el visual.
 */
function moveBoss(boss: BossState, dt: number, ctx: BossContext): void {
  const dx = ctx.player.x - boss.x;
  const dy = ctx.player.y - boss.y;
  const len = Math.hypot(dx, dy) || 1;
  const flow = flowDirection(ctx.flowField, ctx.solid, boss.x, boss.y, ctx.tileW, ctx.tileH);
  const dir = flow ?? { x: dx / len, y: dy / len };
  boss.walkPhase += dt * (3 + boss.speedMult * 6);
  moveWithDetour(
    boss,
    boss.collisionR,
    boss.detour,
    dir.x,
    dir.y,
    ctx.player.speed * boss.speedMult * dt,
    dt,
    ctx.resolveObstacles,
  );
}

export function updateBoss(boss: BossState, dt: number, ctx: BossContext): void {
  if (boss.hitFlash > 0) boss.hitFlash -= dt;
  if (boss.phaseFlash > 0) boss.phaseFlash -= dt;
  if (boss.trailHitCd > 0) boss.trailHitCd -= dt;

  // Estela: envejece siempre, aunque el acelerón haya terminado.
  const trailDuration = boss.cfg.abilities.find((a) => a.kind === "dash")?.trailDuration ?? 0;
  if (boss.dash) {
    for (let i = boss.dash.trail.length - 1; i >= 0; i--) {
      boss.dash.trail[i].t += dt;
      if (boss.dash.trail[i].t > trailDuration) boss.dash.trail.splice(i, 1);
    }
    if (boss.trailDamage > 0 && boss.trailHitCd <= 0) {
      for (const p of boss.dash.trail) {
        if (Math.hypot(ctx.player.x - p.x, ctx.player.y - p.y) < boss.r * 0.7 + ctx.player.r) {
          ctx.damagePlayer(boss.trailDamage, p.x, p.y);
          boss.trailHitCd = TRAIL_HIT_INTERVAL;
          break;
        }
      }
    }
  }

  // Aturdido tras chocar contra un muro: ni se mueve ni ataca ni hace daño por contacto.
  if (boss.charge && boss.charge.stunned > 0) {
    boss.charge.stunned -= dt;
    return;
  }

  // Mira al jugador salvo mientras ejecuta un desplazamiento ya comprometido.
  const committed =
    boss.ability.stage === "active" &&
    (boss.ability.kind === "charge" || boss.ability.kind === "dash");
  if (!committed) {
    boss.angle = Math.atan2(ctx.player.y - boss.y, ctx.player.x - boss.x);
  }

  updateAbility(boss, dt, ctx);

  if (canWalk(boss)) moveBoss(boss, dt, ctx);

  // Contacto: el jefe daña al tocar al jugador salvo si es intangible.
  if (!isBossIntangible(boss)) {
    const d = Math.hypot(ctx.player.x - boss.x, ctx.player.y - boss.y);
    if (d < boss.r + ctx.player.r) ctx.damagePlayer(boss.cfg.contactDamage, boss.x, boss.y);
  }
}

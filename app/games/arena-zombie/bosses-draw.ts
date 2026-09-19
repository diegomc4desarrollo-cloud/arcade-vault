// Dibujo de los cuatro jefes. Port directo de las funciones `draw` de
// references/jefes/jefes-preview.html, con una diferencia: allí los estados se fingían con
// `t % 5`, aquí los lee del `BossState` real (`ability.kind` + `ability.stage`).
//
// Reparto en tres funciones por orden de capa:
//   drawBossGround  — todo lo que va pegado al suelo (estela, onda, círculos, sombras)
//   drawBoss        — el cuerpo y lo que va por encima (línea de embestida, escombro en vuelo)
//   drawBossHealthBar — la barra del HUD, en coordenadas de pantalla
//
// La escala `s = boss.r / 15` es la misma convención que usan los zombis en engine.ts, así que
// las constantes del visor se copian tal cual.

import type { BossAbilityKind } from "./bosses";
import type { BossState } from "./bosses-logic";

type G = CanvasRenderingContext2D;

function lighten(hex: string, amt = 38): string {
  const num = parseInt(hex.replace("#", ""), 16);
  const r = Math.min(255, (num >> 16) + amt);
  const g = Math.min(255, ((num >> 8) & 0xff) + amt);
  const b = Math.min(255, (num & 0xff) + amt);
  return `rgb(${r},${g},${b})`;
}

function legCurve(
  g: G,
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
  g.strokeStyle = color;
  g.lineWidth = width;
  g.lineCap = "round";
  g.beginPath();
  g.moveTo(hx, hy);
  g.quadraticCurveTo(mx + (-dy / len) * bend, my + (dx / len) * bend, fx, fy);
  g.stroke();
}

function drawLegs(
  g: G,
  angle: number,
  phase: number,
  stepAmp: number,
  kneeBend: number,
  color: string,
  width: number,
  hipGap: number,
  asym = 1,
): void {
  g.save();
  g.rotate(angle);
  const sA = Math.sin(phase);
  const sB = Math.sin(phase + Math.PI);
  const fAx = sA * stepAmp;
  const fAy = -hipGap + Math.abs(sA) * 1.4;
  const fBx = sB * stepAmp * asym;
  const fBy = hipGap + Math.abs(sB) * 1.4 * asym;
  legCurve(g, 0, -hipGap, fAx, fAy, Math.max(0, sA) * kneeBend, width, color);
  legCurve(g, 0, hipGap, fBx, fBy, Math.max(0, sB) * kneeBend * asym, width, color);
  g.fillStyle = color;
  g.beginPath();
  g.arc(fAx, fAy, width * 0.62, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.arc(fBx, fBy, width * 0.62, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

function torso(g: G, ox: number, oy: number, rx: number, ry: number, color: string): void {
  const grad = g.createRadialGradient(ox - rx * 0.3, oy - ry * 0.35, 1, ox, oy, rx * 1.35);
  grad.addColorStop(0, lighten(color));
  grad.addColorStop(1, color);
  g.fillStyle = grad;
  g.beginPath();
  g.ellipse(ox, oy, rx, ry, 0, 0, Math.PI * 2);
  g.fill();
}

function head(
  g: G,
  x: number,
  y: number,
  r: number,
  tilt: number,
  color: string,
  eye = "#ff3b3b",
): void {
  g.save();
  g.translate(x, y);
  g.rotate(tilt);
  g.fillStyle = color;
  g.beginPath();
  g.arc(0, 0, r, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = eye;
  g.beginPath();
  g.arc(r * 0.28, -r * 0.3, r * 0.22, 0, Math.PI * 2);
  g.arc(r * 0.28, r * 0.3, r * 0.22, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

function arms(
  g: G,
  s: number,
  phase: number,
  color: string,
  reach: number,
  width: number,
): { a1: number; a2: number } {
  const a1 = Math.sin(phase * 0.55) * 9 * s;
  const a2 = Math.sin(phase * 0.55 + 2.4) * 9 * s;
  g.strokeStyle = color;
  g.lineWidth = width * s;
  g.lineCap = "round";
  g.beginPath();
  g.moveTo(-4 * s, -6 * s);
  g.lineTo(reach * s + a1, -3 * s);
  g.stroke();
  g.beginPath();
  g.moveTo(-4 * s, 6 * s);
  g.lineTo((reach - 1) * s + a2, 4 * s);
  g.stroke();
  g.fillStyle = color;
  g.beginPath();
  g.arc(reach * s + a1, -3 * s, 2.2 * s, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.arc((reach - 1) * s + a2, 4 * s, 2.2 * s, 0, Math.PI * 2);
  g.fill();
  return { a1, a2 };
}

// ---------- lectura del estado ----------

function stageIs(boss: BossState, kind: BossAbilityKind, stage: BossState["ability"]["stage"]) {
  return boss.ability.kind === kind && boss.ability.stage === stage;
}

function abilityRadius(boss: BossState, kind: BossAbilityKind, tile: number): number {
  const ab = boss.cfg.abilities.find((a) => a.kind === kind);
  return (ab?.radiusTiles ?? 1) * tile;
}

/** Progreso 0-1 dentro del `windup` de la habilidad en curso. */
function windupK(boss: BossState): number {
  const ab = boss.cfg.abilities[boss.ability.index];
  if (!ab || boss.ability.stage !== "windup") return 0;
  return Math.max(0, Math.min(1, boss.ability.t / ab.windup));
}

// ---------- los cuatro jefes ----------

function drawCapataz(g: G, boss: BossState, s: number, t: number): void {
  const windup = stageIs(boss, "charge", "windup");
  const charging = stageIs(boss, "charge", "active");
  const stunned = (boss.charge?.stunned ?? 0) > 0;
  const phase = boss.walkPhase * (charging ? 2.6 : 1) + (charging ? t * 6 : 0);

  drawLegs(g, 0, phase, (charging ? 9 : 6) * s, 3 * s, "#1d1a0c", 4.2 * s, 6 * s, 1);
  g.save();
  g.rotate(stunned ? 0.35 : windup ? -0.15 : charging ? 0.12 : Math.sin(t * 1.5) * 0.08);
  arms(g, s, phase, boss.cfg.dark, 10, 3.4);
  // gancho en la mano derecha
  g.strokeStyle = "#8a8a8a";
  g.lineWidth = 2.4 * s;
  g.lineCap = "round";
  g.beginPath();
  g.moveTo(10 * s + Math.sin(phase * 0.55) * 9 * s, -3 * s);
  g.lineTo(19 * s, -6 * s);
  g.stroke();
  g.beginPath();
  g.arc(19 * s, -9 * s, 3.5 * s, Math.PI * 0.2, Math.PI * 1.4);
  g.stroke();
  torso(g, (charging ? 2 : -1) * s, 0, 9.6 * s, 7.4 * s, boss.cfg.color);
  // chaleco reflectante
  g.fillStyle = "#ff9a2e";
  g.fillRect(-6 * s, -2 * s, 10 * s, 4 * s);
  g.fillStyle = "#e6e1c8";
  g.fillRect(-6 * s, -0.6 * s, 10 * s, 1.2 * s);
  head(g, 6.5 * s, 0, 5.6 * s, Math.sin(t * 0.8) * 0.25, boss.cfg.dark, boss.cfg.eye);
  // casco
  g.fillStyle = "#e0b020";
  g.beginPath();
  g.arc(6.5 * s, 0, 6.2 * s, Math.PI * 1.1, Math.PI * 1.9);
  g.lineTo(6.5 * s, 0);
  g.closePath();
  g.fill();
  g.restore();

  if (charging) {
    // líneas de velocidad hacia atrás
    g.strokeStyle = "rgba(255,207,59,.35)";
    g.lineWidth = 3 * s;
    for (let i = 1; i < 4; i++) {
      g.beginPath();
      g.moveTo(-12 * s * i, -4 * s);
      g.lineTo(-12 * s * i - 8 * s, -4 * s);
      g.moveTo(-12 * s * i, 4 * s);
      g.lineTo(-12 * s * i - 8 * s, 4 * s);
      g.stroke();
    }
  }
  if (stunned) {
    // estrellitas de aturdimiento: aviso de que ahora no hace daño
    g.fillStyle = "#ffcf3b";
    for (let i = 0; i < 3; i++) {
      const a = t * 4 + (i / 3) * Math.PI * 2;
      g.beginPath();
      g.arc(Math.cos(a) * 9 * s, -11 * s + Math.sin(a) * 3 * s, 1.6 * s, 0, Math.PI * 2);
      g.fill();
    }
  }
}

function drawMatriarca(g: G, boss: BossState, s: number, t: number): void {
  const laying = stageIs(boss, "spawn", "windup");
  const k = windupK(boss);
  const phase = boss.walkPhase;

  drawLegs(g, 0, laying ? 0 : phase, 5 * s, 2.5 * s, "#1a1020", 4.6 * s, 7 * s, 0.8);
  g.save();
  g.rotate(Math.sin(t * 0.9) * 0.1);
  arms(g, s, phase, boss.cfg.dark, 11, 3.2);
  const swell = laying ? 1 + Math.sin(k * Math.PI) * 0.25 : 1 + Math.sin(t * 2) * 0.03;
  torso(g, -2 * s, 0, 10.5 * s * swell, 8.5 * s * swell, boss.cfg.color);
  // sacos: brillan al máximo mientras pare, que es cuando es punto débil
  const glow = laying ? 1 : 0.55 + Math.sin(t * 3) * 0.2;
  for (const [sx, sy] of [
    [-6, -3],
    [-3, 4],
    [-8, 3],
    [1, -4],
  ]) {
    g.fillStyle = `rgba(255,106,213,${glow})`;
    g.beginPath();
    g.arc(sx * s * swell, sy * s * swell, 2.4 * s, 0, Math.PI * 2);
    g.fill();
  }
  head(g, 7.5 * s, 0, 5.2 * s, Math.sin(t * 1.1) * 0.3, boss.cfg.dark, boss.cfg.eye);
  g.restore();
}

function drawRastreador(g: G, boss: BossState, s: number, t: number): void {
  const vanish = stageIs(boss, "dash", "windup");
  const dashing = stageIs(boss, "dash", "active");
  const phase = boss.walkPhase * (dashing ? 2 : 1) + t * (dashing ? 12 : 4);

  g.save();
  if (vanish) g.globalAlpha = 0.25;
  drawLegs(g, 0, phase, 10 * s, 8 * s, "#120606", 2.8 * s, 5 * s, 1);
  g.save();
  g.rotate(dashing ? 0.05 : Math.sin(t * 2) * 0.06);
  const A = arms(g, s, phase, boss.cfg.dark, 15, 2.4);
  // garras
  g.strokeStyle = "#d8d0c0";
  g.lineWidth = 1.4 * s;
  for (const [hx, hy] of [
    [15 * s + A.a1, -3 * s],
    [14 * s + A.a2, 4 * s],
  ]) {
    for (let i = -1; i <= 1; i++) {
      g.beginPath();
      g.moveTo(hx, hy);
      g.lineTo(hx + 5 * s, hy + i * 2.2 * s);
      g.stroke();
    }
  }
  torso(g, 3 * s, 0, 9.5 * s, 4.6 * s, boss.cfg.color);
  head(g, 10 * s, 0, 4.6 * s, Math.sin(t * 3) * 0.15, boss.cfg.dark, boss.cfg.eye);
  g.restore();
  g.restore();

  if (vanish) {
    g.fillStyle = "rgba(20,5,5,.6)";
    g.beginPath();
    g.arc(0, 0, 16 * s, 0, Math.PI * 2);
    g.fill();
  }
  if (dashing) {
    for (let i = 1; i <= 4; i++) {
      g.save();
      g.globalAlpha = 0.35 / i;
      g.translate(-i * 14 * s, 0);
      torso(g, 3 * s, 0, 9.5 * s, 4.6 * s, boss.cfg.color);
      g.restore();
    }
  }
}

function drawPacienteCero(g: G, boss: BossState, s: number, t: number): void {
  const raise = stageIs(boss, "slam", "windup");
  const slamming = stageIs(boss, "slam", "active");
  const throwing = stageIs(boss, "throw", "windup");
  const col = boss.rage ? "#3b6b2e" : boss.cfg.color;
  const eye = boss.rage ? "#d4ff5a" : boss.cfg.eye;
  const phase = boss.walkPhase;

  drawLegs(g, 0, raise || slamming ? 0 : phase, 8 * s, 1.8 * s, "#0d0a16", 6.4 * s, 8 * s, 1);
  g.save();
  g.rotate(Math.sin(t * 0.6) * 0.05);
  // brazos enormes: arriba mientras avisa, abajo al golpear
  const lift = raise ? -10 * s : slamming ? 4 * s : throwing ? -6 * s : 0;
  g.strokeStyle = boss.cfg.dark;
  g.lineWidth = 5.2 * s;
  g.lineCap = "round";
  g.beginPath();
  g.moveTo(-5 * s, -9 * s);
  g.lineTo(13 * s + lift * 0.3, -11 * s + lift);
  g.stroke();
  g.beginPath();
  g.moveTo(-5 * s, 9 * s);
  g.lineTo(13 * s + lift * 0.3, 11 * s - lift);
  g.stroke();
  g.fillStyle = boss.cfg.dark;
  g.beginPath();
  g.arc(13 * s + lift * 0.3, -11 * s + lift, 4.2 * s, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.arc(13 * s + lift * 0.3, 11 * s - lift, 4.2 * s, 0, Math.PI * 2);
  g.fill();
  torso(g, -1 * s, 0, 12 * s, 10 * s, col);
  // placas de armadura: se caen al perder la fase de armadura
  if (boss.armorMult < 1) {
    g.fillStyle = "#6a6580";
    for (const [px, py, w, h] of [
      [-9, -8, 7, 5],
      [-9, 3, 7, 5],
      [0, -4, 8, 8],
    ]) {
      g.fillRect(px * s, py * s, w * s, h * s);
      g.strokeStyle = "#1a1726";
      g.lineWidth = 1;
      g.strokeRect(px * s, py * s, w * s, h * s);
    }
  }
  head(g, 8 * s, 0, 6 * s, Math.sin(t * 0.7) * 0.12, boss.cfg.dark, eye);
  g.restore();
}

// ---------- capas ----------

/** Todo lo que va pegado al suelo, por debajo de zombis y jefe. */
export function drawBossGround(g: G, boss: BossState, t: number, tile: number): void {
  const s = boss.r / 15;

  // Estela del acelerón. Si hace daño (fase del 50 %) se dibuja al rojo vivo.
  if (boss.dash && boss.dash.trail.length > 0) {
    const ab = boss.cfg.abilities.find((a) => a.kind === "dash");
    const dur = ab?.trailDuration ?? 1;
    const harmful = boss.trailDamage > 0;
    for (const p of boss.dash.trail) {
      const k = 1 - p.t / dur;
      if (k <= 0) continue;
      g.globalAlpha = k * (harmful ? 0.5 : 0.22);
      g.fillStyle = harmful ? "#ff2a2a" : "#5a1f1f";
      g.beginPath();
      g.ellipse(p.x, p.y, boss.r * 0.7, boss.r * 0.45, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
  }

  // Flash del punto de salida del acelerón: siempre visible durante el windup.
  if (stageIs(boss, "dash", "windup") && boss.dash) {
    g.strokeStyle = "rgba(255,42,42,.85)";
    g.lineWidth = 3;
    g.beginPath();
    g.arc(boss.dash.targetX, boss.dash.targetY, 12 + Math.sin(t * 30) * 5, 0, Math.PI * 2);
    g.stroke();
  }

  // Pisotón: círculo punteado mientras avisa, onda expansiva al golpear.
  if (stageIs(boss, "slam", "windup")) {
    const radius = abilityRadius(boss, "slam", tile);
    g.strokeStyle = "rgba(255,77,77,.6)";
    g.lineWidth = 2;
    g.setLineDash([5, 7]);
    g.beginPath();
    g.arc(boss.x, boss.y, radius, 0, Math.PI * 2);
    g.stroke();
    g.setLineDash([]);
  }
  if (stageIs(boss, "slam", "active")) {
    const radius = abilityRadius(boss, "slam", tile);
    const k = Math.min(1, boss.ability.t / 0.8);
    g.strokeStyle = `rgba(255,180,84,${1 - k})`;
    g.lineWidth = 6 * (1 - k) + 2;
    g.beginPath();
    g.arc(boss.x, boss.y, radius * k, 0, Math.PI * 2);
    g.stroke();
  }

  // Escombro: sombra que crece hasta el impacto.
  if (stageIs(boss, "throw", "windup") && boss.throw) {
    const k = boss.throw.t;
    const radius = abilityRadius(boss, "throw", tile);
    g.fillStyle = `rgba(0,0,0,${0.15 + k * 0.4})`;
    g.beginPath();
    g.ellipse(
      boss.throw.targetX,
      boss.throw.targetY,
      radius * (0.4 + k * 0.6),
      radius * (0.25 + k * 0.35),
      0,
      0,
      Math.PI * 2,
    );
    g.fill();
  }

  // Sombra del propio jefe.
  g.fillStyle = "rgba(0,0,0,.3)";
  g.beginPath();
  g.ellipse(boss.x, boss.y + 10 * s, 12 * s, 6 * s, 0, 0, Math.PI * 2);
  g.fill();
}

/** El jefe y lo que va por encima de él. Despacha por `cfg.key`. */
export function drawBoss(g: G, boss: BossState, t: number, tile: number): void {
  const s = boss.r / 15;

  // Escombro en vuelo: parábola desde el jefe hasta el punto marcado.
  if (stageIs(boss, "throw", "windup") && boss.throw) {
    const k = boss.throw.t;
    const px = boss.x + (boss.throw.targetX - boss.x) * k;
    const py = boss.y + (boss.throw.targetY - boss.y) * k - Math.sin(k * Math.PI) * 150;
    g.save();
    g.translate(px, py);
    g.rotate(k * 6);
    g.fillStyle = "#7a6a4a";
    g.fillRect(-9, -8, 18, 16);
    g.strokeStyle = "rgba(0,0,0,.5)";
    g.lineWidth = 2;
    g.strokeRect(-9, -8, 18, 16);
    g.restore();
  }

  g.save();
  g.translate(boss.x, boss.y);

  // Telegrafiado de la embestida: línea punteada en la dirección en la que va a salir.
  if (stageIs(boss, "charge", "windup")) {
    g.save();
    g.rotate(boss.angle);
    g.strokeStyle = "rgba(255,207,59,.7)";
    g.lineWidth = 3;
    g.setLineDash([6, 6]);
    g.beginPath();
    g.moveTo(12 * s, 0);
    g.lineTo(tile * 9, 0);
    g.stroke();
    g.setLineDash([]);
    g.restore();
  }

  g.save();
  g.rotate(boss.angle);
  switch (boss.cfg.key) {
    case "capataz":
      drawCapataz(g, boss, s, t);
      break;
    case "matriarca":
      drawMatriarca(g, boss, s, t);
      break;
    case "rastreador":
      drawRastreador(g, boss, s, t);
      break;
    case "paciente-cero":
      drawPacienteCero(g, boss, s, t);
      break;
  }
  g.restore();

  // Fogonazo blanco: impacto recibido y, más largo, cambio de fase.
  const flash = Math.max(boss.hitFlash / 0.12, boss.phaseFlash / 0.35);
  if (flash > 0) {
    g.globalAlpha = Math.min(0.75, flash * 0.75);
    g.fillStyle = "#ffffff";
    g.beginPath();
    g.ellipse(0, 0, boss.r * 0.95, boss.r * 0.8, 0, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;
  }
  g.restore();
}

/** Barra de vida del jefe, arriba y centrada, con marcas en los umbrales de fase. */
export function drawBossHealthBar(g: G, boss: BossState, W: number): void {
  const barW = Math.min(520, W * 0.56);
  const barH = 12;
  const x = (W - barW) / 2;
  const y = 30;
  const k = Math.max(0, boss.hp / boss.maxHp);

  g.save();
  g.textAlign = "center";
  g.textBaseline = "alphabetic";
  g.font = "13px Oswald, system-ui, sans-serif";
  g.fillStyle = "rgba(233,230,220,.85)";
  g.fillText(boss.cfg.name.toUpperCase(), W / 2, y - 7);

  g.fillStyle = "rgba(0,0,0,.55)";
  g.fillRect(x, y, barW, barH);
  g.fillStyle = boss.rage ? "#9fef22" : "#ff4d4d";
  g.fillRect(x, y, barW * k, barH);

  // Marcas de fase: hasta dónde hay que bajarle la vida para que cambie de comportamiento.
  g.strokeStyle = "rgba(14,17,19,.9)";
  g.lineWidth = 2;
  for (const ph of boss.cfg.phases) {
    const mx = x + barW * ph.hpBelow;
    g.beginPath();
    g.moveTo(mx, y);
    g.lineTo(mx, y + barH);
    g.stroke();
  }

  g.strokeStyle = "rgba(159,239,34,.45)";
  g.lineWidth = 1;
  g.strokeRect(x + 0.5, y + 0.5, barW - 1, barH - 1);

  g.font = "11px Oswald, system-ui, sans-serif";
  g.fillStyle = "rgba(233,230,220,.6)";
  g.fillText(`${Math.max(0, Math.ceil(boss.hp))} / ${boss.maxHp}`, W / 2, y + barH + 13);
  g.restore();
}

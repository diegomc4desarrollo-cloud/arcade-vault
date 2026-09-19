// Flow field (campo de distancias) para que los zombis rodeen muros y crucen puertas.
// Archivo nuevo. Sustituye la persecución en línea recta cuando hay planta cargada.
//
// Idea: BFS desde la casilla del jugador sobre las casillas de suelo. Cada casilla guarda
// su distancia al jugador; cada zombi avanza hacia la casilla vecina con distancia menor.
// Se recalcula solo cuando el jugador cambia de casilla (o cada ~150 ms), no por zombi.
import { MAP_COLS, MAP_ROWS } from "./maps";

export type FlowField = Int32Array; // índice = fila * MAP_COLS + col ; -1 = inalcanzable

const NEIGHBORS: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/**
 * Cuánto se compromete a bordear un cuerpo, medido en **radios propios**.
 *
 * En distancia y no en tiempo a propósito: un jefe va a 138 px/s y un bruto a 41, así que un
 * presupuesto de segundos que sobra para uno deja al otro a medio rodear, todavía encajado.
 * Seis radios bastan para bordear cualquier bloque de muro de estas plantas.
 */
const DETOUR_RADII = 6;
/** Tope de seguridad por si el rodeo tampoco avanza: evita rodeos eternos. */
const DETOUR_MAX_TIME = 8;

/** Memoria de rodeo de un cuerpo con ancho. Una por entidad que se mueva por el campo. */
export interface Detour {
  budget: number; // píxeles de rodeo que quedan (0 = va por el camino normal)
  timeout: number; // segundos restantes antes de abandonar el rodeo
  slide: 1 | -1; // mano preferida: 1 = bordea por la izquierda del camino
  dx: number; // dirección congelada del rodeo
  dy: number;
}

export function makeDetour(): Detour {
  // La mano se sortea: si toda la horda bordeara por el mismo lado se amontonaría.
  return { budget: 0, timeout: 0, slide: Math.random() < 0.5 ? 1 : -1, dx: 0, dy: 0 };
}

/**
 * Avanza un cuerpo circular un paso en la dirección `(dirX, dirY)` que marca el flow field.
 *
 * Hace falta porque el campo es un BFS sobre **casillas**, calculado para agentes puntuales:
 * marca rutas por puertas de una casilla por las que un cuerpo ancho (un bruto, un jefe) no
 * cabe. Sin esto, el cuerpo se encaja en la esquina y no sale nunca — y si es el último zombi
 * de una oleada, la partida se queda muerta porque la horda nunca llega a cero.
 *
 * Si el camino marcado no le cabe prueba cada eje por separado y, si tampoco, bordea el muro
 * en perpendicular. Dos detalles que parecen menores y no lo son:
 *   - el avance se mide **hacia la meta** (producto escalar), no como desplazamiento bruto:
 *     si no, volver a meterse en la esquina cuenta como progreso y el cuerpo oscila;
 *   - el rodeo **congela su dirección** mientras dura: si se recalcula cada frame, la
 *     perpendicular gira con el campo hasta apuntar contra el propio muro que bordea.
 *
 * En el caso normal (camino libre) cuesta exactamente lo mismo que antes: una sola llamada
 * a `resolve`. Los intentos extra solo ocurren cuando el cuerpo está bloqueado.
 */
export function moveWithDetour(
  pos: { x: number; y: number },
  radius: number,
  d: Detour,
  dirX: number,
  dirY: number,
  step: number,
  dt: number,
  resolve: (entity: { x: number; y: number; r: number }) => void,
): void {
  const ox = pos.x;
  const oy = pos.y;

  const attempt = (vx: number, vy: number): { toward: number; moved: number } => {
    const body = { x: ox + vx * step, y: oy + vy * step, r: radius };
    resolve(body);
    pos.x = body.x;
    pos.y = body.y;
    const mx = body.x - ox;
    const my = body.y - oy;
    const expected = (vx * dirX + vy * dirY) * step;
    return {
      toward: expected > 1e-6 ? (mx * dirX + my * dirY) / expected : 0,
      moved: Math.hypot(mx, my),
    };
  };

  if (d.budget > 0 && d.timeout > 0) {
    d.timeout -= dt;
    const r = attempt(d.dx, d.dy);
    d.budget -= r.moved;
    // Por ese lado tampoco se sale: se prueba el contrario sin perder el rodeo.
    if (r.moved < step * 0.25) {
      d.dx = -d.dx;
      d.dy = -d.dy;
      d.slide = d.slide === 1 ? -1 : 1;
    }
    return;
  }

  if (attempt(dirX, dirY).toward > 0.5) return;
  if (attempt(dirX, 0).toward > 0.5) return;
  if (attempt(0, dirY).toward > 0.5) return;
  d.budget = radius * DETOUR_RADII;
  d.timeout = DETOUR_MAX_TIME;
  d.dx = -dirY * d.slide;
  d.dy = dirX * d.slide;
  attempt(d.dx, d.dy);
}

export function computeFlowField(
  solid: boolean[][],
  targetCol: number,
  targetRow: number,
): FlowField {
  const dist = new Int32Array(MAP_COLS * MAP_ROWS).fill(-1);
  if (solid[targetRow]?.[targetCol]) return dist;
  const queue: number[] = [targetRow * MAP_COLS + targetCol];
  dist[queue[0]] = 0;
  for (let head = 0; head < queue.length; head++) {
    const idx = queue[head];
    const r = Math.floor(idx / MAP_COLS),
      c = idx % MAP_COLS;
    for (const [dc, dr] of NEIGHBORS) {
      const nc = c + dc,
        nr = r + dr;
      if (nc < 0 || nr < 0 || nc >= MAP_COLS || nr >= MAP_ROWS) continue;
      if (solid[nr][nc]) continue;
      const nidx = nr * MAP_COLS + nc;
      if (dist[nidx] !== -1) continue;
      dist[nidx] = dist[idx] + 1;
      queue.push(nidx);
    }
  }
  return dist;
}

/**
 * Dirección unitaria que debe seguir un zombi situado en (x, y).
 * Devuelve null si está en la misma casilla que el jugador o en una zona inalcanzable:
 * en ese caso el llamador usa la persecución directa de siempre.
 */
export function flowDirection(
  field: FlowField,
  solid: boolean[][],
  x: number,
  y: number,
  tileW: number,
  tileH: number,
): { x: number; y: number } | null {
  const c = Math.floor(x / tileW),
    r = Math.floor(y / tileH);
  if (c < 0 || r < 0 || c >= MAP_COLS || r >= MAP_ROWS) return null;
  const here = field[r * MAP_COLS + c];
  if (here <= 0) return null;
  let best = here,
    bc = c,
    br = r;
  // vecinos ortogonales y diagonales (diagonal solo si no corta esquina de muro)
  for (let dr = -1; dr <= 1; dr++)
    for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const nc = c + dc,
        nr = r + dr;
      if (nc < 0 || nr < 0 || nc >= MAP_COLS || nr >= MAP_ROWS || solid[nr][nc]) continue;
      if (dc && dr && (solid[r][nc] || solid[nr][c])) continue;
      const d = field[nr * MAP_COLS + nc];
      if (d !== -1 && d < best) {
        best = d;
        bc = nc;
        br = nr;
      }
    }
  if (bc === c && br === r) return null;
  const tx = (bc + 0.5) * tileW,
    ty = (br + 0.5) * tileH;
  const dx = tx - x,
    dy = ty - y,
    len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
}

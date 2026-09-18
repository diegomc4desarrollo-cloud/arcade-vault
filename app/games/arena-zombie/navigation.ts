// Flow field (campo de distancias) para que los zombis rodeen muros y crucen puertas.
// Archivo nuevo. Sustituye la persecución en línea recta cuando hay planta cargada.
//
// Idea: BFS desde la casilla del jugador sobre las casillas de suelo. Cada casilla guarda
// su distancia al jugador; cada zombi avanza hacia la casilla vecina con distancia menor.
// Se recalcula solo cuando el jugador cambia de casilla (o cada ~150 ms), no por zombi.
import { MAP_COLS, MAP_ROWS } from './maps';

export type FlowField = Int32Array; // índice = fila * MAP_COLS + col ; -1 = inalcanzable

const NEIGHBORS: [number, number][] = [[1,0],[-1,0],[0,1],[0,-1]];

export function computeFlowField(solid: boolean[][], targetCol: number, targetRow: number): FlowField {
  const dist = new Int32Array(MAP_COLS * MAP_ROWS).fill(-1);
  if (solid[targetRow]?.[targetCol]) return dist;
  const queue: number[] = [targetRow * MAP_COLS + targetCol];
  dist[queue[0]] = 0;
  for (let head = 0; head < queue.length; head++) {
    const idx = queue[head];
    const r = Math.floor(idx / MAP_COLS), c = idx % MAP_COLS;
    for (const [dc, dr] of NEIGHBORS) {
      const nc = c + dc, nr = r + dr;
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
  field: FlowField, solid: boolean[][], x: number, y: number, tileW: number, tileH: number,
): { x: number; y: number } | null {
  const c = Math.floor(x / tileW), r = Math.floor(y / tileH);
  if (c < 0 || r < 0 || c >= MAP_COLS || r >= MAP_ROWS) return null;
  const here = field[r * MAP_COLS + c];
  if (here <= 0) return null;
  let best = here, bc = c, br = r;
  // vecinos ortogonales y diagonales (diagonal solo si no corta esquina de muro)
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    if (!dr && !dc) continue;
    const nc = c + dc, nr = r + dr;
    if (nc < 0 || nr < 0 || nc >= MAP_COLS || nr >= MAP_ROWS || solid[nr][nc]) continue;
    if (dc && dr && (solid[r][nc] || solid[nr][c])) continue;
    const d = field[nr * MAP_COLS + nc];
    if (d !== -1 && d < best) { best = d; bc = nc; br = nr; }
  }
  if (bc === c && br === r) return null;
  const tx = (bc + 0.5) * tileW, ty = (br + 0.5) * tileH;
  const dx = tx - x, dy = ty - y, len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
}

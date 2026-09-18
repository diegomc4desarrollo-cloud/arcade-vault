// Valida los 10 mapas de FLOOR_MAPS contra las reglas de diseño de plantas
// (specs/07-arena-zombie-plantas-spec.md): 32x18 exactas, todo el suelo
// alcanzable desde 'P', ningún pasillo/puerta de 1 casilla, una 'P',
// al menos 2 'S' y al menos 2 'W' por planta.
//
// Script standalone (no hay framework de test en el proyecto): se ejecuta
// con `node scripts/validate-floor-maps.ts` (Node 24 soporta TS nativo).
import { FLOOR_MAPS, MAP_COLS, MAP_ROWS } from "../app/games/arena-zombie/maps.ts";

const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

let failures = 0;

function fail(label: string, message: string): void {
  failures++;
  console.error(`✗ ${label}: ${message}`);
}

for (const floor of FLOOR_MAPS) {
  const label = `Planta ${floor.id} (${floor.name})`;

  if (floor.rows.length !== MAP_ROWS) {
    fail(label, `debe tener ${MAP_ROWS} filas, tiene ${floor.rows.length}`);
    continue;
  }
  const badRow = floor.rows.findIndex((row) => row.length !== MAP_COLS);
  if (badRow !== -1) {
    fail(
      label,
      `fila ${badRow} debe medir ${MAP_COLS} columnas, mide ${floor.rows[badRow].length}`,
    );
    continue;
  }

  const grid = floor.rows.map((row) => [...row]);
  const isWall = (r: number, c: number): boolean =>
    r < 0 || c < 0 || r >= MAP_ROWS || c >= MAP_COLS || grid[r][c] === "#";

  let playerCount = 0;
  let spawnCount = 0;
  let weaponCount = 0;
  let playerPos: { r: number; c: number } | null = null;

  for (let r = 0; r < MAP_ROWS; r++) {
    for (let c = 0; c < MAP_COLS; c++) {
      const ch = grid[r][c];
      if (ch === "P") {
        playerCount++;
        playerPos = { r, c };
      } else if (ch === "S") spawnCount++;
      else if (ch === "W") weaponCount++;
    }
  }

  if (playerCount !== 1) fail(label, `debe tener exactamente 1 'P', tiene ${playerCount}`);
  if (spawnCount < 2) fail(label, `debe tener al menos 2 'S', tiene ${spawnCount}`);
  if (weaponCount < 2) fail(label, `debe tener al menos 2 'W', tiene ${weaponCount}`);

  // Conectividad: BFS desde 'P' sobre todas las casillas de suelo.
  if (playerPos) {
    const visited = new Set<number>([playerPos.r * MAP_COLS + playerPos.c]);
    const queue: number[] = [...visited];
    while (queue.length) {
      const idx = queue.shift()!;
      const r = Math.floor(idx / MAP_COLS);
      const c = idx % MAP_COLS;
      for (const [dr, dc] of DIRS) {
        const nr = r + dr;
        const nc = c + dc;
        if (isWall(nr, nc)) continue;
        const nidx = nr * MAP_COLS + nc;
        if (visited.has(nidx)) continue;
        visited.add(nidx);
        queue.push(nidx);
      }
    }
    let totalFloor = 0;
    for (let r = 0; r < MAP_ROWS; r++) {
      for (let c = 0; c < MAP_COLS; c++) if (!isWall(r, c)) totalFloor++;
    }
    if (visited.size !== totalFloor) {
      fail(label, `${totalFloor - visited.size} casilla(s) de suelo inalcanzable(s) desde 'P'`);
    }
  }

  // Anchura mínima 2: ninguna casilla de suelo puede tener muro en ambos
  // lados opuestos del mismo eje (eso sería un pasillo o puerta de 1 casilla).
  for (let r = 0; r < MAP_ROWS; r++) {
    for (let c = 0; c < MAP_COLS; c++) {
      if (isWall(r, c)) continue;
      const horizontalPinch = isWall(r - 1, c) && isWall(r + 1, c);
      const verticalPinch = isWall(r, c - 1) && isWall(r, c + 1);
      if (horizontalPinch || verticalPinch) {
        fail(label, `pasillo/puerta de 1 casilla en fila ${r}, columna ${c}`);
      }
    }
  }
}

if (failures > 0) {
  console.error(`\n${failures} fallo(s) de validación en FLOOR_MAPS.`);
  process.exit(1);
}
console.log(`✓ Los ${FLOOR_MAPS.length} mapas de FLOOR_MAPS son válidos.`);

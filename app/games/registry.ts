import type { GameModule } from "./types";

// Juegos con motor real. La clave es el `id` del juego en `app/data.ts`.
// Cada entrada carga el módulo bajo demanda (code splitting) desde el cliente.
export const GAME_MODULES: Record<string, () => Promise<GameModule>> = {
  asteroides: () => import("./asteroides").then((m) => m.default),
};

export function isPlayable(id: string): boolean {
  return id in GAME_MODULES;
}

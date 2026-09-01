// Contrato común de todos los juegos jugables de Arcade Vault.
// El motor de cada juego vive en un <canvas> dentro del reproductor y se
// comunica con React en dos direcciones: emite eventos de estado y expone
// un handle para que React lo controle (pausa, táctil, limpieza).

// Motor → React: el motor avisa de cada cambio de estado.
export type GameEvents = {
  onScore: (score: number) => void;
  onLives: (lives: number) => void;
  onLevel: (level: number) => void;
  onGameOver: (finalScore: number) => void;
};

// React → motor: acciones táctiles inyectadas desde los botones en pantalla.
export type TouchAction = "left" | "right" | "thrust" | "fire";

// Handle con el que React controla una partida en curso.
export type GameHandle = {
  pause: () => void;
  resume: () => void;
  setTouch: (action: TouchAction, active: boolean) => void;
  destroy: () => void; // cancela rAF y quita todos los listeners
};

// Lo que exporta el módulo de cada juego (export default).
export type GameModule = {
  width: number; // resolución interna del canvas (800 en asteroides)
  height: number; // (600)
  create: (canvas: HTMLCanvasElement, events: GameEvents) => GameHandle;
};

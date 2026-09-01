"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { GAME_MODULES } from "@/app/games/registry";
import type { GameHandle, TouchAction } from "@/app/games/types";

type Props = {
  gameId: string;
  paused: boolean;
  onScore: (score: number) => void;
  onLives: (lives: number) => void;
  onLevel: (level: number) => void;
  onGameOver: (finalScore: number) => void;
  onAutoPause: () => void;
};

// Teclas que el juego usa y que, sin interceptar, harían scroll de la página.
const GAME_KEYS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space"]);

function isTextTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
}

// ¿Puntero grueso (móvil / tablet)? Se lee de `matchMedia` de forma reactiva
// y segura para SSR (el snapshot de servidor es `false`).
const COARSE_QUERY = "(pointer: coarse)";
function subscribeCoarse(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return () => {};
  }
  const mql = window.matchMedia(COARSE_QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}
function getCoarseSnapshot(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(COARSE_QUERY).matches
    : false;
}
const getCoarseServerSnapshot = () => false;

type TouchBtn = { action: TouchAction; label: string; className: string; hold: boolean };

// Dos grupos flex anclados a las esquinas inferiores del canvas. El tamaño de
// los botones y los huecos se escalan con `clamp()` en el CSS, así que los
// grupos nunca se solapan aunque el recuadro CRT sea estrecho (móvil).
const TOUCH_GROUPS: Array<{ side: "left" | "right"; buttons: TouchBtn[] }> = [
  {
    side: "left",
    buttons: [
      { action: "left", label: "◄", className: "gt-btn", hold: true },
      { action: "right", label: "►", className: "gt-btn", hold: true },
    ],
  },
  {
    side: "right",
    buttons: [
      { action: "thrust", label: "▲", className: "gt-btn", hold: true },
      { action: "fire", label: "●", className: "gt-btn gt-fire", hold: false },
    ],
  },
];

export default function GameCanvas({
  gameId,
  paused,
  onScore,
  onLives,
  onLevel,
  onGameOver,
  onAutoPause,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handleRef = useRef<GameHandle | null>(null);

  // Callbacks siempre frescos sin tener que re-crear el motor.
  const cbRef = useRef({ onScore, onLives, onLevel, onGameOver, onAutoPause });
  useEffect(() => {
    cbRef.current = { onScore, onLives, onLevel, onGameOver, onAutoPause };
  });

  const pausedRef = useRef(paused);
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  // Botones táctiles: solo con puntero grueso (móvil / tablet).
  const showTouch = useSyncExternalStore(
    subscribeCoarse,
    getCoarseSnapshot,
    getCoarseServerSnapshot,
  );

  // Monta el motor del juego dentro del canvas.
  useEffect(() => {
    const loader = GAME_MODULES[gameId];
    if (!loader || !canvasRef.current) return;

    let cancelled = false;

    loader().then((mod) => {
      const canvas = canvasRef.current;
      if (cancelled || !canvas) return;
      const handle = mod.create(canvas, {
        onScore: (v) => cbRef.current.onScore(v),
        onLives: (v) => cbRef.current.onLives(v),
        onLevel: (v) => cbRef.current.onLevel(v),
        onGameOver: (v) => cbRef.current.onGameOver(v),
      });
      handleRef.current = handle;
      if (pausedRef.current) handle.pause();
    });

    return () => {
      cancelled = true;
      handleRef.current?.destroy();
      handleRef.current = null;
    };
  }, [gameId]);

  // Sincroniza la pausa controlada por React.
  useEffect(() => {
    const handle = handleRef.current;
    if (!handle) return;
    if (paused) handle.pause();
    else handle.resume();
  }, [paused]);

  // Autopausa cuando la pestaña pasa a segundo plano.
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) cbRef.current.onAutoPause();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // Evita que las teclas de juego desplacen la página (salvo en inputs).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (GAME_KEYS.has(e.code) && !isTextTarget(e.target)) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
    };
  }, []);

  const touch = (action: TouchAction, active: boolean) => {
    handleRef.current?.setTouch(action, active);
  };

  return (
    <div className="game-canvas">
      <canvas ref={canvasRef} className="game-canvas-el" width={800} height={600} />
      {showTouch && (
        <div className="game-touch">
          {TOUCH_GROUPS.map(({ side, buttons }) => (
            <div key={side} className={`gt-group gt-group-${side}`}>
              {buttons.map(({ action, label, className, hold }) => (
                <button
                  key={action}
                  type="button"
                  className={className}
                  aria-label={action}
                  onContextMenu={(e) => e.preventDefault()}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    touch(action, true);
                  }}
                  onPointerUp={() => hold && touch(action, false)}
                  onPointerCancel={() => hold && touch(action, false)}
                  onPointerLeave={() => hold && touch(action, false)}
                >
                  {label}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

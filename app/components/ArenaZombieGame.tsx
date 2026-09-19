"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getUser, saveScore } from "@/app/lib/session";
import { bossForFloor } from "@/app/games/arena-zombie/bosses";
import { create } from "@/app/games/arena-zombie/engine";
import { FLOOR_MAPS } from "@/app/games/arena-zombie/maps";
import type { ArenaZombieHandle, HudSnapshot } from "@/app/games/arena-zombie/types";

type Phase = "start" | "playing" | "gameover" | "victory";

const EMPTY_HUD: HudSnapshot = {
  hp: 100,
  score: 0,
  wave: 1,
  floor: 1,
  floorName: FLOOR_MAPS[0].name,
  weaponName: "Pistola",
  ammo: "∞",
};

// La torre se lee de arriba abajo, como se sube el edificio: la planta 10 en lo alto.
const TOWER = FLOOR_MAPS.map((f) => f.id).reverse();

export default function ArenaZombieGame() {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handleRef = useRef<ArenaZombieHandle | null>(null);
  const bannerTimeout = useRef<number | undefined>(undefined);

  const [phase, setPhase] = useState<Phase>("start");
  const [hud, setHud] = useState<HudSnapshot>(EMPTY_HUD);
  const [banner, setBanner] = useState<{ big: string; small: string } | null>(null);
  const [finalScore, setFinalScore] = useState(0);
  const [finalWave, setFinalWave] = useState(1);
  const [best, setBest] = useState(0);
  const [name, setName] = useState("INVITADO");
  const [saved, setSaved] = useState(false);
  const [waveClear, setWaveClear] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);

  const showBanner = useCallback((big: string, small: string) => {
    setBanner({ big, small });
    window.clearTimeout(bannerTimeout.current);
    bannerTimeout.current = window.setTimeout(() => setBanner(null), 1800);
  }, []);

  const handleGameOver = useCallback((s: number, w: number) => {
    setFinalScore(s);
    setFinalWave(w);
    setBest((b) => Math.max(b, s));
    setName(getUser()?.name ?? "INVITADO");
    setSaved(false);
    setPhase("gameover");
  }, []);

  const handleVictory = useCallback((s: number, w: number) => {
    setFinalScore(s);
    setFinalWave(w);
    setBest((b) => Math.max(b, s));
    setName(getUser()?.name ?? "INVITADO");
    setSaved(false);
    setPhase("victory");
  }, []);

  const handleWaveClear = useCallback((w: number) => {
    setWaveClear(w);
  }, []);

  const cbRef = useRef({
    onHud: setHud,
    onBanner: showBanner,
    onGameOver: handleGameOver,
    onVictory: handleVictory,
    onWaveClear: handleWaveClear,
  });
  useEffect(() => {
    cbRef.current = {
      onHud: setHud,
      onBanner: showBanner,
      onGameOver: handleGameOver,
      onVictory: handleVictory,
      onWaveClear: handleWaveClear,
    };
  }, [showBanner, handleGameOver, handleVictory, handleWaveClear]);

  // Monta el motor una sola vez y lo limpia al desmontar.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handle = create(canvas, {
      onHud: (h) => cbRef.current.onHud(h),
      onBanner: (a, b) => cbRef.current.onBanner(a, b),
      onGameOver: (s, w) => cbRef.current.onGameOver(s, w),
      onVictory: (s, w) => cbRef.current.onVictory(s, w),
      onWaveClear: (w) => cbRef.current.onWaveClear(w),
    });
    handleRef.current = handle;
    return () => {
      handle.destroy();
      handleRef.current = null;
      window.clearTimeout(bannerTimeout.current);
    };
  }, []);

  // Pausa manual con Escape. Solo durante la partida: en el descanso entre oleadas ya hay
  // una decisión pendiente en pantalla, y en las pantallas de inicio/final no hay nada que pausar.
  const togglePause = useCallback(() => {
    if (phase !== "playing" || waveClear !== null) return;
    setPaused((p) => {
      const next = !p;
      if (next) handleRef.current?.pause();
      else handleRef.current?.resume();
      return next;
    });
  }, [phase, waveClear]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      togglePause();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePause]);

  // Autopausa al pasar la pestaña a segundo plano. Al volver no se reanuda si el jugador
  // había pausado a mano: su decisión manda sobre la automática.
  useEffect(() => {
    const onVisibility = () => {
      const handle = handleRef.current;
      if (!handle) return;
      if (document.hidden) handle.pause();
      else if (phase === "playing" && !paused && waveClear === null) handle.resume();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [phase, paused, waveClear]);

  const startRun = () => {
    const handle = handleRef.current;
    if (!handle) return;
    handle.initAudio();
    setHud(EMPTY_HUD);
    setBanner(null);
    setSaved(false);
    setWaveClear(null);
    setPaused(false);
    handle.start();
    setPhase("playing");
  };

  const resolveWaveClear = (healFull: boolean) => {
    handleRef.current?.continueAfterWave(healFull);
    setWaveClear(null);
  };

  const persistScore = () => {
    saveScore({
      game: "arena-zombie",
      score: finalScore,
      name: name.trim() || "INVITADO",
      wave: finalWave,
    });
    setSaved(true);
  };

  const exit = () => router.push("/juegos/arena-zombie");

  return (
    <div className="az-root">
      <canvas ref={canvasRef} className="az-canvas" />

      <button type="button" className="az-exit" onClick={exit}>
        ← VAULT
      </button>

      {phase === "playing" && (
        <div className="az-hud">
          <div className="az-hud-tl">
            <div className="az-hp-label">Integridad</div>
            <div className="az-hp">
              <div className="az-hp-fill" style={{ width: `${Math.max(0, hud.hp)}%` }} />
            </div>
          </div>
          <div className="az-hud-tr">
            <div className="az-hud-cap">Puntos</div>
            <div className="az-score-val">{hud.score.toLocaleString("es-ES")}</div>
            <div className="az-wave-val">OLEADA {hud.wave}</div>
            <div className="az-floor-val">
              PLANTA {hud.floor} <span className="az-floor-name">{hud.floorName}</span>
            </div>
            {/* La torre: dónde estás en el edificio y qué plantas guardan un jefe. */}
            <ol className="az-tower" aria-label={`Planta ${hud.floor} de ${FLOOR_MAPS.length}`}>
              {TOWER.map((id) => (
                <li
                  key={id}
                  className={[
                    "az-rung",
                    id === hud.floor ? "az-rung-here" : "",
                    id < hud.floor ? "az-rung-done" : "",
                    bossForFloor(id) ? "az-rung-boss" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                />
              ))}
            </ol>
          </div>
          <div className="az-hud-bl">
            <div className="az-weapon-name">{hud.weaponName}</div>
            <div className="az-weapon-ammo">{hud.ammo}</div>
          </div>
        </div>
      )}

      {paused && phase === "playing" && waveClear === null && (
        <div className="az-overlay">
          <div className="az-panel">
            <div className="az-pause-label">Partida en pausa</div>
            <div className="az-pause-where">
              Planta {hud.floor} — {hud.floorName}
            </div>
            <div className="az-go-best">
              Oleada {hud.wave} · {hud.score.toLocaleString("es-ES")} puntos · Vida{" "}
              {Math.max(0, hud.hp)}%
            </div>
            <button type="button" className="az-play az-retry" onClick={togglePause}>
              Reanudar
            </button>
            <div className="az-pause-hint">o pulsa Escape</div>
          </div>
        </div>
      )}

      {banner && phase === "playing" && (
        <div className="az-banner">
          <div className="az-banner-big">{banner.big}</div>
          <div className="az-banner-small">{banner.small}</div>
        </div>
      )}

      {waveClear !== null && phase === "playing" && (
        <div className="az-overlay">
          <div className="az-panel">
            <div className="az-victory-label">Oleada {waveClear} superada</div>
            <div className="az-go-best">Vida actual: {Math.max(0, hud.hp)}%</div>
            <p className="az-wavebreak-question">¿Recuperar la vida al máximo antes de seguir?</p>
            <div className="az-wavebreak-actions">
              <button type="button" className="az-play" onClick={() => resolveWaveClear(true)}>
                Sí
              </button>
              <button type="button" className="az-decline" onClick={() => resolveWaveClear(false)}>
                No
              </button>
            </div>
          </div>
        </div>
      )}

      {phase === "start" && (
        <div className="az-overlay">
          <div className="az-panel">
            <h1 className="az-title">ARENA Z</h1>
            <div className="az-subtitle">shooter top-down de oleadas</div>
            <p className="az-howto">
              <b>Mover</b> — WASD o flechas (o joystick izquierdo táctil)
              <br />
              <b>Apuntar</b> — ratón (o joystick derecho táctil)
              <br />
              <b>Disparar</b> — clic mantenido (o mantener el lado derecho)
              <br />
              <b>Pausar</b> — Escape
              <br />
              <b>Objetivo</b> — sobrevive oleadas cada vez más duras y recoge armas mejores por el
              camino.
            </p>
            <button type="button" className="az-play" onClick={startRun}>
              Empezar
            </button>
          </div>
        </div>
      )}

      {phase === "gameover" && (
        <div className="az-overlay">
          <div className="az-panel">
            <div className="az-go-label">Has caído</div>
            <div className="az-go-score">{finalScore.toLocaleString("es-ES")}</div>
            <div className="az-go-best">
              Mejor: {best.toLocaleString("es-ES")} · Oleada {finalWave}
            </div>
            {!saved ? (
              <div className="az-save-row">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value.toUpperCase().slice(0, 10))}
                  placeholder="TUS INICIALES"
                />
                <button type="button" className="az-play" onClick={persistScore}>
                  GUARDAR PUNTUACIÓN
                </button>
              </div>
            ) : (
              <div className="az-saved">▸ PUNTUACIÓN GUARDADA_</div>
            )}
            <button type="button" className="az-play az-retry" onClick={startRun}>
              Reintentar
            </button>
          </div>
        </div>
      )}

      {phase === "victory" && (
        <div className="az-overlay">
          <div className="az-panel">
            <div className="az-victory-label">Edificio despejado</div>
            <div className="az-go-score">{finalScore.toLocaleString("es-ES")}</div>
            <div className="az-go-best">
              Mejor: {best.toLocaleString("es-ES")} · Oleada {finalWave}
            </div>
            {!saved ? (
              <div className="az-save-row">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value.toUpperCase().slice(0, 10))}
                  placeholder="TUS INICIALES"
                />
                <button type="button" className="az-play" onClick={persistScore}>
                  GUARDAR PUNTUACIÓN
                </button>
              </div>
            ) : (
              <div className="az-saved">▸ PUNTUACIÓN GUARDADA_</div>
            )}
            <button type="button" className="az-play az-retry" onClick={startRun}>
              Jugar de nuevo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

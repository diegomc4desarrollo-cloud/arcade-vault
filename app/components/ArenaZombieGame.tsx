"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getUser, saveScore } from "@/app/lib/session";
import { create } from "@/app/games/arena-zombie/engine";
import type { ArenaZombieHandle, HudSnapshot } from "@/app/games/arena-zombie/types";

type Phase = "start" | "playing" | "gameover";

const EMPTY_HUD: HudSnapshot = {
  hp: 100,
  score: 0,
  wave: 1,
  weaponName: "Pistola",
  ammo: "∞",
};

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

  const cbRef = useRef({
    onHud: setHud,
    onBanner: showBanner,
    onGameOver: handleGameOver,
  });
  useEffect(() => {
    cbRef.current = {
      onHud: setHud,
      onBanner: showBanner,
      onGameOver: handleGameOver,
    };
  }, [showBanner, handleGameOver]);

  // Monta el motor una sola vez y lo limpia al desmontar.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handle = create(canvas, {
      onHud: (h) => cbRef.current.onHud(h),
      onBanner: (a, b) => cbRef.current.onBanner(a, b),
      onGameOver: (s, w) => cbRef.current.onGameOver(s, w),
    });
    handleRef.current = handle;
    return () => {
      handle.destroy();
      handleRef.current = null;
      window.clearTimeout(bannerTimeout.current);
    };
  }, []);

  // Autopausa al pasar la pestaña a segundo plano.
  useEffect(() => {
    const onVisibility = () => {
      const handle = handleRef.current;
      if (!handle) return;
      if (document.hidden) handle.pause();
      else if (phase === "playing") handle.resume();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [phase]);

  const startRun = () => {
    const handle = handleRef.current;
    if (!handle) return;
    handle.initAudio();
    setHud(EMPTY_HUD);
    setBanner(null);
    setSaved(false);
    handle.start();
    setPhase("playing");
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
          </div>
          <div className="az-hud-bl">
            <div className="az-weapon-name">{hud.weaponName}</div>
            <div className="az-weapon-ammo">{hud.ammo}</div>
          </div>
        </div>
      )}

      {banner && phase === "playing" && (
        <div className="az-banner">
          <div className="az-banner-big">{banner.big}</div>
          <div className="az-banner-small">{banner.small}</div>
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
    </div>
  );
}

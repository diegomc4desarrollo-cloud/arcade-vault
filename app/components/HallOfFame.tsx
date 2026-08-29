"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { getScores, type Game, type ScoreRow } from "@/app/data";
import { getUser, subscribeUser } from "@/app/lib/session";

const getServerUserSnapshot = () => null;

export default function HallOfFame({
  games,
  initialGameId,
  initialScores,
}: {
  games: Game[];
  initialGameId: string;
  initialScores: ScoreRow[];
}) {
  const [tab, setTab] = useState(initialGameId);
  const [rows, setRows] = useState<ScoreRow[]>(initialScores);
  const user = useSyncExternalStore(subscribeUser, getUser, getServerUserSnapshot);

  const selectTab = (gameId: string) => {
    setTab(gameId);
    getScores(gameId, 12).then(setRows);
  };

  const game = games.find((g) => g.id === tab);
  const youRank = user ? Math.floor(8 + (tab.length % 4)) : null;
  const youScore = user ? (rows[5]?.score ?? 0) - 2400 : null;

  if (!game) return null;

  return (
    <div className="av-hall fade-in">
      <div className="hall-head">
        <h1>SALÓN DE LA FAMA</h1>
        <p className="pixel" style={{ fontSize: 10 }}>
          LOS NOMBRES QUE NUNCA SE BORRAN DE LA PANTALLA
        </p>
      </div>

      <div className="hall-tabs">
        {games.map((g) => (
          <button
            key={g.id}
            className={"chip" + (tab === g.id ? " active" : "")}
            onClick={() => selectTab(g.id)}
          >
            {g.title}
          </button>
        ))}
      </div>

      <div className="podium">
        <div className="podium-slot silver">
          <div className="rank-num">02</div>
          <div className="name">{rows[1]?.name}</div>
          <div className="score">{rows[1]?.score.toLocaleString("es-ES")}</div>
          <div className="date">{rows[1]?.date}</div>
        </div>
        <div className="podium-slot gold">
          <div className="pixel" style={{ fontSize: 9, color: "var(--gold)", letterSpacing: "0.18em" }}>
            CAMPEÓN
          </div>
          <div className="rank-num" style={{ fontSize: 36, marginTop: 4 }}>01</div>
          <div className="name">{rows[0]?.name}</div>
          <div className="score" style={{ fontSize: 20 }}>{rows[0]?.score.toLocaleString("es-ES")}</div>
          <div className="date">{rows[0]?.date}</div>
        </div>
        <div className="podium-slot bronze">
          <div className="rank-num">03</div>
          <div className="name">{rows[2]?.name}</div>
          <div className="score">{rows[2]?.score.toLocaleString("es-ES")}</div>
          <div className="date">{rows[2]?.date}</div>
        </div>
      </div>

      <div className="hall-table">
        <div className="th">
          <div>RANGO</div>
          <div>JUGADOR</div>
          <div>PUNTUACIÓN</div>
          <div>FECHA</div>
        </div>
        {rows.map((r, i) => (
          <div
            key={r.name + i}
            className={"tr" + (i === 0 ? " top1" : i === 1 ? " top2" : i === 2 ? " top3" : "")}
            style={{ animationDelay: `${i * 50}ms` }}
          >
            <div className="rk">#{String(r.rank).padStart(2, "0")}</div>
            <div className="pl">{r.name}</div>
            <div className="sc">{r.score.toLocaleString("es-ES")}</div>
            <div className="dt">{r.date}</div>
          </div>
        ))}
        {user && (
          <>
            <div className="tr you-label">▸ TU MEJOR MARCA EN {game.title}</div>
            <div className="tr you" style={{ animationDelay: `${rows.length * 50 + 50}ms` }}>
              <div className="rk" style={{ color: "var(--yellow)" }}>#{String(youRank).padStart(2, "0")}</div>
              <div className="pl" style={{ color: "var(--yellow)" }}>{user.name}</div>
              <div className="sc" style={{ color: "var(--yellow)", textShadow: "0 0 6px rgba(245,255,0,0.5)" }}>
                {(youScore || 9999).toLocaleString("es-ES")}
              </div>
              <div className="dt">11/05/2026</div>
            </div>
          </>
        )}
      </div>

      <div style={{ textAlign: "center", marginTop: 32 }}>
        <Link href="/juegos" className="btn lg">VOLVER A LA BIBLIOTECA</Link>
      </div>
    </div>
  );
}

import { notFound } from "next/navigation";
import { getGameById } from "@/app/data";
import GamePlayer from "@/app/components/GamePlayer";
import ArenaZombieGame from "@/app/components/ArenaZombieGame";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const game = await getGameById(id);
  if (!game) notFound();

  // Arena Z es un juego autónomo a pantalla completa: no usa el marco
  // reproductor (GamePlayer / contrato GameModule). Ver SPEC 06.
  if (game.id === "arena-zombie") return <ArenaZombieGame />;

  return <GamePlayer game={game} />;
}

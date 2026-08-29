import { notFound } from "next/navigation";
import { getGameById } from "@/app/data";
import GamePlayer from "@/app/components/GamePlayer";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const game = await getGameById(id);
  if (!game) notFound();

  return <GamePlayer game={game} />;
}

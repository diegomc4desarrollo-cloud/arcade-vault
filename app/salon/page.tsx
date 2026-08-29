import { getGames, getScores } from "@/app/data";
import HallOfFame from "@/app/components/HallOfFame";

export default async function Page() {
  const games = await getGames();
  const initialGame = games[0];
  const initialScores = initialGame ? await getScores(initialGame.id, 12) : [];

  return <HallOfFame games={games} initialGameId={initialGame?.id ?? ""} initialScores={initialScores} />;
}

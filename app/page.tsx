import { getGames, getRecentScores, getTopPlayers } from "./data";
import HomeScreen from "./components/HomeScreen";

export default async function Page() {
  const [games, recentScores, topPlayers] = await Promise.all([
    getGames(),
    getRecentScores(),
    getTopPlayers(),
  ]);

  return (
    <HomeScreen games={games} recentScores={recentScores} topPlayers={topPlayers} />
  );
}

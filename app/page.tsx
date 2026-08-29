import { getCategories, getGames } from "./data";
import LibraryBrowser from "./components/LibraryBrowser";

export default async function Page() {
  const [games, categories] = await Promise.all([getGames(), getCategories()]);

  return (
    <div className="fade-in">
      <section className="av-hero">
        <h1 className="flicker">ARCADE VAULT</h1>
        <div className="sub">
          INSERTA UNA MONEDA PARA JUGAR <span className="blink">_</span>
        </div>
      </section>

      <LibraryBrowser games={games} categories={categories} />
    </div>
  );
}

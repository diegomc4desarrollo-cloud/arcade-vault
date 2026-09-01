// Datos ficticios de Arcade Vault.
// Expuestos como funciones async para poder sustituirse por una fuente
// real (BD/API) sin tener que tocar las pantallas que los consumen.

export type Category = "TODOS" | "ARCADE" | "PUZZLE" | "SHOOTER" | "VERSUS";

export type Game = {
  id: string;
  title: string;
  short: string;
  long: string;
  cat: Exclude<Category, "TODOS">;
  cover: string;
  color: "cyan" | "magenta" | "yellow" | "green";
  best: number;
  plays: string;
};

export type ScoreRow = {
  rank: number;
  name: string;
  score: number;
  date: string;
};

// Fila del ticker "últimas puntuaciones" del Home.
export type RecentScore = {
  name: string;
  game: string; // título del juego
  score: number;
  ago: string; // "hace 2 min" — derivado del índice, no de Date.now()
  color: Game["color"];
};

// Fila del "top jugadores" del Home.
export type TopPlayer = {
  rank: number;
  name: string;
  score: number;
};

const GAMES: Game[] = [
  {
    id: "bloque-buster",
    title: "BLOQUE BUSTER",
    short: "Rebota la pelota y destruye muros de neón.",
    long: "Pilota una nave-paleta y rebota un núcleo de plasma para pulverizar muros de bloques cromáticos. Cada nivel reorganiza la grilla en patrones imposibles. ¿Hasta dónde llegará tu racha?",
    cat: "ARCADE",
    cover: "cover-bricks",
    color: "cyan",
    best: 28450,
    plays: "12.4K",
  },
  {
    id: "caida",
    title: "CAÍDA",
    short: "Encaja las piezas antes de que el techo te aplaste.",
    long: "Piezas geométricas descienden desde la oscuridad. Rótalas, encástralas y limpia líneas para sobrevivir. La velocidad aumenta sin piedad cada 10 líneas.",
    cat: "PUZZLE",
    cover: "cover-tetro",
    color: "magenta",
    best: 184220,
    plays: "31.8K",
  },
  {
    id: "serpentina",
    title: "SERPENTINA",
    short: "Crece sin morder tu propia cola.",
    long: "Una serpiente de luz recorre la grilla buscando núcleos magenta. Cada bocado la alarga y la hace más veloz. Un movimiento en falso y se devora a sí misma.",
    cat: "ARCADE",
    cover: "cover-snake",
    color: "green",
    best: 7820,
    plays: "9.1K",
  },
  {
    id: "gloton",
    title: "GLOTÓN",
    short: "Devora puntos y escapa de los fantasmas.",
    long: "Un círculo glotón patrulla un laberinto coleccionando puntos luminosos. Cuatro espectros lo persiguen, pero cada cierto tiempo aparece una píldora que invierte los papeles.",
    cat: "ARCADE",
    cover: "cover-glot",
    color: "yellow",
    best: 96400,
    plays: "27.2K",
  },
  {
    id: "invasores",
    title: "INVASORES",
    short: "Defiende el planeta de filas alienígenas.",
    long: "Olas de pixeles hostiles descienden formación tras formación. Mueve tu cañón en horizontal y abre fuego con precisión, antes de que toquen la superficie.",
    cat: "SHOOTER",
    cover: "cover-invaders",
    color: "green",
    best: 54190,
    plays: "18.0K",
  },
  {
    id: "asteroides",
    title: "ASTEROIDES",
    short: "Rompe la roca en gravedad cero y esquiva los fragmentos.",
    long: "Tu nave triangular flota en vacío absoluto. Rota, propúlsate y dispara para partir cada asteroide en fragmentos más rápidos y pequeños. Recoge el orbe 3x para disparo triple y sobrevive nivel tras nivel.",
    cat: "SHOOTER",
    cover: "cover-rocas",
    color: "yellow",
    best: 41200,
    plays: "15.6K",
  },
  {
    id: "ranaria",
    title: "RANARIA",
    short: "Cruza la autopista de pixeles.",
    long: "Salta entre carriles de coches a toda velocidad y troncos a la deriva en el río. Llega a los nenúfares antes de que se acabe el tiempo.",
    cat: "ARCADE",
    cover: "cover-rana",
    color: "green",
    best: 18900,
    plays: "6.4K",
  },
  {
    id: "duelo-pixel",
    title: "DUELO PIXEL",
    short: "Dos paletas. Una pelota. Reflejos máximos.",
    long: "El duelo más puro: dos paletas verticales se enfrentan por rebotar una pelota luminosa. Modo solitario contra la CPU o partida local a dos jugadores.",
    cat: "VERSUS",
    cover: "cover-duelo",
    color: "cyan",
    best: 24,
    plays: "4.2K",
  },
];

const CATEGORIES: Category[] = ["TODOS", "ARCADE", "PUZZLE", "SHOOTER", "VERSUS"];

const PLAYERS = [
  "PX_KAI", "NEONFOX", "Z3R0COOL", "M00NRYU", "VAULT_07", "GLITCHA",
  "ATARI_KID", "CYBER_LU", "MAGENTA88", "SCANLINE", "BIT_LORD", "ARKADYA",
  "DROID_X", "RGB_QUEEN", "PIXEL_DAD", "RETROVIRA", "VECTORX", "JOY_STK",
];

function hashSeed(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) % 233280;
  }
  return hash || 1;
}

function seededScores(seed: number, count: number): ScoreRow[] {
  let s = seed;
  const rand = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  const used = new Set<string>();
  const rows: Array<Omit<ScoreRow, "rank">> = [];

  for (let i = 0; i < count; i++) {
    let name: string;
    do {
      name = PLAYERS[Math.floor(rand() * PLAYERS.length)];
    } while (used.has(name) && used.size < PLAYERS.length);
    used.add(name);

    const base = Math.floor(50000 + rand() * 250000);
    const score = Math.max(base - i * Math.floor(2000 + rand() * 4000), 1000);
    const day = String(1 + Math.floor(rand() * 28)).padStart(2, "0");
    const month = String(1 + Math.floor(rand() * 12)).padStart(2, "0");
    rows.push({ name, score, date: `${day}/${month}/2026` });
  }

  return rows
    .sort((a, b) => b.score - a.score)
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

export async function getGames(): Promise<Game[]> {
  return GAMES;
}

export async function getCategories(): Promise<Category[]> {
  return CATEGORIES;
}

export async function getGameById(id: string): Promise<Game | undefined> {
  return GAMES.find((game) => game.id === id);
}

export async function getScores(gameId: string, count = 12): Promise<ScoreRow[]> {
  return seededScores(hashSeed(gameId), count);
}

// Minutos "hace X" para el ticker; fijos y deterministas.
const RECENT_AGO_MINUTES = [2, 5, 8, 12, 18, 24, 31, 40, 52, 65];

// Ticker de últimas puntuaciones del Home: mezcla marcas de varios juegos
// del catálogo. Determinista (sin Date.now() ni aleatoriedad sin semilla).
export async function getRecentScores(count = 7): Promise<RecentScore[]> {
  const pool = GAMES.flatMap((game) =>
    seededScores(hashSeed(`${game.id}-recent`), 2).map((row) => ({
      name: row.name,
      game: game.title,
      score: row.score,
      color: game.color,
    })),
  );

  pool.sort(
    (a, b) => hashSeed(`${a.name}-${a.game}`) - hashSeed(`${b.name}-${b.game}`),
  );

  return pool.slice(0, count).map((entry, index) => ({
    ...entry,
    ago: `hace ${RECENT_AGO_MINUTES[index] ?? (index + 1) * 8} min`,
  }));
}

// Top jugadores del Home: mejor marca por jugador en todo el catálogo.
// Determinista.
export async function getTopPlayers(count = 5): Promise<TopPlayer[]> {
  const best = new Map<string, number>();

  for (const game of GAMES) {
    for (const row of seededScores(hashSeed(game.id), 6)) {
      if (row.score > (best.get(row.name) ?? 0)) {
        best.set(row.name, row.score);
      }
    }
  }

  return [...best.entries()]
    .map(([name, score]) => ({ name, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, count)
    .map((entry, index) => ({ rank: index + 1, ...entry }));
}

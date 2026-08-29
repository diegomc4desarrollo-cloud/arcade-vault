// Sesión de usuario y puntuaciones de partida, persistidas en localStorage.
// Solo para uso desde Client Components (el navegador es la única fuente).

export type SessionUser = { name: string };
export type SavedScore = { game: string; score: number; name: string; at: number };

const USER_KEY = "av_user";
const SCORES_KEY = "av_scores";

function hasStorage(): boolean {
  return typeof window !== "undefined";
}

// getUser() se usa como getSnapshot de useSyncExternalStore (Nav, GamePlayer),
// que exige devolver una referencia estable mientras no haya cambios reales:
// si cada llamada hiciera un JSON.parse nuevo, cada render vería un objeto
// distinto y entraría en loop infinito. Por eso se cachea aquí y solo se
// vuelve a leer de localStorage la primera vez o tras un setUser().
let cachedUser: SessionUser | null | undefined;

function readUserFromStorage(): SessionUser | null {
  if (!hasStorage()) return null;
  try {
    return JSON.parse(window.localStorage.getItem(USER_KEY) ?? "null");
  } catch {
    return null;
  }
}

export function getUser(): SessionUser | null {
  if (cachedUser === undefined) {
    cachedUser = readUserFromStorage();
  }
  return cachedUser;
}

export function setUser(user: SessionUser | null): void {
  if (!hasStorage()) return;
  try {
    if (user) {
      window.localStorage.setItem(USER_KEY, JSON.stringify(user));
    } else {
      window.localStorage.removeItem(USER_KEY);
    }
  } catch {
    // localStorage no disponible (p. ej. modo privado): la sesión no persiste.
  }
  cachedUser = user;
  notifyUserChange();
}

type Listener = () => void;
const userListeners = new Set<Listener>();

function notifyUserChange(): void {
  userListeners.forEach((listener) => listener());
}

// Permite que los componentes (p. ej. Nav) se suscriban a cambios de
// sesión hechos en el mismo tab, vía useSyncExternalStore.
export function subscribeUser(listener: Listener): () => void {
  userListeners.add(listener);
  return () => userListeners.delete(listener);
}

export function saveScore(entry: Omit<SavedScore, "at">): void {
  if (!hasStorage()) return;
  try {
    const raw = window.localStorage.getItem(SCORES_KEY) ?? "[]";
    const all: SavedScore[] = JSON.parse(raw);
    all.push({ ...entry, at: Date.now() });
    window.localStorage.setItem(SCORES_KEY, JSON.stringify(all));
  } catch {
    // localStorage no disponible: la puntuación no se guarda.
  }
}

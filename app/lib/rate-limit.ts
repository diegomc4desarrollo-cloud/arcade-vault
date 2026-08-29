// Rate limiter en memoria del proceso.
//
// Limitación conocida: el contador se reinicia al reiniciar el servidor y no
// se comparte entre instancias (deploy con escalado horizontal). Suficiente
// para frenar abuso básico del formulario de contacto.

const WINDOW_MS = 10 * 60 * 1000; // 10 minutos
const MAX_REQUESTS = 5;

const hits = new Map<string, number[]>();

/**
 * Comprueba y contabiliza una solicitud para `key` (p. ej. una IP).
 * Devuelve `true` si está permitida; `false` si `key` ya alcanzó
 * MAX_REQUESTS dentro de la ventana WINDOW_MS.
 */
export function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((ts) => now - ts < WINDOW_MS);

  if (recent.length >= MAX_REQUESTS) {
    hits.set(key, recent);
    return false;
  }

  recent.push(now);
  hits.set(key, recent);
  return true;
}

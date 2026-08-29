# SPEC 01 — MVP visual de Arcade Vault

> **Status:** Implementado
> **Depends on:** (ninguna)
> **Date:** 2026-08-29
> **Objective:** Implementar en `app/` (Next.js App Router) las cinco pantallas visuales del prototipo de referencia (biblioteca, detalle, reproductor, salón de la fama y autenticación) con datos ficticios, sin implementar la lógica jugable real de ningún juego.

> **Nota (SPEC 02):** La Biblioteca dejó de vivir en `/` y ahora está en `/juegos`; `/` es la landing page. Quedan superados los criterios de esta spec que ubicaban la Biblioteca en `/` (grid de 8 juegos, buscador y chips en `/`, redirección de `/auth` a `/`). El resto sigue vigente, ahora desde `/juegos`.

---

## Scope

**In:**

- Módulo `app/data.ts` con los tipos y los datos ficticios (juegos, categorías, generador de puntuaciones) expuestos como funciones `async`, pensado para poder sustituirse en el futuro por una fuente real (BD/API) sin tocar las pantallas.
- Navegación global (`Nav`) con biblioteca, salón de la fama, contador de créditos decorativo, estado de sesión (usuario logueado / invitado) y menú móvil, integrada en `app/layout.tsx` junto con el pie de página.
- Pantalla **Biblioteca** en `/`: buscador por nombre, filtro por categoría (chips), grid de tarjetas de juego con efecto tilt al hover.
- Pantalla **Detalle** en `/juegos/[id]`: portada, tags, descripción, estadísticas, tabla de mejores puntuaciones (leaderboard) y botones "Jugar ahora" / "Volver al vault".
- Pantalla **Reproductor** en `/juegos/[id]/jugar`: HUD (jugador, puntuación, vidas, nivel), pantalla CRT con la simulación decorativa de partida (puntuación que sube sola, sprites animados), pausa, fin de partida y modal para guardar la puntuación.
- Pantalla **Autenticación** en `/auth`: tabs iniciar sesión / crear cuenta, campos de formulario, botón "jugar como invitado", botones sociales decorativos (Google/GitHub sin funcionalidad real).
- Pantalla **Salón de la fama** en `/salon`: tabs por juego, podio (top 3), tabla de posiciones, fila destacada para el usuario logueado.
- Persistencia ligera en `localStorage`: sesión de usuario (`av_user`) y puntuaciones guardadas al terminar una partida (`av_scores`), igual que en el prototipo.
- Reutilización de las clases visuales ya existentes en `app/globals.css` (tema neón/retro, portadas generadas por CSS, animaciones) — no se reescribe el CSS, solo se consumen las clases ya portadas del prototipo.

**Out of scope (para futuras specs):**

- Implementación de la lógica jugable real de cualquiera de los ocho juegos del catálogo (Bloque Buster, Caída, Serpentina, etc.) — el reproductor solo simula visualmente una partida.
- Backend, API o base de datos real — `app/data.ts` es un mock que imita la forma de una futura fuente real, pero no se conecta a nada externo.
- Autenticación real (validación de credenciales, hashing, OAuth funcional con Google/GitHub).
- Que las puntuaciones guardadas en `av_scores` retroalimenten el Salón de la Fama o el leaderboard de detalle — ambos siguen usando siempre datos generados por el generador de puntuaciones simuladas, igual que el prototipo.
- Tests automatizados (el repo no tiene suite configurada todavía).
- Una auditoría o mejora de accesibilidad más allá de lo ya presente en el prototipo.

---

## Data model

`app/data.ts` — tipos y funciones async sobre datos en memoria (mock):

```ts
export type Category = "TODOS" | "ARCADE" | "PUZZLE" | "SHOOTER" | "VERSUS";

export type Game = {
  id: string;
  title: string;
  short: string;
  long: string;
  cat: Exclude<Category, "TODOS">;
  cover: string; // clase CSS de portada, p.ej. "cover-bricks"
  color: "cyan" | "magenta" | "yellow" | "green";
  best: number;
  plays: string;
};

export type ScoreRow = {
  rank: number;
  name: string;
  score: number;
  date: string; // "DD/MM/AAAA"
};

export async function getGames(): Promise<Game[]>;
export async function getCategories(): Promise<Category[]>;
export async function getGameById(id: string): Promise<Game | undefined>;
export async function getScores(gameId: string, count?: number): Promise<ScoreRow[]>;
```

Módulo aparte para sesión y puntuaciones de partida (solo cliente, no es dato ficticio del catálogo): `app/lib/session.ts`.

```ts
export type SessionUser = { name: string };
export type SavedScore = { game: string; score: number; name: string; at: number };

// claves en localStorage: "av_user", "av_scores"
export function getUser(): SessionUser | null;
export function setUser(user: SessionUser | null): void;
export function saveScore(entry: Omit<SavedScore, "at">): void;
```

Convenciones:

- `id` de juego: mismos slugs del prototipo (`bloque-buster`, `caida`, `serpentina`, `gloton`, `invasores`, `rocas`, `ranaria`, `duelo-pixel`).
- Puntuaciones formateadas en pantalla con `toLocaleString("es-ES")`.
- Todas las funciones de `app/data.ts` son `async` desde el inicio, aunque hoy solo lean arrays en memoria, para no tener que tocar las pantallas cuando se conecten a una fuente real.

---

## Implementation plan

1. Crear `app/data.ts` con los tipos (`Game`, `Category`, `ScoreRow`) y los datos ficticios migrados de `references/templates/data.jsx`, expuestos como `getGames`, `getCategories`, `getGameById`, `getScores` (todas `async`). Sin UI todavía.
2. Crear `app/lib/session.ts` con los helpers de cliente para leer/escribir `av_user` y `av_scores` en `localStorage` (`getUser`, `setUser`, `saveScore`), con comprobación de `typeof window` y `try/catch`.
3. Crear `app/components/Nav.tsx` (Client Component) migrando `nav.jsx`: usa `usePathname` para resaltar el enlace activo, lee la sesión con los helpers del paso 2, incluye el menú móvil (hamburguesa).
4. Integrar `<Nav />` y el pie de página (copyright/versión) en `app/layout.tsx`, sustituyendo el marcado por defecto de `create-next-app`. Test manual: `npm run dev` muestra la navegación y el pie en cualquier ruta.
5. Crear `app/components/GameCard.tsx` (tarjeta con tilt) y reescribir `app/page.tsx` como la pantalla Biblioteca: Server Component que hace `await getGames()` / `await getCategories()` y delega el buscador/filtro interactivo a un Client Component (`app/components/LibraryBrowser.tsx`). Test manual: `/` muestra el grid completo, buscar por nombre y filtrar por categoría funcionan.
6. Crear `app/juegos/[id]/page.tsx` (pantalla Detalle): Server Component que hace `await getGameById(id)` y `await getScores(id, 10)`; si el juego no existe, `notFound()`. Incluye el leaderboard y los botones de acción. Test manual: `/juegos/bloque-buster` muestra ficha y tabla de puntuaciones; un id inexistente da 404.
7. Crear `app/components/GamePlayer.tsx` (Client Component) migrando `reproductor.jsx` (HUD, CRT, simulación de puntuación, pausa, modal de fin con guardado vía `session.ts`) y `app/juegos/[id]/jugar/page.tsx`, que resuelve el juego con `await getGameById(id)` y renderiza el componente cliente. Test manual: jugar, pausar/reanudar, terminar partida y guardar la puntuación con un nombre.
8. Crear `app/auth/page.tsx` (Client Component) migrando `auth.jsx`: tabs, formularios, botón invitado; guarda la sesión con `session.ts` y redirige a `/` tras iniciar sesión. Test manual: iniciar sesión o entrar como invitado actualiza el `Nav`.
9. Crear `app/salon/page.tsx` (pantalla Salón de la Fama): Server Component que obtiene la lista de juegos (`getGames`) y un Client Component de tabs (`app/components/HallOfFame.tsx`) que pide `await getScores(gameId)` al cambiar de pestaña y pinta podio + tabla, incluyendo la fila del usuario logueado (leído con `session.ts`). Test manual: cambiar de pestaña cambia el podio/tabla; con sesión iniciada aparece la fila "tu mejor marca".
10. Limpieza final: eliminar cualquier resto del boilerplate de `create-next-app`, correr `npm run lint` y `npm run build` para confirmar que todo compila sin errores.

---

## Acceptance criteria

- [x] `npm run dev` arranca sin errores y `/` muestra la Biblioteca con el grid de 8 juegos.
- [x] El buscador de la Biblioteca filtra los juegos por título en tiempo real.
- [x] Los chips de categoría filtran el grid y "TODOS" muestra los 8 juegos.
- [x] Al pulsar una tarjeta o el botón "JUGAR" se navega a `/juegos/[id]` con los datos correctos del juego.
- [x] `/juegos/[id]` muestra la tabla de mejores puntuaciones con 10 filas ordenadas de mayor a menor.
- [x] Navegar a `/juegos/id-inexistente` devuelve una página 404.
- [x] "JUGAR AHORA" navega a `/juegos/[id]/jugar` y la puntuación del HUD sube sola cada pocos milisegundos.
- [x] El botón PAUSA detiene el incremento de puntuación y REANUDAR lo reactiva.
- [x] El botón FIN abre el modal de fin de partida con la puntuación final.
- [x] Guardar la puntuación en el modal escribe una entrada nueva en `localStorage` bajo la clave `av_scores`.
- [x] `/auth` permite iniciar sesión con un nombre de usuario y redirige a `/` mostrando ese nombre en el `Nav`.
- [x] El botón "JUGAR COMO INVITADO" en `/auth` guarda una sesión con nombre `INVITADO` (visible en el `Nav`) y redirige a `/`.
- [x] Cerrar sesión desde el `Nav` borra la sesión de `localStorage` y vuelve a mostrar "Iniciar Sesión".
- [x] `/salon` muestra podio y tabla para el primer juego por defecto y cambia al seleccionar otra pestaña de juego.
- [x] Con una sesión iniciada, `/salon` muestra una fila adicional con el nombre del usuario logueado.
- [x] El menú móvil (hamburguesa) se abre y cierra correctamente en viewport estrecho.
- [x] `npm run lint` no reporta errores.
- [x] `npm run build` completa sin errores.

---

## Decisions

- **Sí:** `app/data.ts` como único módulo de datos ficticios, con funciones `async` (`getGames`, `getCategories`, `getGameById`, `getScores`). Razón: pedido explícito de tener un archivo de datos separado pensado para sustituirse por una fuente real; hacerlo `async` desde ahora evita tocar las pantallas cuando eso ocurra.
- **No:** embeber los datos ficticios directamente en cada componente. Razón: dificultaría la futura sustitución por una fuente real y duplicaría el catálogo de juegos entre pantallas.
- **Sí:** rutas anidadas por juego (`/juegos/[id]` y `/juegos/[id]/jugar`). Razón: aprovecha el segmento dinámico común y es la convención más idiomática de Next.js App Router; confirmado frente a la alternativa de rutas planas (`/detalle/[id]`, `/jugar/[id]`).
- **Sí:** mantener el bucle decorativo del reproductor (puntuación que sube sola, sprites animados) igual que el prototipo. Razón: es una simulación visual, no lógica jugable real; se confirmó mantenerla para no perder fidelidad con la referencia.
- **Sí:** login/registro mock vía `localStorage` (`av_user`), sin validar credenciales contra nada real, con opción de entrar como invitado. Razón: no hay backend en el alcance de este MVP; el objetivo es solo la capa visual/de interacción.
- **Sí:** "JUGAR COMO INVITADO" guarda una sesión real con `name: "INVITADO"` (el `Nav` pasa a mostrar "INVITADO ▾", con opción de cerrar sesión), en vez de replicar el comportamiento del prototipo (`onLogin(null)`, que dejaba la sesión en `null` y el `Nav` seguía mostrando "Iniciar Sesión"). Razón: ambigüedad detectada durante la implementación entre el prototipo y el criterio de aceptación de esta spec, que decía que ese botón "también inicia sesión"; se resolvió con el usuario a favor de una sesión de invitado visible, coherente con el placeholder "INVITADO" que ya usa el Reproductor cuando no hay sesión.
- **Sí:** guardar puntuaciones de partida en `localStorage` (`av_scores`) tal como en el prototipo, sin que retroalimenten el Salón de la Fama ni el leaderboard de detalle (que siguen usando el generador de puntuaciones simuladas). Razón: replica el comportamiento exacto del prototipo, que tampoco cruza esos datos.
- **Sí:** reutilizar tal cual las clases ya portadas en `app/globals.css` (tema neón/retro, portadas CSS, animaciones). Razón: ya están migradas y verificadas visualmente; reescribirlas no aporta valor a este spec.
- **No:** sincronizar el buscador/filtro de categoría de la Biblioteca con la URL (`searchParams`). Razón: el prototipo tampoco lo hace y no se pidió; queda fuera para no ampliar el alcance.
- **Sí (excepción puntual a "no se reescribe el CSS"):** se tocó `app/globals.css` para corregir un desbordamiento horizontal real del `Nav` en viewports estrechos (~≤400px), detectado al verificar el criterio del menú móvil con Playwright — el botón "Iniciar Sesión" y el ≡ no cabían y quedaban cortados. Cambio mínimo: se ajustó el `gap`/margen en la media query móvil existente y se añadió una media query a 400px que oculta el botón redundante del header (ya disponible dentro del panel móvil). Confirmado con el usuario antes de tocar el archivo.

---

## Risks

| Riesgo | Mitigación |
| --- | --- |
| `localStorage` no disponible (modo privado, SSR) | Los helpers de `app/lib/session.ts` comprueban `typeof window !== "undefined"` y usan `try/catch`; si falla, la sesión simplemente no persiste pero la UI no se rompe. |
| `params` como `Promise` en Next.js 16 (breaking change frente a versiones anteriores) | Todas las páginas con `[id]` se implementan como `async function Page({ params })` con `await params`, siguiendo `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md`. |

---

## What is **not** in this spec

- Lógica jugable real de ningún juego del catálogo.
- Backend, API o base de datos real.
- Autenticación real u OAuth funcional.
- Que las puntuaciones guardadas alimenten el Salón de la Fama o el leaderboard de detalle.
- Tests automatizados.

Cada uno de estos, si se aborda, iría en su propia spec.

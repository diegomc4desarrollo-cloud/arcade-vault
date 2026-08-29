# SPEC 02 — Landing page (Home) y traslado de la Biblioteca a `/juegos`

> **Status:** Aprobado
> **Depends on:** SPEC 01
> **Date:** 2026-08-29
> **Objective:** Convertir `/` en la landing page de Arcade Vault portando `home.jsx` del prototipo `references/templates/home-about/`, y mover la Biblioteca (hoy en `/`) a `/juegos`, actualizando todos los enlaces internos.

---

## Scope

**In:**

- Portar el CSS de la Home: añadir a `app/globals.css` los bloques `HOME PAGE`, `ACTIVITY` y `PRICING` de `references/templates/home-about/styles.css` **verbatim**, sin el bloque `GAMEPAD` ni `ABOUT PAGE`, y sin duplicar reglas ya presentes (`.fade-in`, `@keyframes fadeIn`).
- Nuevas funciones ficticias en `app/data.ts` para la sección "Actividad en vivo" del Home: `getRecentScores()` (ticker de últimas puntuaciones) y `getTopPlayers()` (top de jugadores), `async` y deterministas, derivadas del generador `seededScores` ya existente.
- Pantalla **Home** en `/`: Server Component (`app/page.tsx`) que hace `await getGames()`, `await getRecentScores()` y `await getTopPlayers()` y delega el marcado + animaciones de scroll a un Client Component nuevo (`app/components/HomeScreen.tsx`), portando `home.jsx`: hero con siluetas pixel flotantes y dos CTAs, sección "¿por qué?", preview de "juegos disponibles ahora", stats, "actividad en vivo", precios/FAQ y CTA final.
- Traslado de la **Biblioteca** de `/` a `/juegos`: nuevo `app/juegos/page.tsx` con el contenido actual de `app/page.tsx` (hero `av-hero` + `<LibraryBrowser>`), sin cambios de comportamiento.
- Actualización del **Nav** (`app/components/Nav.tsx`): enlaces Inicio (`/`), Biblioteca (`/juegos`), Salón de la Fama (`/salon`) y Acerca de (`/acerca-de`), en la barra y en el panel móvil, con la lógica `isActive` adaptada. El logo sigue apuntando a `/`.
- Actualización de **todos los enlaces internos** que hoy apuntan a `/` para que apunten a `/juegos`: "VOLVER AL VAULT" en detalle, "VOLVER AL VAULT" en el reproductor, "VOLVER A LA BIBLIOTECA" en el Salón de la Fama y la redirección post-login de `/auth`.
- Documentar en SPEC 01 (nota breve) que los criterios que asumían la Biblioteca en `/` quedan superados por esta spec.

**Out of scope (para futuras specs):**

- La pantalla **"Acerca de"** y el **formulario de contacto** (`about.jsx`) — su propia spec. El enlace "Acerca de" del Nav se añade ya, aunque `/acerca-de` devuelva 404 hasta entonces.
- Portar el CSS de los bloques `ABOUT PAGE` y `GAMEPAD` de `styles.css`.
- Que el ticker / top de jugadores del Home usen las puntuaciones reales guardadas en `av_scores` — siguen siendo datos generados, como en SPEC 01.
- Lógica jugable real de cualquier juego del catálogo.
- Backend, API o base de datos real.
- Autenticación real u OAuth funcional.
- Tests automatizados.

---

## Data model

`app/data.ts` — se **añaden** tipos y funciones `async` sobre el catálogo en memoria; no se modifica lo existente.

```ts
export type RecentScore = {
  name: string;          // jugador
  game: string;          // título del juego (Game["title"])
  score: number;
  ago: string;           // "hace 2 min" — derivado del índice, NO de Date.now()
  color: Game["color"];  // color del juego, para la clase neon-<color> del ticker
};

export type TopPlayer = {
  rank: number;
  name: string;
  score: number;
};

export async function getRecentScores(count?: number): Promise<RecentScore[]>; // por defecto 7
export async function getTopPlayers(count?: number): Promise<TopPlayer[]>;      // por defecto 5
```

Convenciones:

- Ambas funciones combinan `seededScores(hashSeed(game.id), …)` de varios juegos del catálogo y son **deterministas**: mismos resultados en cada carga, sin `Date.now()` ni `Math.random` sin semilla, para no provocar mismatch de hidratación entre servidor y cliente.
- `getRecentScores`: mezcla puntuaciones de distintos juegos, ordena por "recencia" simulada y asigna `ago` según el índice (p. ej. `hace ${(i + 1) * 4} min`).
- `getTopPlayers`: aplana las puntuaciones de todo el catálogo, se queda con la mejor marca por jugador, ordena de mayor a menor y asigna `rank`.
- Puntuaciones formateadas en pantalla con `toLocaleString("es-ES")`, igual que en el resto del proyecto.

Las secciones del Home con texto de marketing fijo (features, stats "12+/MILES/GLOBAL", precios y FAQ) **no** son datos de catálogo: se dejan como literales dentro de `HomeScreen.tsx`, fieles al prototipo.

---

## Implementation plan

1. **CSS.** Añadir a `app/globals.css` los bloques `HOME PAGE`, `ACTIVITY` y `PRICING` de `references/templates/home-about/styles.css`, copiados verbatim (incluidas sus `@keyframes` y media queries), sin el bloque `GAMEPAD` ni `ABOUT PAGE`, y sin volver a declarar `.fade-in` / `@keyframes fadeIn` (ya presentes). Sin cambios visibles todavía: nada usa esas clases aún.
2. **Datos.** Añadir a `app/data.ts` los tipos `RecentScore` y `TopPlayer` y las funciones `getRecentScores` y `getTopPlayers` (deterministas, derivadas de `seededScores`). Sin UI todavía.
3. **Mover la Biblioteca.** Crear `app/juegos/page.tsx` con el contenido íntegro del actual `app/page.tsx` (Server Component: `await getGames()` / `await getCategories()`, hero `av-hero` + `<LibraryBrowser>`). Test manual: `/juegos` muestra el grid de 8 juegos, buscador y chips funcionando; `/` sigue mostrando la Biblioteca vieja hasta el paso 4.
4. **Home en `/`.** Crear `app/components/HomeScreen.tsx` (Client Component) portando `home.jsx`: `FloatingSilhouettes`, `FeatureIcon`, hook `useReveal` (con guarda `typeof IntersectionObserver !== "undefined"`), y las secciones hero / "¿por qué?" / preview / stats / actividad / precios / CTA final. Recibe por props `games`, `recentScores` y `topPlayers`. Los enlaces se hacen con `<Link>`:
   - "EXPLORAR JUEGOS", "VER TODOS LOS JUEGOS →", "INSERTAR MONEDA →", tarjeta final "¿LISTO PARA JUGAR?" → `/juegos`
   - "CREAR CUENTA", "EMPEZAR GRATIS →" → `/auth`
   - "VER SALÓN →" → `/salon`
   - cada `MiniCard` → `/juegos/${game.id}`
   Reescribir `app/page.tsx` como Server Component fino que hace los tres `await` y renderiza `<HomeScreen …>`. Test manual: `/` muestra la landing completa y las secciones `.reveal` animan al hacer scroll.
5. **Nav.** Actualizar `app/components/Nav.tsx` (barra y panel móvil): enlaces Inicio (`/`), Biblioteca (`/juegos`), Salón de la Fama (`/salon`), Acerca de (`/acerca-de`). `isActive`: `home` → `pathname === "/"`; `biblioteca` → `pathname === "/juegos" || pathname.startsWith("/juegos/")`; `salon` → `/salon`; `about` → `/acerca-de`; `auth` → `/auth`. El logo mantiene `href="/"`. Test manual: cada enlace se resalta en su ruta; "Acerca de" navega a `/acerca-de` (404 esperado hasta que exista la pantalla).
6. **Enlaces internos restantes.** Cambiar de `/` a `/juegos`:
   - `app/juegos/[id]/page.tsx` — `<Link href="/">` de "VOLVER AL VAULT".
   - `app/components/GamePlayer.tsx` — `router.push("/")` de "VOLVER AL VAULT".
   - `app/components/HallOfFame.tsx` — `<Link href="/">` de "VOLVER A LA BIBLIOTECA".
   - `app/auth/page.tsx` — los dos `router.push("/")` tras iniciar sesión / entrar como invitado.
   Test manual: desde detalle, reproductor, salón y login se vuelve a `/juegos`.
7. **Cierre.** Añadir una nota en `specs/01-mvp-pantallas-visuales.md` indicando que los criterios que ubicaban la Biblioteca en `/` quedan superados por SPEC 02. Comprobar con un grep que no queda ningún `href="/"` ni `router.push("/")` salvo el logo del Nav y el enlace "Inicio". Correr `npm run lint` y `npm run build`.

---

## Acceptance criteria

- [x] `npm run dev` arranca sin errores y `/` muestra la landing: hero con el título "EL ARCADE / CLÁSICO ESTÁ / DE VUELTA", siluetas pixel flotantes y las CTAs "EXPLORAR JUEGOS" y "CREAR CUENTA".
- [x] Al hacer scroll, las secciones con clase `.reveal` aparecen con su animación (de `opacity:0`/desplazadas a visibles).
- [x] La sección "JUEGOS DISPONIBLES AHORA" muestra 6 tarjetas provenientes de `getGames()` y cada una enlaza a `/juegos/[id]`.
- [x] La sección "ACTIVIDAD EN VIVO" muestra el ticker de últimas puntuaciones y el top de jugadores generados por `getRecentScores()` / `getTopPlayers()`, con los mismos valores en recargas sucesivas y sin warnings de hidratación en consola.
- [x] "EXPLORAR JUEGOS", "VER TODOS LOS JUEGOS →" e "INSERTAR MONEDA →" navegan a `/juegos`.
- [x] "CREAR CUENTA" y "EMPEZAR GRATIS →" navegan a `/auth`.
- [x] "VER SALÓN →" navega a `/salon`.
- [x] `/juegos` muestra la Biblioteca (hero + buscador + chips + grid de 8 juegos) con el mismo comportamiento que antes tenía `/`.
- [x] Navegar a `/juegos/id-inexistente` sigue devolviendo 404.
- [x] El Nav muestra Inicio, Biblioteca, Salón de la Fama y Acerca de, y cada enlace se resalta en su ruta correspondiente.
- [x] "Acerca de" en el Nav navega a `/acerca-de`.
- [x] En `/juegos/[id]`, "VOLVER AL VAULT" lleva a `/juegos`.
- [x] Al terminar una partida en el reproductor, "VOLVER AL VAULT" lleva a `/juegos`.
- [x] Iniciar sesión o entrar como invitado en `/auth` redirige a `/juegos`.
- [x] "VOLVER A LA BIBLIOTECA" en el Salón de la Fama lleva a `/juegos`.
- [x] No queda ningún enlace interno a `/` en `app/` salvo el logo del Nav y el enlace "Inicio".
- [x] El menú móvil (hamburguesa) se abre y cierra correctamente y lista los cuatro enlaces.
- [x] `npm run lint` no reporta errores.
- [x] `npm run build` completa sin errores.

---

## Decisions

- **Sí:** `/` pasa a ser la landing (Home) y la Biblioteca se mueve a `/juegos`. Razón: pedido explícito del usuario; una landing de marketing es lo idiomático en la raíz y `/juegos` como índice del segmento dinámico ya existente (`/juegos/[id]`, `/juegos/[id]/jugar`) es coherente con el App Router.
- **Sí:** actualizar todos los enlaces internos que apuntaban a `/` para que vayan a `/juegos` (detalle, reproductor, salón y redirección post-login de `/auth`), dejando `/` solo para el logo del Nav y el enlace "Inicio". Razón: tras el movimiento, esos flujos esperan volver al catálogo, no a la landing.
- **Sí:** añadir el enlace "Acerca de" → `/acerca-de` aunque la ruta todavía no exista (404). Razón: decisión del usuario; el `nav.jsx` del prototipo ya lo incluye y la pantalla llegará en otra spec.
- **Sí:** `HomeScreen` como Client Component único que recibe los datos por props, con `app/page.tsx` como Server Component fino. Razón: es el patrón de SPEC 01 (`LibraryBrowser`, `GamePlayer`, `HallOfFame`); el hook `useReveal` (IntersectionObserver) necesita cliente y mantiene la fidelidad con el prototipo.
- **Sí:** el preview de juegos sale de `getGames()` y la "actividad en vivo" (ticker + top jugadores) de nuevas funciones de `app/data.ts`. Razón: decisión del usuario; mantiene un único origen para los datos ficticios.
- **No:** mover features, stats, precios y FAQ a `app/data.ts`. Razón: son copy de marketing fijo, no datos de catálogo; se quedan como literales en `HomeScreen`, fieles al prototipo.
- **Sí:** `getRecentScores` / `getTopPlayers` deterministas y sin `Date.now()`; el "hace X min" se deriva del índice. Razón: evitar mismatch de hidratación entre servidor y cliente y mantener resultados estables entre recargas.
- **Sí (excepción puntual a "no se reescribe el CSS" de SPEC 01):** se añaden a `app/globals.css` los bloques `HOME PAGE`, `ACTIVITY` y `PRICING` de `references/templates/home-about/styles.css`, copiados verbatim. Razón: esas clases nunca se portaron; se copian tal cual como se hizo en SPEC 01, sin el bloque `GAMEPAD` (el Home no lo usa) ni `ABOUT PAGE` (fuera de alcance).
- **Sí (segunda excepción puntual, confirmada con el usuario durante la verificación):** se añade un bloque `@media (max-width: 520px)` a `app/globals.css` para las secciones "Actividad en vivo" y "Precios". El CSS verbatim del prototipo produce ~11-37 px de scroll horizontal en móviles estrechos (≤360 px CSS) porque el nombre de jugador, la puntuación y el importe van en `Press Start 2P` y no encogen. El fix es mínimo: `min-width: 0` en las tarjetas, columnas `minmax(0, 1fr)` con elipsis en el nombre, `font-size: 9px` en ticker/top y `pc-amount-n` fluido, y el sello `pc-stamp` a `right: -6px`. Verificado con Playwright sin overflow en 320/360/375/390/768/1440. Razón: SPEC 01 ya sentó el precedente de corregir un desbordamiento móvil real con un ajuste mínimo confirmado.
- **Supersede SPEC 01:** quedan superados los criterios de SPEC 01 que ubicaban la Biblioteca en `/` (`/` muestra la Biblioteca con el grid de 8 juegos; buscador y chips en `/`). El resto sigue válido, ahora desde `/juegos`. Se añade una nota en SPEC 01.

---

## Risks

| Riesgo | Mitigación |
| --- | --- |
| `IntersectionObserver` no disponible (SSR, navegadores muy antiguos) | `useReveal` corre solo en cliente dentro de `useEffect`; si `typeof IntersectionObserver === "undefined"` añade la clase `in` a todas las secciones (visibles sin animación, degradación aceptable). |
| Mismatch de hidratación en la sección "actividad en vivo" | `getRecentScores` / `getTopPlayers` son deterministas: sin `Date.now()` ni aleatoriedad sin semilla; servidor y cliente renderizan lo mismo. |
| Enlaces internos a `/` olvidados tras el traslado | El paso 6 parte del inventario ya hecho (`grep` de `href="/"` y `router.push("/")` en `app/`); un criterio de aceptación verifica que no quede ninguno salvo logo e "Inicio". |
| El enlace "Acerca de" lleva a un 404 hasta que exista la pantalla | Aceptado explícitamente por el usuario; se documenta aquí y se resuelve en la spec de "Acerca de". |
| `params` como `Promise` en Next.js 16 | No se tocan las firmas de las páginas `[id]` existentes; el nuevo `app/juegos/page.tsx` no tiene parámetros dinámicos. |

---

## What is **not** in this spec

- La pantalla "Acerca de" y el formulario de contacto (`about.jsx`).
- Portar el CSS de los bloques `ABOUT PAGE` y `GAMEPAD`.
- Que el ticker / top de jugadores del Home usen las puntuaciones reales de `av_scores`.
- Lógica jugable real de ningún juego.
- Backend, API o base de datos real.
- Autenticación real u OAuth funcional.
- Tests automatizados.

Cada uno de estos, si se aborda, iría en su propia spec.

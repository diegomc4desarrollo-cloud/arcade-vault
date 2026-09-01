# SPEC 05 — Integrar el juego Asteroides (canvas real) en el reproductor

> **Status:** Implementado
> **Depends on:** SPEC 01
> **Date:** 2026-09-01
> **Objective:** Portar el clon de Asteroids de `references/started-games/02-asteroids/` a un motor de canvas montado dentro del reproductor de la plataforma para el juego con id `asteroides`, y dejar el andamiaje genérico (contrato de juego + registro) para portar el resto del catálogo en specs posteriores.

---

## Section 1 — Por qué esta spec existe

Hasta ahora ningún juego del catálogo es jugable: `app/components/GamePlayer.tsx` muestra una **simulación decorativa** (`.game-arena` con sprites CSS y una puntuación que sube sola con `setInterval`).

Esta spec introduce el **primer juego real** y, con él, el contrato que todos los juegos futuros usarán para vivir dentro del marco CRT de la plataforma: renderizarse en un `<canvas>`, recibir pausa desde React y notificar a React sus cambios de estado (puntuación, vidas, nivel, fin de partida).

El juego de referencia es canvas puro sin bundler: usa `document.getElementById('canvas')`, listeners globales de `window` y estado a nivel de módulo con arranque automático. Nada de eso encaja en un Client Component de Next.js que se monta y desmonta. El trabajo central es reescribirlo como un módulo con una factoría `create(canvas, events)` que devuelve un handle controlable y limpiable.

---

## Scope

**In:**

- **Contrato de juego** en `app/games/types.ts`: tipos `GameEvents` (callbacks motor → React), `TouchAction`, `GameHandle` (control React → motor) y `GameModule` (lo que exporta cada juego).
- **Registro** en `app/games/registry.ts`: mapa `id → () => Promise<GameModule>` con carga dinámica (`import()`), y helper `isPlayable(id: string): boolean`. Por ahora solo registra `asteroides`.
- **Motor portado** en `app/games/asteroides/` (TypeScript): las clases `Ship`, `Asteroid`, `Bullet`, `PowerUp`, `Particle` y el bucle `requestAnimationFrame`, migrados de `game.js` a una factoría `create(canvas, events): GameHandle` con todo el estado en el closure (no a nivel de módulo). Se conservan niveles, partículas, envolvimiento toroidal y el power-up de disparo triple (`3x`).
- **Componente genérico** `app/components/GameCanvas.tsx` (Client Component): monta `<canvas>` a resolución interna fija 800×600, carga el módulo del registro, crea el motor, cablea sus `GameEvents` a props, sincroniza la pausa, gestiona la autopausa por `visibilitychange`, hace `preventDefault` de las teclas de juego y renderiza los controles táctiles.
- **Controles táctiles**: 4 botones superpuestos al canvas (rotar-izquierda, rotar-derecha, propulsar, disparar) en **dos grupos flex** anclados a las esquinas inferiores, con tamaño y huecos vía `clamp()` para no solaparse en un CRT estrecho de móvil. Visibles **solo** cuando `matchMedia('(pointer: coarse)')` coincide. `pointerdown`/`pointerup` → `handle.setTouch(action, active)`.
- **Cambios en `app/components/GamePlayer.tsx`**: si `isPlayable(game.id)`, se renderiza `<GameCanvas>` **en lugar de `.game-arena`** (la rejilla decorativa, los enemigos y la nave que flota), se elimina el `setInterval` de puntuación falsa, y `score`/`lives`/`level` pasan a alimentarse de los callbacks del motor. Todo el resto del marco del reproductor se mantiene **sin cambios**: HUD superior (Jugador / Puntuación / Vidas / Nivel), botones REANUDAR·PAUSA / FIN / SALIR, overlay "EN PAUSA" y barra inferior ("SEÑAL OK · … · 60 HZ"). El fin de partida abre el modal existente y guarda con `saveScore()` en `av_scores`. Los juegos no jugables mantienen la simulación decorativa intacta.
- **Cambio de catálogo en `app/data.ts`**: la entrada `id: "rocas"` se **reemplaza** por `id: "asteroides"` (título `ASTEROIDES`, `short`/`long` nuevos), conservando `cat: "SHOOTER"`, `color: "yellow"`, `cover: "cover-rocas"`, `best` y `plays`.
- **CSS nuevo en `app/globals.css`**: reglas para el escalado del canvas dentro de `.crt-screen` y para los botones táctiles (`.game-canvas`, `.game-touch`…). Adición acotada, sin re-declarar reglas existentes.

**Out of scope (para futuras specs):**

- Portar los otros 7 juegos del catálogo (`bloque-buster`, `caida`, `serpentina`, `gloton`, `invasores`, `ranaria`, `duelo-pixel`). Cada uno en su propia spec, usando el mismo contrato.
- Persistir puntuaciones en Supabase o que las partidas de `asteroides` alimenten el Salón de la Fama / el leaderboard de detalle (siguen usando `seededScores`).
- Sonido / efectos de audio (el juego de referencia no tiene).
- Gestión de `devicePixelRatio` / buffer retina: el canvas se escala por CSS desde 800×600, se acepta un leve suavizado en pantallas HiDPI mitigado con `image-rendering: pixelated`.
- Controles táctiles en escritorio o "siempre visibles".
- Guardar preferencias del jugador (sensibilidad, remapeo de teclas).
- Marcador de récord local dentro del propio canvas.
- Tests automatizados (el repo no tiene suite configurada).

---

## Data model

### Contrato de juego — `app/games/types.ts`

```ts
// Motor → React: el motor avisa de cada cambio de estado.
export type GameEvents = {
  onScore: (score: number) => void;
  onLives: (lives: number) => void;
  onLevel: (level: number) => void;
  onGameOver: (finalScore: number) => void;
};

// React → motor: acciones táctiles inyectadas desde los botones en pantalla.
export type TouchAction = "left" | "right" | "thrust" | "fire";

// Handle con el que React controla una partida en curso.
export type GameHandle = {
  pause: () => void;
  resume: () => void;
  setTouch: (action: TouchAction, active: boolean) => void;
  destroy: () => void; // cancela rAF y quita todos los listeners
};

// Lo que exporta el módulo de cada juego (export default).
export type GameModule = {
  width: number; // resolución interna del canvas (800 en asteroides)
  height: number; // (600)
  create: (canvas: HTMLCanvasElement, events: GameEvents) => GameHandle;
};
```

### Registro — `app/games/registry.ts`

```ts
import type { GameModule } from "./types";

export const GAME_MODULES: Record<string, () => Promise<GameModule>> = {
  asteroides: () => import("./asteroides").then((m) => m.default),
};

export function isPlayable(id: string): boolean {
  return id in GAME_MODULES;
}
```

### Cambio en el catálogo — `app/data.ts`

La entrada actual `id: "rocas"` se sustituye (no se añade una novena):

```ts
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
}
```

Convenciones:

- Coordenadas del motor: origen arriba-izquierda, espacio toroidal (`wrap`), canvas interno 800×600.
- Velocidades en píxeles/segundo; el `dt` del bucle se capa a 50 ms (igual que el original).
- El motor **no** persiste nada; la persistencia sigue siendo la de SPEC 01 (`saveScore()` → `localStorage` `av_scores`, con `game: "asteroides"`).
- El juego mantiene su HUD dibujado dentro del canvas (SCORE / NIVEL / vidas) **y** su overlay de "GAME OVER" dentro del negro; el HUD de la plataforma se actualiza en paralelo vía `GameEvents` y el modal de fin de la plataforma aparece además del overlay in-canvas (duplicación consciente, elegida por el usuario). Del overlay in-canvas se elimina solo el subtítulo "ESPACIO PARA REINICIAR" y el reinicio con `Space`.

---

## Implementation plan

1. **Contrato.** Crear `app/games/types.ts` con `GameEvents`, `TouchAction`, `GameHandle` y `GameModule`. Sin consumidores todavía. `npm run build` compila.
2. **Registro + stub del motor.** Crear `app/games/registry.ts` con `GAME_MODULES` e `isPlayable`, y `app/games/asteroides/index.ts` como **stub**: un `GameModule` mínimo que pinta el canvas en negro, llama a `events.onScore(0)` y cuyo `GameHandle` es no-op salvo `destroy`. Objetivo: que el import dinámico resuelva y todo compile/arranque.
3. **Catálogo.** En `app/data.ts` reemplazar la entrada `rocas` por la de `asteroides` (ver Data model). Test manual: la Biblioteca (`/juegos`) muestra la tarjeta "ASTEROIDES"; `/juegos/asteroides` carga la ficha; `/juegos/rocas` devuelve 404.
4. **GameCanvas.** Crear `app/components/GameCanvas.tsx` (`"use client"`), props `{ gameId, paused, onScore, onLives, onLevel, onGameOver, onAutoPause }`:
   - `useEffect` de montaje: `GAME_MODULES[gameId]()` → `mod.create(canvasEl, { onScore, onLives, onLevel, onGameOver })`; guarda el `GameHandle` en un `ref`. Cleanup: `handle.destroy()`.
   - `useEffect` sobre `paused`: llama `handle.pause()` / `handle.resume()`.
   - Listener `visibilitychange`: si `document.hidden` → `onAutoPause()` (el padre pondrá `paused = true`).
   - Listener `keydown`/`keyup` en `window`: `preventDefault()` para `ArrowLeft`, `ArrowRight`, `ArrowUp`, `ArrowDown`, `Space` mientras el componente está montado.
   - `<canvas width={800} height={600} className="game-canvas-el">`.
     Aún no se usa desde `GamePlayer`.
5. **GamePlayer.** Modificar `app/components/GamePlayer.tsx`:
   - `const playable = isPlayable(game.id)`.
   - Nuevos estados: `engineLevel` (default 1), `runId` (default 0). `level = playable ? engineLevel : Math.floor(score / 2500) + 1`.
   - Si `playable`: **no** montar el `setInterval` de puntuación. Renderizar, dentro de `.crt-screen` y en lugar de `.game-arena`:
     `<GameCanvas key={runId} gameId={game.id} paused={paused || over} onScore={setScore} onLives={setLives} onLevel={setEngineLevel} onGameOver={(s) => { setScore(s); setOver(true); }} onAutoPause={() => setPaused(true)} />`.
   - `restart()`: además de resetear score/lives/over/saved, `setEngineLevel(1)` y `setRunId((n) => n + 1)` (remonta el motor).
   - Si `!playable`: comportamiento actual sin cambios.
     Test manual: `/juegos/asteroides/jugar` muestra el canvas (stub) y el HUD; el resto de juegos siguen con la simulación.
6. **Motor real.** Portar `game.js` a `app/games/asteroides/` (p. ej. `engine.ts` con el bucle + `entities.ts` con las clases; `index.ts` re-exporta el `GameModule` por `default`):
   - Todo el estado (`ship`, `bullets`, `asteroids`, `particles`, `powerUps`, `score`, `lives`, `level`, `state`, timers) dentro del closure de `create()`.
   - Input: objeto `keys` desde listeners de `window` (guardados para poder quitarlos en `destroy`), fusionado con el estado `touch` que actualiza `setTouch`. Añadido sobre el original: `↓` (`ArrowDown`) aplica propulsión inversa (empuje en sentido contrario a `↑`, algo más suave).
   - Emitir `events.onScore` al cambiar `score`, `events.onLives` al perder vida, `events.onLevel` en `nextLevel()`, y `events.onGameOver(score)` **una sola vez** al llegar a 0 vidas; tras eso el bucle deja de actualizar la lógica pero sigue dibujando el último frame + el overlay.
   - Eliminar del original solo: el subtítulo "ESPACIO PARA REINICIAR" del overlay (dejar `drawOverlay` mostrando "GAME OVER" y, si se quiere, la puntuación) y el `pressed('Space') → initGame()` del estado `gameover` (el reinicio lo hace React vía `runId`).
   - Conservar: HUD in-canvas (`drawHUD`), overlay in-canvas de "GAME OVER", power-up `3x`, partículas, split de asteroides, invencibilidad con parpadeo.
   - `pause()`/`resume()`: flag que salta `update()` (el `draw()` puede seguir para no dejar el frame congelado a medias, o congelarse; decisión de implementación menor). `destroy()`: `cancelAnimationFrame` + `removeEventListener` de teclado.
     Test manual: jugar con teclado, partir asteroides grandes → medianos → pequeños, recoger el `3x`, morir 3 veces → aparecen el overlay "GAME OVER" in-canvas y el modal de la plataforma.
7. **Controles táctiles.** En `GameCanvas`, si `matchMedia('(pointer: coarse)').matches`, renderizar 4 botones en dos `.gt-group` (izquierda / derecha) superpuestos al canvas; `onPointerDown`/`onPointerUp`/`onPointerCancel` → `handle.setTouch(action, bool)`. Añadir a `app/globals.css` las reglas de `.game-canvas` (contenedor `position: absolute; inset: 0`, canvas `width/height: 100%`, `image-rendering: pixelated`) y `.game-touch` / `.gt-group` / `.gt-btn` (grupos flex en las esquinas inferiores, tamaño/hueco/fuente con `clamp()`). Test manual: en móvil (320–430 px) los 4 botones controlan la nave sin solaparse; en escritorio no se ven.
8. **Cierre.** `npm run lint` y `npm run build`. Verificación manual de toda la lista de criterios: pausa manual, autopausa al cambiar de pestaña, `SALIR` sin `requestAnimationFrame` colgando ni errores en consola, guardado en `av_scores`, y los otros 7 juegos con la simulación intacta.

---

## Acceptance criteria

- [x] `/juegos/asteroides` responde 200 y la Biblioteca muestra la tarjeta "ASTEROIDES" con categoría SHOOTER.
- [x] `/juegos/rocas` responde 404 y no queda ninguna referencia al id `rocas` en `app/`.
- [x] `/juegos/asteroides/jugar` renderiza un `<canvas>` real dentro del marco CRT, sin el `.game-arena` decorativo, y el resto del marco (HUD superior, botones REANUDAR/FIN/SALIR, overlay "EN PAUSA", barra inferior) se ve exactamente igual que en los demás juegos.
- [x] `←` / `→` rotan la nave, `↑` propulsa, `↓` aplica propulsión inversa y `Espacio` dispara; ninguna de esas teclas (incluida `↓`) hace scroll de la página mientras se juega.
- [x] Disparar a un asteroide grande lo parte en dos medianos; un mediano en dos pequeños; un pequeño desaparece sin partirse.
- [x] Recoger el orbe `3x` activa el disparo triple durante unos segundos.
- [x] El HUD de la plataforma (Puntuación, Vidas, Nivel) refleja los valores reales del motor y se actualiza durante la partida.
- [x] El HUD dibujado dentro del canvas (SCORE / NIVEL / vidas) sigue presente durante la partida.
- [x] Al perder la 3ª vida aparecen a la vez el overlay "GAME OVER" dentro del canvas y el modal de fin de la plataforma con la puntuación final; el texto "ESPACIO PARA REINICIAR" ya no aparece y `Space` ya no reinicia.
- [x] Guardar en el modal escribe una entrada nueva en `localStorage` bajo `av_scores` con `game: "asteroides"`.
- [x] "JUGAR DE NUEVO" reinicia la partida desde cero: nave centrada, 3 vidas, nivel 1, puntuación 0.
- [x] El botón PAUSA congela la nave y los asteroides; REANUDAR reactiva el movimiento.
- [x] Al cambiar de pestaña el juego se pausa solo y, al volver, permanece pausado hasta pulsar REANUDAR.
- [x] Pulsar "SALIR" o navegar fuera de la ruta desmonta el juego sin dejar `requestAnimationFrame` activos ni listeners, y sin errores en consola.
- [x] En un dispositivo con puntero `coarse` aparecen 4 botones táctiles sobre el canvas que controlan rotación, propulsión y disparo, sin solaparse ni salirse del recuadro CRT en viewports de 320–430 px; en escritorio con teclado y ratón no aparecen.
- [x] Los otros 7 juegos del catálogo siguen mostrando la simulación decorativa al entrar a su reproductor.
- [x] `app/games/registry.ts` exporta `isPlayable(id)` y solo `"asteroides"` devuelve `true`.
- [x] `npm run lint` sin errores.
- [x] `npm run build` sin errores.

---

## Decisions

- **Sí:** motor portado a TypeScript con factoría `create(canvas, events): GameHandle` y estado en closure. Razón: un Client Component se monta/desmonta y puede duplicarse en StrictMode; el estado a nivel de módulo del original haría imposible reiniciar o limpiar.
- **Sí:** contrato genérico (`app/games/types.ts`) + registro con carga dinámica, aunque solo `asteroides` lo implemente ahora. Razón: pedido explícito del usuario ("estructura para todos"); cada juego futuro entra registrando un `GameModule` sin tocar `GamePlayer`.
- **Sí:** reemplazar la entrada `rocas` por `asteroides` en el catálogo, no añadir una novena. Razón: elegido por el usuario; `rocas` era el placeholder decorativo de este mismo juego.
- **Sí:** conservar `cover: "cover-rocas"` como portada del juego. Razón: elegido por el usuario; evita crear arte nuevo y tocar `globals.css` para la portada.
- **Sí:** el HUD in-canvas (SCORE / NIVEL / vidas) y el overlay in-canvas de "GAME OVER" se quedan tal cual; del overlay de fin solo se quita el subtítulo "ESPACIO PARA REINICIAR" y el reinicio con `Space`. Razón: elegido por el usuario; el juego se mantiene "físicamente" como está dentro del canvas.
- **Sí:** el HUD de la plataforma se actualiza en paralelo vía `GameEvents` y el modal de fin aparece **además** del overlay in-canvas. Razón: elegido por el usuario; "todo se da de arriba" (control y datos en el HUD superior) pero el juego se sigue mostrando como antes.
- **Sí:** fin de partida gestionado por el modal de la plataforma + `saveScore()` a `av_scores` (junto al overlay in-canvas). Razón: mismo flujo que el resto del MVP (SPEC 01); un único punto de guardado.
- **Sí:** todo el marco del reproductor (marco CRT, HUD superior, botones REANUDAR·PAUSA / FIN / SALIR, overlay "EN PAUSA", barra inferior) se conserva intacto; solo se sustituye el contenido interno `.game-arena` por el `<canvas>`. Razón: pedido explícito del usuario con capturas.
- **Sí:** autopausa en `visibilitychange`; al volver, el juego sigue pausado hasta pulsar REANUDAR. Razón: elegido por el usuario; reanudar es siempre manual, sin sorpresas al recuperar el foco.
- **Sí:** `destroy()` en el desmontaje del componente (`SALIR` o navegación) cancela el `requestAnimationFrame` y quita los listeners de teclado. Razón: evitar fugas y bucles fantasma entre partidas.
- **Sí:** 4 botones táctiles (rotar-izq, rotar-der, propulsar, disparar) solo con puntero `coarse`. Razón: elegido por el usuario; fidelidad al control original sin ensuciar la vista de escritorio.
- **Sí:** botones en dos grupos flex con `clamp()` (tamaño 40–58 px) en vez de 4 posiciones fijas en px. Razón: con offsets fijos los dos botones centrales se solapaban en viewports ≤ ~370 px (CRT ~265 px de ancho); los grupos flex garantizan separación a cualquier ancho.
- **Sí:** `preventDefault` de `ArrowLeft/Right/Up/Down` y `Space` mientras el juego está montado. Razón: esas teclas hacen scroll de la página y arruinan el control.
- **Sí (añadido sobre el original):** `↓` (`ArrowDown`) = propulsión inversa (`REVERSE = 160 px/s²`, más suave que `THRUST = 260`). Razón: pedido por el usuario durante la implementación; el clon de referencia no tiene retropropulsión.
- **No:** portar los otros 7 juegos en esta spec. Razón: cada uno tiene su propio motor y sus propias decisiones; entran de uno en uno.
- **No:** persistencia en Supabase ni alimentar el Salón de la Fama con partidas reales. Razón: es su propia spec; aquí se mantiene `seededScores` y `localStorage`.
- **No:** sonido. Razón: el juego de referencia no lo tiene.
- **No:** gestión de `devicePixelRatio` / buffer retina. Razón: el escalado CSS desde 800×600 con `image-rendering: pixelated` es suficiente para el estilo retro; afinar la nitidez sería otra spec.
- **No:** controles táctiles siempre visibles o en escritorio. Razón: descartado por el usuario.

---

## Risks

| Riesgo                                                                                                     | Mitigación                                                                                                                                                                                                                                                                                   |
| ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fuga de `requestAnimationFrame` / listeners entre partidas o en StrictMode (doble montaje en dev)          | El motor se crea dentro del `useEffect` de `GameCanvas` con cleanup que llama `handle.destroy()`; `destroy()` es idempotente (cancela rAF, quita listeners, marca un flag).                                                                                                                  |
| El original usa estado a nivel de módulo y arranque automático (`initGame(); requestAnimationFrame(loop)`) | La factoría `create()` encapsula todo el estado en el closure y no arranca nada en import; el bucle empieza dentro de `create()`.                                                                                                                                                            |
| `ArrowUp` / `ArrowDown` / `Space` hacen scroll de la página durante el juego                               | `GameCanvas` hace `preventDefault` de esas teclas mientras está montado; se quita el listener en el cleanup.                                                                                                                                                                                 |
| Canvas borroso en pantallas HiDPI                                                                          | Buffer interno fijo 800×600 + `image-rendering: pixelated`; afinar DPR queda explícitamente fuera de alcance.                                                                                                                                                                                |
| Next.js 16: import dinámico y componentes cliente                                                          | El motor se carga con `import()` **dentro** de un `useEffect` de un Client Component (`GameCanvas`), nunca desde un Server Component; no hace falta `next/dynamic` con `ssr: false`. Antes de tocar `app/`, revisar `node_modules/next/dist/docs/01-app/` (client components, lazy loading). |
| Detección táctil imperfecta en portátiles híbridos (pantalla táctil + teclado)                             | Se usa `matchMedia('(pointer: coarse)')`: si el puntero primario es fino, no se muestran los botones; el usuario con teclado no pierde nada.                                                                                                                                                 |
| Condición de carrera entre la pausa controlada (`paused`) y la autopausa por pestaña                       | La autopausa no toca el motor directamente: llama a `onAutoPause()` y el padre pone `paused = true`; el motor solo obedece al prop `paused`. Fuente de verdad única.                                                                                                                         |
| `getScores("asteroides")` genera un leaderboard distinto al de `"rocas"`                                   | Es un mock (`seededScores` sembrado por el id); el cambio de cifras es cosmético y esperado.                                                                                                                                                                                                 |

---

## What is **not** in this spec

- Portar los otros 7 juegos del catálogo (cada uno en su spec, con el mismo contrato).
- Persistir puntuaciones en Supabase o alimentar el Salón de la Fama / el leaderboard de detalle con partidas reales.
- Sonido y efectos de audio.
- Gestión de `devicePixelRatio` / buffer retina.
- Controles táctiles en escritorio o siempre visibles.
- Preferencias del jugador (sensibilidad, remapeo de teclas).
- Tests automatizados.

Cada uno de estos, si se aborda, iría en su propia spec.

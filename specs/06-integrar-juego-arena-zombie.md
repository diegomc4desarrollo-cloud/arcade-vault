# SPEC 06 — Integrar el juego Arena Z (shooter top-down de oleadas) en el catálogo

> **Status:** aprobado
> **Depends on:** SPEC 01, SPEC 05
> **Date:** 2026-09-10
> **Objective:** Portar el prototipo `references/started-games/010-zombie/arena-zombie-prototipo.html` a un componente cliente autónomo `<ArenaZombieGame />` (canvas a pantalla completa, mecánicas y balance sin retocar) y añadirlo como noveno juego del catálogo con guardado de la puntuación final en `localStorage`.

---

## Section 1 — Por qué esta spec existe

El prototipo de Arena Z ya está validado: bucle de juego, IA de zombis, 5 armas, 5 disposiciones de obstáculos y balance están cerrados. Esta spec **migra** ese prototipo al stack del proyecto (Next.js 16 + TypeScript + Tailwind), no lo rediseña.

A diferencia de SPEC 05 (Asteroides), este juego **no** usa el contrato genérico `GameModule` / `GameCanvas` / `GamePlayer`:

- El prototipo trae sus propias pantallas de inicio y game over, su propio HUD (integridad, puntos, oleada, arma/munición) y su banner de cambio de oleada. Reescribirlo para el marco CRT y el HUD superior de `GamePlayer` sería un rediseño.
- El estado del jugador es `hp` 0–100, no vidas; el progreso son "oleadas", no "niveles"; hay arma y munición. El contrato `GameEvents` (`onScore` / `onLives` / `onLevel` / `onGameOver`) no encaja sin extenderlo.
- El control táctil es un **doble joystick por zonas** (mitad izquierda mueve, mitad derecha apunta y dispara), no los 4 botones discretos de `GameCanvas`.

Por eso Arena Z se implementa como un Client Component independiente que monta su `<canvas>` vía `useRef` + `useEffect` y limpia listeners y `requestAnimationFrame` en el cleanup. El único punto de integración con la plataforma es la entrada en el catálogo (`app/data.ts`), la ruta de juego (bifurcación en `app/juegos/[id]/jugar/page.tsx`) y el guardado de la puntuación final (`saveScore()` de SPEC 01).

---

## Scope

**In:**

- **Componente de entrada** `app/components/ArenaZombieGame.tsx` (`"use client"`): monta `<canvas>` a pantalla completa vía `useRef` + `useEffect`, arranca el motor, cablea sus callbacks a estado React y limpia listeners + `rAF` en el cleanup. Renderiza las pantallas `start | playing | gameover`, el HUD y el banner de oleada como JSX (portados del HTML/CSS del prototipo).
- **Motor portado** en `app/games/arena-zombie/` (TypeScript), con todo el estado en el closure de una factoría (no a nivel de módulo):
  - `types.ts`: `WeaponKind`, `Weapon`, `ZombieGait`, `ZombieType`, `Obstacle` (interfaces exactas del prototipo).
  - `config.ts`: `WEAPONS`, `Z_TYPES`, `GAIT_PARAMS`, `OBSTACLE_LAYOUTS`, `THEMES` y `waveConfig(w)` — **mismos valores numéricos que el prototipo, sin retocar**.
  - `engine.ts` (puede dividirse en `engine.ts` + `render.ts`): bucle `requestAnimationFrame`, input (teclado + ratón + doble joystick táctil), física simple (`resolveObstacles`), spawn por bordes, IA de persecución, colisiones (zombi↔jugador, zombi↔bala, bala↔obstáculo, explosión↔área), partículas, pickups de arma, avance de oleada, rotación de obstáculos y de tema, screen shake y audio procedural (Web Audio API, sin assets).
  - Factoría `create(canvas, callbacks)` que devuelve un handle `{ start, pause, resume, destroy }`; `callbacks` = `{ onHud(hud), onGameOver(score, wave) }` donde `hud = { hp, score, wave, weaponName, ammo }` (`ammo` es `number | "∞"`).
- **Render vectorial/procedural** idéntico al prototipo: robot del jugador (piernas con rodilla + chasis + cabeza, piernas hacia el movimiento y chasis hacia el apuntado), zombis animados con firma de marcha por tipo, cajas de obstáculos, balas, explosiones, chorro de lanzallamas, partículas, rejilla de suelo y niebla de tema.
- **5 armas**: `pistol` (Pistola), `smg` (Fusil), `shotgun` (Escopeta) — `kind:'ranged'`; `cannon` (Cañón) — `kind:'explosive'` con explosión de área; `flamer` (Lanzallamas) — `kind:'stream'` con consumo de combustible. Pickups de arma con spawn periódico, colisión con el jugador y cambio de arma activa; al agotar munición se vuelve a `pistol`.
- **4 arquetipos de zombi**: `walker` (caminante), `limper` (cojo), `runner` (corredor), `brute` (bruto), cada uno con radio, velocidad, vida, daño, puntos y `gait` propios, y con el tope de velocidad relativo al jugador (`min(speed·speedMult, player.speed·0.92)`).
- **Oleadas**: `waveConfig(w)` controla cantidad, probabilidad de cada tipo, intervalo de spawn, multiplicador de velocidad y de vida; la oleada avanza al limpiar todos los zombis y vaciar la cola de spawn.
- **Obstáculos**: las 5 disposiciones de `OBSTACLE_LAYOUTS` rotan por oleada (`(wave-1) % 5`); bloquean a jugador, zombis y balas; el proyectil del cañón explota al chocar contra una caja.
- **HUD** (JSX): barra de integridad (0–100), puntos, oleada, caja de arma con nombre y munición, y banner "OLEADA N" al cambiar de oleada.
- **Audio procedural**: disparo, escopeta, cañón, explosión, llamas, impacto, muerte, daño al jugador, pickup y cambio de oleada, todo con osciladores Web Audio; `AudioContext` se inicializa/reanuda en el primer gesto del usuario (botón "Empezar").
- **Controles**: teclado (WASD / flechas) + ratón (apuntado + clic mantenido para disparar) en escritorio; doble joystick táctil por zonas en móvil (mitad izquierda = mover, mitad derecha = apuntar y disparar mientras se mantiene).
- **Guardado de puntuación**: al entrar en `gameover`, la pantalla de fin muestra un campo de iniciales (prefijado con `getUser()?.name ?? "INVITADO"`) y un botón "GUARDAR PUNTUACIÓN" que llama **una sola vez** a `saveScore({ game: "arena-zombie", score, name, wave })` de `app/lib/session.ts`.
- **Extensión mínima de `app/lib/session.ts`**: añadir `wave?: number` (opcional) al tipo `SavedScore` para poder registrar la oleada alcanzada.
- **Entrada nueva en el catálogo** `app/data.ts`: novena entrada `id: "arena-zombie"`, `title: "ARENA Z"`, `cat: "SHOOTER"`, `color: "green"`, `cover: "cover-zombie"`, con `short` / `long` / `best` / `plays` nuevos.
- **Bifurcación de ruta** en `app/juegos/[id]/jugar/page.tsx`: si `game.id === "arena-zombie"` renderiza `<ArenaZombieGame />`; en cualquier otro caso, `<GamePlayer game={game} />` como hasta ahora.
- **CSS nuevo en `app/globals.css`**: clase `.cover-zombie` (portada del catálogo, degradado/patrón en la paleta neón-ácido del prototipo) y las clases del propio juego (`.az-root`, `.az-overlay`, `.az-hud`, `.az-hp`, `.az-weapon`, `.az-banner`, `.az-joystick`…). Adición acotada, sin re-declarar reglas existentes.

**Out of scope (para futuras specs):**

- **Persistencia en Supabase y rankings con datos reales.** El repo no tiene tabla de puntuaciones (SPEC 04 dejó fuera todo el esquema) y ni el Salón de la Fama ni la ficha de detalle leen puntuaciones reales (usan `seededScores`, mock). Arena Z guarda en `localStorage` `av_scores` igual que el resto del catálogo hoy; conectar Supabase + reescribir los leaderboards es su propia spec.
- Arte real (sprites dibujados/generados, modelos 3D). El aspecto sigue siendo vectorial/procedural.
- Filtro de post-procesado pixel-art (probado en el prototipo y descartado).
- Arma cuerpo a cuerpo / lanza (probada y descartada a favor de las 5 armas a distancia).
- Nuevas armas, tipos de zombi, temas u obstáculos que no estén en el prototipo.
- Progreso persistente entre partidas (desbloqueos, meta-progresión, inventario). Solo la sesión actual y su puntuación final.
- Multijugador o modos cooperativos.
- Integrar Arena Z en el contrato `GameModule` / `GameCanvas` / `GamePlayer` ni en el marco CRT.
- Jugar Arena Z dentro de una caja de resolución fija: el canvas es a pantalla completa del viewport.
- Extraer el motor de oleadas/obstáculos como módulo reutilizable por otros juegos del catálogo.
- Tests automatizados (el repo no tiene suite configurada).

---

## Data model

### Tipos del motor — `app/games/arena-zombie/types.ts`

```ts
export type WeaponKind = "ranged" | "explosive" | "stream";

export interface Weapon {
  key: string;
  name: string;
  kind: WeaponKind;
  dmg?: number;
  dps?: number;
  rate?: number;
  bulletSpeed?: number;
  spread?: number;
  pellets?: number;
  range?: number;
  arc?: number;
  blastR?: number;
  fuelPerSec?: number;
  ammo: number; // Infinity para la pistola
  color: string;
}

export type ZombieGait = "shuffle" | "limp" | "sprint" | "stomp";

export interface ZombieType {
  r: number;
  speed: number;
  hp: number;
  color: string;
  dark: string;
  dmg: number;
  points: number;
  gait: ZombieGait;
}

export interface Obstacle {
  x: number;
  y: number;
  w: number;
  h: number;
}
```

### Datos de balance — `app/games/arena-zombie/config.ts` (valores del prototipo, sin retocar)

```ts
export const WEAPONS: Record<string, Weapon> = {
  pistol: {
    key: "pistol",
    name: "Pistola",
    kind: "ranged",
    dmg: 1,
    rate: 270,
    bulletSpeed: 640,
    spread: 0.02,
    pellets: 1,
    ammo: Infinity,
    color: "#e9e6dc",
  },
  smg: {
    key: "smg",
    name: "Fusil",
    kind: "ranged",
    dmg: 0.55,
    rate: 88,
    bulletSpeed: 680,
    spread: 0.1,
    pellets: 1,
    ammo: 90,
    color: "#ffe08a",
  },
  shotgun: {
    key: "shotgun",
    name: "Escopeta",
    kind: "ranged",
    dmg: 1,
    rate: 640,
    bulletSpeed: 540,
    spread: 0.36,
    pellets: 6,
    ammo: 24,
    color: "#ffb454",
  },
  cannon: {
    key: "cannon",
    name: "Cañón",
    kind: "explosive",
    dmg: 5,
    rate: 900,
    bulletSpeed: 330,
    blastR: 78,
    ammo: 9,
    color: "#ff6a3d",
  },
  flamer: {
    key: "flamer",
    name: "Lanzallamas",
    kind: "stream",
    dps: 6.5,
    range: 130,
    arc: 0.42,
    fuelPerSec: 24,
    ammo: 150,
    color: "#ff7a2e",
  },
};

export const Z_TYPES: Record<string, ZombieType> = {
  walker: {
    r: 15,
    speed: 58,
    hp: 2,
    color: "#4c5a3a",
    dark: "#333f27",
    dmg: 9,
    points: 10,
    gait: "shuffle",
  },
  limper: {
    r: 14,
    speed: 32,
    hp: 3,
    color: "#4a4638",
    dark: "#2c2919",
    dmg: 11,
    points: 14,
    gait: "limp",
  },
  runner: {
    r: 11,
    speed: 118,
    hp: 1,
    color: "#6a4a3a",
    dark: "#40291d",
    dmg: 6,
    points: 16,
    gait: "sprint",
  },
  brute: {
    r: 23,
    speed: 38,
    hp: 8,
    color: "#5a3a4a",
    dark: "#331f2b",
    dmg: 19,
    points: 35,
    gait: "stomp",
  },
};

// GAIT_PARAMS: firma visual de marcha por tipo (stepAmp, kneeBend, legW,
// limpRange, torsoOx/Oy/Rx/Ry, tiltAmp, tiltBias) — valores exactos del prototipo.

// OBSTACLE_LAYOUTS: 5 funciones (W, H) => Obstacle[]:
//   0 → [] (oleada abierta)         1 → 1 cubo central
//   2 → cruz de 4 bloques + centro  3 → pasillo de 2 muros
//   4 → 4 cajas sueltas asimétricas

// THEMES: 3 temas visuales (Tejados / Desierto / Noche) que rotan cada 4 oleadas.

export function waveConfig(w: number) {
  return {
    total: 5 + w * 3,
    limperChance: 0.22,
    runnerChance: w >= 2 ? Math.min(0.1 + w * 0.025, 0.4) : 0,
    bruteChance: w >= 3 ? Math.min(0.04 + w * 0.018, 0.24) : 0,
    spawnInterval: Math.max(1000 - w * 35, 340),
    speedMult: 1 + Math.min(w * 0.03, 0.4),
    healthMult: 1 + Math.min(w * 0.11, 2.3),
  };
}
```

### Estado del jugador (en el closure de `create()`)

```ts
// x, y, r: 15, speed: 230, angle, hp: 100, maxHp: 100, invuln (s),
// weapon: Weapon (copia), ammo: number | Infinity, fireCd (ms),
// legAngle, walkPhase, moving. Sin vidas: al llegar hp <= 0 → gameover.
```

### Cambio en el catálogo — `app/data.ts` (novena entrada, no se sustituye ninguna)

```ts
{
  id: "arena-zombie",
  title: "ARENA Z",
  short: "Sobrevive oleadas de zombis con 5 armas y cobertura cambiante.",
  long: "Pilotas un robot de combate en una arena cercada. Mueves y apuntas por separado, recoges armas cada vez más brutales tiradas por el suelo y aguantas oleadas que suben en número, velocidad y aguante. Cuatro clases de zombi, cinco disposiciones de obstáculos, un solo objetivo: no caer.",
  cat: "SHOOTER",
  cover: "cover-zombie",
  color: "green",
  best: 32750,
  plays: "0",
}
```

### Extensión de `app/lib/session.ts`

```ts
export type SavedScore = { game: string; score: number; name: string; at: number; wave?: number };
```

`saveScore()` no cambia de firma (ya acepta `Omit<SavedScore, "at">`); solo pasa a admitir `wave` opcional.

Convenciones:

- Coordenadas: origen arriba-izquierda; el mundo mide `innerWidth × innerHeight` y se recalcula en cada `resize`.
- Velocidades en píxeles/segundo; el `dt` del bucle se capa a 50 ms (igual que el prototipo).
- El motor **no** persiste nada; la persistencia es la de SPEC 01 (`saveScore()` → `localStorage` `av_scores`).
- El "mejor" de la sesión (`bestScore`) vive en estado React del componente y se pierde al recargar (comportamiento del prototipo).

---

## Implementation plan

1. **Esqueleto del componente.** Crear `app/components/ArenaZombieGame.tsx` (`"use client"`): `<canvas>` vía `useRef`, `useEffect` que ajusta el tamaño al viewport y pinta solo el fondo (degradado de tema + rejilla + borde de arena), listener de `resize`, cleanup que cancela el `rAF` y quita el listener. Sin jugador ni zombis. Test manual: navegar a una ruta temporal muestra el fondo y responde al `resize`.
2. **Pantallas y estado.** Añadir el estado `start | playing | gameover` y las pantallas de inicio y game over como JSX (HTML/CSS del prototipo portado a `app/globals.css` bajo clases `.az-*`), sin lógica de juego: "Empezar" pasa a `playing`, "Reintentar" reinicia a `playing`. Test manual: se navega entre las tres pantallas.
3. **Jugador.** Portar el jugador al motor: posición, movimiento por teclado (WASD / flechas), `speed: 230`, `resolveObstacles` aún no, límites de la arena (`clamp` a `r + 10`). Piernas con fase de caminado. Test manual: el robot se mueve y no sale de la arena.
4. **Apuntado y render del robot.** Añadir apuntado por ratón (y por zona táctil derecha, sin disparo todavía) y el render completo del robot (piernas con rodilla hacia el movimiento, chasis + brazo de apoyo + cabeza con visor hacia el apuntado). Test manual: el chasis apunta al cursor mientras las piernas siguen el movimiento.
5. **`types.ts` + `config.ts` + armas ranged.** Crear `types.ts` y `config.ts` con `WEAPONS`, `Z_TYPES`, `GAIT_PARAMS`, `OBSTACLE_LAYOUTS`, `THEMES`, `waveConfig()`. Portar `pistol` / `smg` / `shotgun` (`kind:'ranged'`) y el disparo básico: `bullets[]`, cadencia (`fireCd`), `spread`, `pellets`, vida de bala y muerte al salir de pantalla. Test manual: las tres armas disparan con dispersión y cadencia distintas.
6. **Cañón (explosive).** Añadir `cannon`: proyectil propio (`bulletSpeed: 330`, estela) y `triggerExplosion(x, y, blastR, dmg)` con daño en área, partículas y screen shake. Test manual: el proyectil vuela más lento y estalla con radio visible.
7. **Lanzallamas (stream).** Añadir `flamer`: `applyFlameStream(w, dt)` — cono continuo (`range: 130`, `arc: 0.42`), `dps` por segundo, consumo de combustible (`fuelPerSec: 24`), partículas de fuego y sonido en bucle. Al agotar `ammo` se vuelve a `pistol`. Test manual: el chorro daña en cono y gasta munición.
8. **Pickups de arma.** Spawn periódico (`pickupTimer` 11–16 s), render con etiqueta (`FUS` / `12G` / `BUM` / `FLM`), colisión con el jugador → cambia el arma activa y fija `ammo` al del arma. Test manual: recoger un pickup cambia el HUD de arma.
9. **Arquetipos de zombi.** Portar `Z_TYPES` + `GAIT_PARAMS` con los 4 tipos y el render animado (piernas con firma de marcha, brazos colgantes, torso con degradado radial, cabeza con ojos rojos, sliver de vida para `maxHp > 2`). Aún sin spawn automático (crear 1–2 a mano para probar). Test manual: los 4 tipos se distinguen por tamaño, postura y marcha.
10. **Spawn y selección por oleada.** Portar `edgeSpawnPos()`, `spawnZombie()` con la selección de tipo por probabilidad acumulada (`bruteChance` → `runnerChance` → `limperChance` → `walker`) y el tope de velocidad `min(speed·speedMult, player.speed·0.92)`. Test manual: en oleadas altas aparecen corredores y brutos.
11. **IA y colisiones de zombi.** Portar la persecución (vector al jugador + `wob` sinusoidal), `resolveObstacles(z)`, colisión zombi↔jugador (daño, `invuln: 0.7`, knockback 14 px, `sfx.hurt`) y zombi↔bala (daño, `hitFlash`, muerte con partículas y puntos, `sfx.death`). Al llegar `hp <= 0` → `onGameOver(score, wave)`. Test manual: los zombis rodean obstáculos, hacen daño y mueren a tiros.
12. **Oleadas.** Portar el ciclo: `startNextWave()` incrementa `wave`, calcula `waveConfig`, fija `spawnQueue`, rota obstáculos y tema, muestra el banner y suena `sfx.wave`; la oleada avanza cuando `spawnQueue === 0` y `zombies.length === 0`. Test manual: al limpiar la oleada 1 empieza la 2 con más zombis.
13. **Obstáculos.** Portar `OBSTACLE_LAYOUTS` (5) y su rotación `(wave-1) % 5`, el render de cajas (sombra + degradado + bordes) y la colisión bala↔obstáculo (bala normal → partículas y muere; proyectil del cañón → `triggerExplosion` contra la caja). Test manual: la disposición cambia visiblemente entre oleadas y las balas no atraviesan cajas.
14. **HUD y banner (JSX).** Portar el HUD como JSX alimentado por `onHud`: barra de integridad, puntos, "OLEADA N", caja de arma (nombre + munición, `∞` para la pistola) y el banner "OLEADA N" con su animación de entrada/salida. Test manual: los cuatro valores se actualizan en tiempo real.
15. **Audio procedural.** Portar el módulo de audio (osciladores Web Audio, sin assets): `shoot`, `shotgun`, `cannon`, `explosion`, `flame`, `hit`, `death`, `hurt`, `pickup`, `wave`. `initAudio()` en el clic de "Empezar" / "Reintentar". Test manual: cada acción suena y no hay error si el navegador bloquea el audio hasta el primer gesto.
16. **Doble joystick táctil.** Portar el control por zonas: `touchstart` en la mitad izquierda → vector de movimiento; en la mitad derecha → vector de apuntado + disparo mantenido; `touchmove` actualiza los deltas (clamp ±55); `touchend` / `touchcancel` los resetea. `touch-action: none` en el canvas. Opcional: dibujar base + puño del stick en el origen del toque. Test manual: en móvil se mueve y dispara con ambos pulgares a la vez.
17. **Limpieza del ciclo de vida.** Verificar que el `useEffect` del motor cancela `requestAnimationFrame` y quita **todos** los listeners (`keydown`/`keyup`/`mouse*`/`touch*`/`resize`) en el cleanup, y que remontar el componente ("Reintentar") no deja bucles ni listeners duplicados (probar en React StrictMode). Test manual: entrar y salir del juego varias veces sin fugas ni errores en consola.
18. **Catálogo y portada.** En `app/data.ts` añadir la novena entrada `arena-zombie` (ver Data model). En `app/globals.css` añadir `.cover-zombie` (degradado/patrón neón-ácido). Test manual: la Biblioteca (`/juegos`) y el Home muestran la card "ARENA Z"; `/juegos/arena-zombie` carga la ficha con su leaderboard mock.
19. **Bifurcación de ruta.** En `app/juegos/[id]/jugar/page.tsx`: tras `getGameById`, si `game.id === "arena-zombie"` devolver `<ArenaZombieGame />`; si no, `<GamePlayer game={game} />`. Test manual: `/juegos/arena-zombie/jugar` carga Arena Z a pantalla completa; el resto de juegos siguen con `GamePlayer`.
20. **Guardado de puntuación.** Extender `SavedScore` con `wave?: number` en `app/lib/session.ts`. En la pantalla de game over de `<ArenaZombieGame />`: campo de iniciales prefijado con `getUser()?.name ?? "INVITADO"` y botón "GUARDAR PUNTUACIÓN" que llama **una sola vez** a `saveScore({ game: "arena-zombie", score, name, wave })` y muestra el estado "guardada". Test manual: al morir y guardar, aparece una entrada nueva en `localStorage` `av_scores` con `game: "arena-zombie"` y `wave`.
21. **Cierre.** `npm run lint` y `npm run build`. Recorrido manual de todos los criterios de aceptación en escritorio y en móvil (o emulación de puntero `coarse`).

---

## Acceptance criteria

- [ ] `/juegos/arena-zombie` responde 200, la Biblioteca y el Home muestran la card "ARENA Z" con categoría SHOOTER y portada `cover-zombie`.
- [ ] `/juegos/arena-zombie/jugar` renderiza `<ArenaZombieGame />` con un `<canvas>` a pantalla completa y la pantalla de inicio del prototipo (título "ARENA Z", instrucciones, botón "Empezar"); no aparece el marco CRT ni el HUD de `GamePlayer`.
- [ ] El resto de juegos del catálogo siguen renderizando `<GamePlayer>` en su ruta `/jugar` (Asteroides jugable, los demás con la simulación decorativa).
- [ ] El jugador se mueve con WASD / flechas y con el joystick táctil izquierdo, y no sale de la arena.
- [ ] El jugador apunta con el ratón y con el joystick táctil derecho, de forma independiente del movimiento; las piernas siguen el movimiento y el chasis el apuntado.
- [ ] Se dispara con clic mantenido y manteniendo el lado derecho táctil.
- [ ] Las 5 armas (pistola, fusil, escopeta, cañón, lanzallamas) tienen comportamiento y aspecto distintos: cadencia/dispersión propias, el cañón explota en área y el lanzallamas es un cono continuo que gasta combustible.
- [ ] Los pickups de arma aparecen periódicamente, se recogen al pasar por encima y cambian el arma activa; al agotar munición el arma vuelve a la pistola.
- [ ] Los 4 tipos de zombi (caminante, cojo, corredor, bruto) tienen marcha, velocidad, tamaño y estadísticas reconociblemente distintas.
- [ ] Las oleadas escalan en número (`5 + w·3`), velocidad (`speedMult`) y vida (`healthMult`); la oleada avanza al eliminar todos los zombis.
- [ ] La disposición de obstáculos cambia entre oleadas siguiendo las 5 de `OBSTACLE_LAYOUTS` y vuelve a empezar en la sexta.
- [ ] Los obstáculos bloquean a jugador, zombis y balas; el proyectil del cañón explota al chocar contra una caja.
- [ ] El HUD refleja integridad, puntuación, oleada y arma/munición en tiempo real, y el banner "OLEADA N" aparece en cada cambio de oleada.
- [ ] Al llegar la integridad a 0 se muestra la pantalla de game over con la puntuación final y la mejor marca de la sesión.
- [ ] La pantalla de game over guarda en `localStorage` `av_scores` una entrada con `game: "arena-zombie"`, `score`, `name` y `wave`, una sola vez por partida.
- [ ] El audio procedural suena para disparo, explosión, llamas, impacto, muerte, daño, pickup y cambio de oleada, sin errores si el navegador bloquea el audio hasta el primer gesto.
- [ ] Salir del juego o navegar fuera de la ruta desmonta el componente sin dejar `requestAnimationFrame` activos ni listeners, y sin errores en consola; "Reintentar" reinicia la partida limpiamente.
- [ ] Partida jugable de principio a fin sin errores de consola, en escritorio y en móvil.
- [ ] `npm run lint` sin errores.
- [ ] `npm run build` sin errores.

---

## Decisions

- **Sí:** Arena Z como Client Component autónomo (`<ArenaZombieGame />`), fuera del contrato `GameModule` / `GameCanvas` / `GamePlayer`. Razón: elegido por el usuario; el prototipo trae sus propias pantallas, HUD y control táctil (doble joystick), y su estado (`hp`, oleada, arma/munición) no encaja en `GameEvents` sin rediseñarlo. Esta spec es migración, no rediseño.
- **Sí:** canvas a pantalla completa del viewport (`innerWidth × innerHeight`) con `resize` dinámico. Razón: elegido por el usuario; los `OBSTACLE_LAYOUTS` y el spawn por bordes se calculan a partir de W,H y el prototipo ya funciona así.
- **Sí:** guardar la puntuación en `localStorage` `av_scores` vía `saveScore()` de SPEC 01, con `game: "arena-zombie"`. Razón: elegido por el usuario; es el mecanismo que usa hoy todo el catálogo. No hay tabla de puntuaciones en Supabase (SPEC 04 dejó fuera el esquema) y ningún ranking lee datos reales.
- **No:** persistir en Supabase ni conectar el Salón de la Fama / la ficha de detalle a puntuaciones reales. Razón: es un bloque grande (tabla + RLS + escritura + reescribir los leaderboards, hoy `seededScores`) que arrastra a todo el catálogo; va en su propia spec.
- **Sí:** extender `SavedScore` con `wave?: number` opcional. Razón: el usuario pidió registrar la oleada alcanzada junto a la puntuación; es un cambio aditivo y de bajo riesgo aunque ningún consumidor lo lea todavía.
- **Sí:** novena entrada nueva en `app/data.ts` (no se sustituye ningún placeholder). Razón: los 8 juegos actuales están ocupados y ninguno es un placeholder de zombis (a diferencia de `rocas` en SPEC 05).
- **Sí:** nueva clase `.cover-zombie` en `app/globals.css` con degradado/patrón propio. Razón: elegido por el usuario; reutilizar una portada existente daría una card incoherente con el juego.
- **Sí:** bifurcar en `app/juegos/[id]/jugar/page.tsx` por `game.id`, manteniendo la ruta `/juegos/arena-zombie/jugar`. Razón: elegido por el usuario; conserva el patrón catálogo → ficha → jugar sin duplicar el segmento `jugar` ni crear una ruta fuera de `/juegos`.
- **Sí:** ficha de detalle estándar en `/juegos/arena-zombie` con el leaderboard mock (`seededScores`). Razón: elegido por el usuario; la página dinámica ya funciona a partir de `getGameById` y el leaderboard mock sale gratis.
- **Sí:** pantalla de game over con campo de iniciales + botón de guardado (en vez de guardado automático). Razón: mantiene la paridad con el modal de fin de `GamePlayer` (SPEC 01) y deja al jugador elegir su nombre.
- **Sí:** mantener el balance, la IA, los temas visuales y el audio del prototipo exactamente igual. Razón: pedido explícito del usuario; el diseño ya está validado y esta spec solo lo porta.
- **No:** filtro pixel-art, arma cuerpo a cuerpo (lanza), arte real. Razón: probados y descartados en el prototipo; no se portan.
- **No:** integrar Arena Z en el marco CRT o en el HUD superior de `GamePlayer`. Razón: rompería el port fiel del prototipo; el usuario eligió el modo autónomo.

---

## Risks

| Riesgo                                                                                                                               | Mitigación                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| El prototipo usa estado a nivel de módulo, `document.getElementById` y arranque automático (`requestAnimationFrame(loop)` al cargar) | La factoría `create(canvas, callbacks)` encapsula todo el estado en el closure y no arranca nada en import; el bucle empieza en `start()` y se cancela en `destroy()`. El HUD pasa a JSX alimentado por `onHud`.                  |
| Fugas de `rAF` / listeners entre partidas o en React StrictMode (doble montaje en dev)                                               | El `useEffect` del motor tiene cleanup que llama `destroy()` (idempotente: cancela `rAF`, quita `keydown`/`keyup`/`mouse*`/`touch*`/`resize`, marca un flag). "Reintentar" remonta con `key`. Criterio de aceptación explícito.   |
| Canvas a pantalla completa: teclas de flecha y `Space` hacen scroll de la página                                                     | `preventDefault` de las teclas de juego mientras el componente está montado (salvo si el foco está en el `<input>` de iniciales); `touch-action: none` en el canvas.                                                              |
| Next.js 16: Client Component con `<canvas>` y listeners globales                                                                     | El componente es `"use client"`, monta el canvas en `useEffect` (nunca en render ni en Server Component); no hace falta `next/dynamic`. Antes de tocar `app/`, revisar `node_modules/next/dist/docs/01-app/` (client components). |
| `AudioContext` bloqueado hasta el primer gesto del usuario                                                                           | `initAudio()` se llama en el `onClick` de "Empezar" / "Reintentar"; todas las llamadas a `sfx.*` comprueban que el contexto existe y están envueltas en `try/catch` (igual que el prototipo).                                     |
| El doble joystick por zonas puede capturar toques del navegador (scroll, zoom, pull-to-refresh)                                      | `touch-action: none` en el canvas, `preventDefault` en `touchstart`/`touchmove`/`touchend`, y `viewport` con `user-scalable=no` ya presente en el `layout`.                                                                       |
| `getScores("arena-zombie")` genera un leaderboard mock distinto para el nuevo id                                                     | Es esperado: `seededScores` está sembrado por el id; las cifras son cosméticas hasta que una spec futura conecte puntuaciones reales.                                                                                             |
| El campo `plays: "0"` desentona con el resto del catálogo (miles de partidas)                                                        | Es correcto para un juego recién añadido; se puede ajustar a mano si se quiere coherencia estética, pero no hay dato real que reflejar.                                                                                           |

---

## What is **not** in this spec

- Persistencia de puntuaciones en Supabase y rankings (Salón de la Fama, ficha de detalle) con datos reales.
- Arte real (sprites, 3D), filtro pixel-art y arma cuerpo a cuerpo.
- Nuevas armas, tipos de zombi, temas u obstáculos fuera del prototipo.
- Progreso persistente entre partidas (desbloqueos, meta-progresión, inventario).
- Multijugador o modos cooperativos.
- Integrar Arena Z en el contrato `GameModule` / `GameCanvas` / `GamePlayer` o en el marco CRT.
- Canvas de resolución fija en caja (Arena Z es a pantalla completa).
- Extraer el motor de oleadas/obstáculos como módulo reutilizable.
- Tests automatizados.

Cada uno de estos, si se aborda, iría en su propia spec.

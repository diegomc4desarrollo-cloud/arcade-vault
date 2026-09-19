# Arena Zombie — Jefes finales (plantas 1, 3, 7 y 10)

**Estado:** Aprobado
**Depende de:** la spec del edificio de 10 plantas (mapas, flow field, `WAVES_PER_FLOOR`).
**Referencia:** `references/jefes/jefes-preview.html` (aspecto, animación y ciclo de ataque de cada jefe; la función `draw` de cada uno se porta tal cual) y `references/jefes/bosses.ts` (configuración: vida, velocidad, daño, habilidades, fases).

> Numera el archivo (`specs/NN-arena-zombie-jefes.md`) y ajusta las rutas a las de la demo.

## Resumen

Cuatro jefes de dificultad creciente que aparecen al terminar la última oleada de las plantas 1, 3, 7 y 10: El Capataz (embestida), La Matriarca (pare corredores, punto débil), El Rastreador (acelerón con estela) y Paciente Cero (pisotón en área + escombro, tres fases). La dificultad sube por número de cosas que vigilar a la vez, no solo por vida. Cada jefe tiene un telegrafiado visible antes de cada ataque. Mientras el jefe vive no se sube de planta; al morir, se sube.

## Alcance

- `bosses.ts`: tipos `BossConfig`, `BossAbility`, `BossPhase`, la lista `BOSSES`, `bossForFloor()` e `isBossWave()`.
- `bosses-logic.ts`: estado del jefe activo, máquina de estados por habilidad (`idle → windup → active → recovery`), fases por porcentaje de vida, punto débil, y los 5 tipos de habilidad: `charge`, `spawn`, `dash`, `slam`, `throw`.
- `bosses-draw.ts`: las cuatro funciones de dibujo del visor, más los telegrafiados (línea punteada de embestida, sacos brillantes, flash de salida del acelerón, círculo punteado del pisotón, sombra creciente del escombro).
- Oleada de jefe: en la última oleada de una planta con jefe, cuando `spawnQueue` llega a 0 y no quedan zombis normales, aparece el jefe en la casilla `S` más alejada del jugador. Banner "JEFE — nombre". La planta no avanza hasta que muere.
- HUD: barra de vida del jefe en la parte superior central, con nombre y marcas en los umbrales de fase.
- Movimiento: el jefe usa el mismo flow field que los zombis; colisiona con muros con `resolveObstacles()` (su radio en casillas viene de `radiusTiles`).
- Daño: el jefe recibe el daño de todas las armas por el mismo camino que los zombis (`hp -= dmg * armorMult`, ×2 si `weakWhile` está activa). El cañón y el lanzallamas funcionan igual que contra la horda.
- Paciente Cero: al morir elimina a todos los zombis restantes con partículas, y a continuación se muestra la pantalla de victoria (ya existente).
- Puntos del jefe al marcador; guardado en Supabase sin cambios.

## Fuera de alcance

- Jefes en las otras seis plantas.
- Un modo "solo jefes" o rejugar un jefe.
- Recompensas al matar un jefe (armas nuevas, vida extra). Solo puntos.
- Cinemática de entrada, diálogo o música propia.
- IA del jefe distinta del flow field (rodeos, flanqueos, huir del jugador).
- Balance fino: los números de `bosses.ts` son el punto de partida; si un jefe resulta trivial o injusto, spec de balance aparte.

## Estructuras y nombres concretos

- `demos/arena-zombie/bosses.ts` (copiar desde `references/jefes/bosses.ts`). Claves: `'capataz' | 'matriarca' | 'rastreador' | 'paciente-cero'`.
- `demos/arena-zombie/bosses-logic.ts`:
  - `interface BossState { cfg: BossConfig; x; y; hp; maxHp; angle; phaseIndex; armorMult; speedMult; cooldownMult; spawnCount; trailDamage; rage: boolean; ability: { kind; stage: 'idle'|'windup'|'active'|'recovery'; t: number; cooldowns: number[] }; dash?: { dirX; dirY; trail: {x;y;t}[] }; charge?: { dirX; dirY; stunned: number }; throw?: { targetX; targetY; t } }`
  - `spawnBoss(cfg, floor): BossState`, `updateBoss(boss, dt, ctx)` donde `ctx` da acceso a jugador, zombis, obstáculos, flow field y a `spawnParticles`/`sfx`.
  - `damageBoss(boss, dmg)` aplica `armorMult`, punto débil y comprueba fases; devuelve `true` si ha muerto.
- Habilidades (todas: `windup` con telegrafiado → `active` → `recovery` 0.4 s → cooldown):
  - `charge`: durante `windup` el jefe se detiene y mira al jugador; en `active` avanza en línea recta a `speedMult` hasta tocar al jugador (daño) o un muro (`stunOnWall` s aturdido, no se mueve ni ataca).
  - `spawn`: durante `windup` el jefe se detiene; al terminar aparecen `spawnCount` corredores a su alrededor. Mientras `windup`, `weakWhile` está activa (daño ×2).
  - `dash`: en `windup` el jefe es intangible y semitransparente; se dibuja el flash en el punto de destino (posición actual del jugador, limitada por el primer muro en esa dirección). En `active` recorre la línea a `speedMult`; golpea si toca al jugador. Deja `trail` durante `trailDuration`; si `trailDamage > 0`, pisarlo hace daño (una vez por segundo).
  - `slam`: en `windup` levanta los brazos y se dibuja el círculo punteado de radio `radiusTiles`; en `active` la onda se expande de 0 a `radiusTiles` en 0.8 s y daña al jugador una vez si está dentro cuando la onda le alcanza.
  - `throw`: al empezar `windup` fija el destino en la posición del jugador y dibuja la sombra creciente; al terminar cae el escombro y daña en `radiusTiles`. El proyectil vuela por encima de los muros.
- Paciente Cero alterna `slam` y `throw`: no puede encadenar dos iguales.
- Fases: al bajar de `hpBelow` se aplica la fase una sola vez (`phaseIndex++`), con flash blanco y `sfx.wave()`.
- Estado de partida: `boss: BossState | null`; `startNextWave()` no avanza de planta mientras `boss` no sea `null`.

## Pasos

1. Copiar `bosses.ts` a la demo. Compila; nada lo usa aún.
2. `bosses-draw.ts` con las cuatro funciones del visor y un `drawBoss(boss, ctx, t)` que despacha por `cfg.key`. Sistema funcionando: se puede dibujar un jefe estático en cualquier punto (probar con el Capataz en el centro).
3. `bosses-logic.ts` con `spawnBoss`, `damageBoss` y `updateBoss` solo con movimiento (flow field + colisión) y contacto. Sistema funcionando: el Capataz persigue y hace daño, sin habilidades.
4. Oleada de jefe: `isBossWave()` en `startNextWave()`, aparición en la `S` más lejana cuando se vacía la horda, banner "JEFE — nombre", bloqueo del avance de planta hasta su muerte, puntos al morir. Sistema funcionando: se puede completar la planta 1 matando al Capataz a pistola.
5. Barra de vida del jefe en el HUD con marcas de fase.
6. Daño desde balas, cañón y lanzallamas por `damageBoss()`; punto débil y fases. Sistema funcionando: todas las armas hacen daño al jefe y el HUD baja.
7. Habilidad `charge` (Capataz) con su telegrafiado y aturdimiento contra muro.
8. Habilidad `spawn` (Matriarca) con punto débil y fase de 5 corredores.
9. Habilidad `dash` (Rastreador) con intangibilidad, flash de destino, estela y fase con daño de estela.
10. Habilidades `slam` y `throw` (Paciente Cero) alternadas, armadura, furia, y muerte de la horda al morir. Sistema funcionando: la partida completa termina en victoria tras Paciente Cero.
11. Prueba manual de los cuatro jefes en escritorio y móvil (ver criterios).

## Criterios de aceptación

- [ ] Los cuatro jefes aparecen solo al vaciar la última oleada de su planta, y la planta no avanza hasta que mueren.
- [ ] Cada jefe se dibuja como en `jefes-preview.html` y a la escala indicada por `radiusTiles`.
- [ ] Todo ataque tiene un telegrafiado visible de al menos `windup` s antes de hacer daño; no hay daño de jefe sin aviso.
- [ ] El Capataz se aturde `stunOnWall` s al chocar contra un muro y no hace daño mientras está aturdido.
- [ ] La Matriarca recibe daño doble mientras pare; a partir del 40 % pare 5 en vez de 3.
- [ ] El Rastreador es intangible solo durante `windup`, siempre muestra el flash de destino, y a partir del 50 % su estela hace daño.
- [ ] Paciente Cero alterna pisotón y escombro, pierde la armadura al 60 %, entra en furia al 30 % y al morir desaparece toda la horda antes de la pantalla de victoria.
- [ ] La barra de vida del jefe muestra nombre, vida y marcas de fase, y desaparece al morir.
- [ ] Todas las armas dañan al jefe; el cañón y el lanzallamas siguen funcionando contra la horda mientras el jefe está vivo.
- [ ] Ningún jefe atraviesa muros (salvo el proyectil del escombro, que vuela por encima) ni se queda atascado permanentemente.
- [ ] Sin caídas de fotogramas con el jefe, su estela/onda y 30 zombis en pantalla.

## Alternativas consideradas

- **Jefes en todas las plantas vs. en 1/3/7/10:** cuatro, para que cada uno sea un hito y no un trámite; las plantas intermedias son de horda pura.
- **Un solo jefe reescalado vs. cuatro distintos:** cuatro, porque la dificultad debe subir por mecánicas (más cosas que vigilar), no solo por vida.
- **Habilidades como datos + máquina de estados vs. una clase por jefe:** datos y una máquina de estados común, para que añadir o retocar un jefe sea editar `bosses.ts` y no duplicar lógica.
- **Telegrafiado obligatorio:** todo ataque avisa antes; un jefe que golpea sin aviso se siente injusto, no difícil.
- **Sin recompensas al matar:** solo puntos, para no tocar el balance de armas; queda como posible spec futura.

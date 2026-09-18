# Arena Zombie — Edificio de 10 plantas (mapas de casillas)

**Estado:** Implementado
**Depende de:** la spec de Arena Zombie ya implementada (bucle de juego, armas, zombis, oleadas, obstáculos).
**Referencia:** `references/planos/planos-10-plantas.html` (planos cenitales de las 10 plantas), `references/planos/maps.ts` (los mapas y su parser) y `references/planos/navigation.ts` (flow field para los zombis). Los tres son archivos nuevos: se copian a la demo, no sustituyen nada de lo implementado.

> Numera el archivo (`specs/NN-arena-zombie-plantas.md`) con el siguiente libre y ajusta las rutas a las de la demo.

## Resumen

Sustituir la rotación actual de 5 disposiciones de cajas por un edificio de 10 plantas con planos reales — salas, pasillos, puertas, pilares, estanterías — definidos como mapas de casillas en ASCII (32 x 18). Cada planta es un nivel; se sube de planta cada `WAVES_PER_FLOOR` oleadas y al superar la planta 10 se gana. Los muros bloquean jugador, zombis y munición con la colisión ya existente. Como los planos tienen paredes y puertas de verdad, los zombis dejan de perseguir en línea recta y siguen un _flow field_ (BFS desde el jugador) para rodear muros y entrar por las puertas.

## Alcance

- `maps.ts`: los 10 mapas ASCII, `parseFloor()` (casillas → muros fusionados como `Obstacle`, punto de aparición del jugador, entradas de zombis, puntos de arma), `floorIndexForWave()` e `isBuildingCleared()`.
- `navigation.ts`: `computeFlowField()` (BFS sobre casillas de suelo desde la casilla del jugador) y `flowDirection()` (dirección a seguir desde una posición). Se recalcula cuando el jugador cambia de casilla o cada 150 ms, una vez por frame como máximo, nunca por zombi.
- Zombis: en vez del vector directo al jugador usan `flowDirection()`; si devuelve `null` (misma casilla que el jugador o zona inalcanzable) caen a la persecución directa de siempre. La colisión `resolveObstacles()` se mantiene tal cual.
- Aparición de zombis en las casillas `S` de la planta (escaleras, entradas), no en los bordes de pantalla. Se elige una `S` al azar por zombi.
- Aparición de armas solo en las casillas `W` de la planta, para que ningún pickup caiga dentro de un muro.
- Al cambiar de planta: jugador a la casilla `P`, balas y pickups limpiados, tema de fondo de la planta y banner "PLANTA N — nombre". Entre oleadas de la misma planta, banner "OLEADA N".
- Radios del jugador y de los zombis expresados en casillas (`r = factor × min(tileW, tileH)`), para que las puertas de 2 casillas sean transitables en cualquier tamaño de pantalla. Factores: jugador 0.55, caminante 0.5, cojo 0.48, corredor 0.4, bruto 0.8.
- Pantalla de victoria al superar la última oleada de la planta 10, con puntuación final y guardado en Supabase igual que el game over.
- Test de validación de mapas (mismas reglas que cumple la referencia): 32 x 18 exactas, todo el suelo alcanzable desde `P`, ningún pasillo de 1 casilla, una `P`, ≥ 2 `S`, ≥ 2 `W` por planta.
- Retirar `OBSTACLE_LAYOUTS` y su rotación, y el spawn por bordes de pantalla.

## Fuera de alcance

- Generación procedural de plantas: son 10 planos fijos, editables a mano en el ASCII.
- Enemigos, armas o jefes específicos por planta. La composición sigue viniendo de `waveConfig()`.
- A* individual, evitación entre zombis o comportamiento de grupo: el flow field compartido es suficiente para hordas.
- Puertas que se abren/cierran, cristales rompibles, ascensores o cualquier elemento dinámico del plano.
- Decorado dentro de las salas (mesas, ordenadores) más allá de las casillas de muro.
- Cambios de balance de oleadas. Si las plantas cerradas resultan demasiado duras o blandas, spec aparte.
- Cámara con desplazamiento: la planta entera cabe en pantalla, como hasta ahora.

## Estructuras y nombres concretos

- `demos/arena-zombie/maps.ts` (copiar desde `references/planos/maps.ts`):
  - `MAP_COLS = 32`, `MAP_ROWS = 18`, `WAVES_PER_FLOOR = 3`.
  - `interface FloorMap { id; name; theme; rows: string[] }` y `FLOOR_MAPS: FloorMap[]` con las 10 plantas: Vestíbulo, Oficinas, Almacén, Laboratorio, Parking, Cafetería, Salas de reuniones, Archivo, Sala de servidores, Azotea.
  - Leyenda: `#` muro, `.` suelo, `P` jugador, `S` entrada de zombis, `W` punto de arma.
  - `parseFloor(map, W, H): ParsedFloor` → `{ tileW, tileH, walls: Obstacle[], solid: boolean[][], playerSpawn, zombieSpawns[], pickupSpots[] }`. Los muros se fusionan por tramos horizontales para reducir el número de rects en la colisión.
- `demos/arena-zombie/navigation.ts` (copiar desde `references/planos/navigation.ts`):
  - `type FlowField = Int32Array` (índice `fila * MAP_COLS + col`, `-1` = inalcanzable).
  - `computeFlowField(solid, targetCol, targetRow): FlowField`.
  - `flowDirection(field, solid, x, y, tileW, tileH): {x, y} | null` (vecinos ortogonales y diagonales; la diagonal no corta esquinas de muro).
- Estado nuevo en la partida: `currentFloor: ParsedFloor`, `flowField: FlowField`, `lastPlayerTile: {c, r}`, `state` gana el valor `'victory'`.
- Punto de conexión en `startNextWave()`: `currentFloor = parseFloor(FLOOR_MAPS[floorIndexForWave(wave)], W, H)`; `obstacles = currentFloor.walls`; si la planta ha cambiado, recolocar jugador y aplicar tema/banner.
- Cambio en el bucle de zombis: `const dir = flowDirection(...) ?? direct;` antes de aplicar la velocidad. El resto (wobble, colisión, animación de marcha) no cambia.
- `spawnZombie()` toma la posición de `currentFloor.zombieSpawns`; `spawnPickup()` de `currentFloor.pickupSpots` (evitando la que ya tenga pickup).

## Pasos

1. Copiar `maps.ts` y `navigation.ts` a la demo e importar `Obstacle` desde los tipos existentes. Compila; nada los usa aún.
2. Test de validación de `FLOOR_MAPS` (dimensiones, conectividad por BFS, anchura mínima 2, conteo de `P`/`S`/`W`). Debe pasar con los 10 mapas de referencia antes de seguir.
3. En `startNextWave()`, cargar la planta con `parseFloor()` y usar `currentFloor.walls` como `obstacles` en lugar de `OBSTACLE_LAYOUTS`. Sistema funcionando: se juega sobre el Vestíbulo con la persecución directa de siempre (los zombis se atascarán en los muros: es lo esperado hasta el paso 6).
4. Radios de jugador y zombis en función del tamaño de casilla. Sistema funcionando: el bruto pasa por las puertas en móvil.
5. `spawnZombie()` desde las casillas `S` y `spawnPickup()` desde las `W`. Sistema funcionando: nadie aparece dentro de un muro.
6. Flow field: calcular en `update()` cuando el jugador cambia de casilla (o cada 150 ms) y usar `flowDirection()` en el bucle de zombis con caída a persecución directa. Sistema funcionando: los zombis rodean muros y entran por las puertas.
7. Cambio de planta: recolocar al jugador en `playerSpawn`, limpiar balas y pickups, aplicar `theme` y banner "PLANTA N — nombre". Sistema funcionando: al pasar a Oficinas el jugador aparece en su punto.
8. `state = 'victory'` y su pantalla (mismo estilo que game over), disparada cuando `isBuildingCleared(wave)` tras limpiar la última oleada; guardado en Supabase como en game over.
9. Retirar `OBSTACLE_LAYOUTS`, la rotación antigua y el spawn por bordes. Sistema funcionando: sin referencias muertas.
10. Prueba manual de las 10 plantas en escritorio y móvil (ver criterios).

## Criterios de aceptación

- [ ] Existen `maps.ts` y `navigation.ts` y el test de validación pasa con los 10 mapas.
- [ ] Cada una de las 10 plantas se ve claramente distinta y coincide con su plano de `planos-10-plantas.html`.
- [ ] Los muros bloquean jugador, zombis y balas; el cañón explota contra ellos.
- [ ] Los zombis rodean muros y cruzan puertas hasta llegar al jugador esté donde esté (prueba: en cada planta, dejar pasar una oleada sin disparar desde el punto más alejado de las entradas y comprobar que todos llegan).
- [ ] Ningún zombi ni pickup aparece dentro de un muro.
- [ ] El bruto cruza cualquier puerta de 2 casillas también en pantalla de móvil.
- [ ] La planta cambia exactamente cada `WAVES_PER_FLOOR` oleadas, el jugador aparece en su `P`, y el banner muestra "PLANTA N — nombre" con el tema de fondo de la planta.
- [ ] Superar la última oleada de la planta 10 muestra la pantalla de victoria y guarda la puntuación.
- [ ] El flow field se calcula como mucho una vez por frame y solo cuando cambia la casilla del jugador o han pasado 150 ms; no hay caídas de fotogramas con 40 zombis en pantalla.
- [ ] `OBSTACLE_LAYOUTS` y el spawn por bordes ya no existen en el código.

## Alternativas consideradas

- **Mapas ASCII vs. rectángulos en fracciones:** ASCII, porque un plano con salas y pasillos son decenas de tramos de muro — dibujarlos como texto se lee y se edita a mano de un vistazo (y la referencia visual viene sola). Los rectángulos se derivan del texto al cargar, así que la colisión existente no cambia.
- **Flow field vs. A\* por zombi vs. seguir con "chocar y deslizar":** con paredes reales la persecución directa se atasca en cualquier esquina, así que hace falta navegación. A\* por zombi es caro con hordas; un flow field compartido se calcula una vez y lo consultan todos.
- **Radios fijos en píxeles vs. relativos a la casilla:** relativos, porque con 32 columnas una puerta de 2 casillas mide ~24 px en un móvil y el bruto (46 px) no cabría.
- **Aparición por bordes vs. casillas `S`:** con anillo exterior de muro los bordes ya no son transitables; las `S` además permiten diseñar por dónde entra la horda en cada planta.
- **Una planta por oleada vs. varias por planta:** varias (3), para que cada plano dé tiempo a aprenderse y a usar sus coberturas.

## Notas (fuera del alcance original, añadidas durante la implementación)

Durante la implementación de esta spec el usuario pidió dos arreglos que no forman parte del alcance original (HUD y balance de armas, no planos/navegación). Se implementaron en la misma rama a petición explícita, documentados aquí en vez de en una spec aparte:

- **Munición invisible en el HUD:** no era un bug del juego. El indicador de desarrollo de Next.js (`devIndicators`) se renderiza por defecto abajo-a-la-izquierda, la misma esquina donde Arena Z muestra el panel de arma/munición (`.az-hud-bl`), y lo tapaba durante `next dev`. Solo ocurre en desarrollo, nunca en producción. Arreglado moviendo el indicador a `bottom-right` en `next.config.ts` (`devIndicators.position`).
- **Lanzallamas con llamarada más grande:** en `app/games/arena-zombie/config.ts` el arma `flamer` pasó de `range: 130, arc: 0.42` a `range: 180, arc: 0.52` (más alcance y cono más ancho). En `app/games/arena-zombie/engine.ts` (`applyFlameStream()`) las partículas de la llamarada pasaron de 2 a 4 por tick, con más tamaño (5–10 px en vez de 3–6.5 px), más velocidad y más vida, para que el efecto visual se corresponda con el nuevo alcance. Esto también aumenta ligeramente el daño potencial del arma (más alcance/ángulo de impacto), no solo el aspecto visual — si el balance resultante no gusta, es un ajuste rápido de esos mismos valores.
- **Munición del HUD al mismo tamaño que el nombre del arma:** `.az-weapon-ammo` en `app/globals.css` pasó de `font-size: 12px; color: #7c8580` (gris apagado) a `font-size: 14px; font-weight: 600; font-family: var(--pixel); color: #e9e6dc` (blanco brillante), igualando el tamaño/peso de `.az-weapon-name`.
- **Aviso "¿recuperar vida?" entre oleadas:** al superar una oleada que no es la última de la planta 10, la partida se pausa y aparece un aviso Sí/No preguntando si se quiere restaurar la vida al máximo antes de la siguiente oleada. Cambios: `ArenaZombieCallbacks.onWaveClear` y `ArenaZombieHandle.continueAfterWave(healFull)` en `types.ts`; nuevo estado `"wavebreak"` en `engine.ts` (congela `update()`/`render()` igual que `"gameover"`/`"victory"`, se dispara justo antes de `startNextWave()` cuando `zombies.length === 0` y aún no se ha limpiado el edificio); panel Sí/No en `ArenaZombieGame.tsx` con las clases nuevas `.az-wavebreak-question`/`.az-wavebreak-actions`/`.az-decline` en `globals.css`. No se disparó pasa la victoria de la planta 10.
  - **Nota de verificación:** confirmado por build/lint limpios y revisión manual línea a línea contra el patrón ya probado de `"gameover"`/`"victory"` (mismo mecanismo de congelar `update()`/`render()` y reanudar vía un método público del handle). No conseguí completar una oleada real jugando con el ratón automatizado (el arma inicial, la pistola, tiene un cono de disparo muy estrecho — 0.02 rad — que exige apuntar casi exactamente al zombi, algo poco fiable de reproducir con movimientos de ratón guionizados) para pulsar el botón Sí/No en una partida real de extremo a extremo. Vale la pena que lo pruebes tú una vez en el navegador.

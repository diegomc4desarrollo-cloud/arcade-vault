// Jefes finales de Arena Zombie (plantas 1, 3, 7 y 10). Solo datos: la lógica va en
// bosses-logic.ts y el dibujo en bosses-draw.ts. Radios en casillas, velocidades relativas
// al jugador, tiempos en segundos.
// El aspecto de cada jefe está en references/jefes/jefes-preview.html (función draw de cada uno).

export type BossKey = "capataz" | "matriarca" | "rastreador" | "paciente-cero";

export type BossAbilityKind = "charge" | "spawn" | "dash" | "slam" | "throw";

export interface BossAbility {
  kind: BossAbilityKind;
  cooldown: number; // s entre usos
  windup: number; // s de telegrafiado antes del golpe
  damage?: number; // daño del golpe (0 si no hace daño directo)
  radiusTiles?: number; // slam: radio de la onda
  speedMult?: number; // charge/dash: multiplicador de velocidad durante el ataque
  spawnType?: "runner"; // spawn
  spawnCount?: number; // spawn
  stunOnWall?: number; // charge: s aturdido si choca con muro
  trailDamage?: number; // dash: daño por pisar la estela (0 = sin daño)
  trailDuration?: number; // dash: s que dura la estela
}

export interface BossPhase {
  hpBelow: number; // fracción de vida (0-1) por debajo de la cual entra la fase
  speedMult?: number; // sustituye a la velocidad base
  cooldownMult?: number; // multiplica los cooldowns de todas las habilidades
  spawnCount?: number; // spawn: sustituye la cantidad
  trailDamage?: number; // dash: activa daño de estela
  armorMult?: number; // multiplicador del daño recibido (1 = normal)
  rage?: boolean; // cambio de color + efectos
}

export interface BossConfig {
  key: BossKey;
  name: string;
  floor: number; // planta en la que aparece (1-based)
  radiusTiles: number;
  hp: number;
  speedMult: number; // relativo a player.speed
  contactDamage: number;
  points: number;
  armorMult: number; // daño recibido inicial (Paciente Cero empieza con armadura)
  weakWhile?: BossAbilityKind; // recibe doble daño mientras ejecuta esta habilidad
  killsHordeOnDeath?: boolean;
  abilities: BossAbility[];
  phases: BossPhase[];
  color: string;
  dark: string;
  eye: string;
}

export const BOSSES: BossConfig[] = [
  {
    key: "capataz",
    name: "El Capataz",
    floor: 1,
    radiusTiles: 1.15,
    hp: 45,
    speedMult: 0.6,
    contactDamage: 16,
    points: 250,
    armorMult: 1,
    abilities: [
      { kind: "charge", cooldown: 5, windup: 0.6, damage: 28, speedMult: 2.2, stunOnWall: 1.0 },
    ],
    phases: [],
    color: "#5b5a32",
    dark: "#37361b",
    eye: "#ffcf3b",
  },
  {
    key: "matriarca",
    name: "La Matriarca",
    floor: 3,
    radiusTiles: 1.35,
    hp: 70,
    speedMult: 0.45,
    contactDamage: 18,
    points: 500,
    armorMult: 1,
    weakWhile: "spawn",
    abilities: [{ kind: "spawn", cooldown: 6, windup: 1.4, spawnType: "runner", spawnCount: 3 }],
    phases: [{ hpBelow: 0.4, spawnCount: 5, cooldownMult: 0.66 }],
    color: "#5c3a5a",
    dark: "#33203a",
    eye: "#ff6ad5",
  },
  {
    key: "rastreador",
    name: "El Rastreador",
    floor: 7,
    radiusTiles: 0.95,
    hp: 110,
    speedMult: 0.95,
    contactDamage: 14,
    points: 900,
    armorMult: 1,
    abilities: [
      {
        kind: "dash",
        cooldown: 4,
        windup: 0.5,
        damage: 30,
        speedMult: 3,
        trailDamage: 0,
        trailDuration: 1.2,
      },
    ],
    phases: [{ hpBelow: 0.5, cooldownMult: 0.62, trailDamage: 8 }],
    color: "#5a1f1f",
    dark: "#2a0d0d",
    eye: "#ff2a2a",
  },
  {
    key: "paciente-cero",
    name: "Paciente Cero",
    floor: 10,
    radiusTiles: 1.9,
    hp: 260,
    speedMult: 0.5,
    contactDamage: 25,
    points: 2500,
    armorMult: 0.7,
    killsHordeOnDeath: true,
    abilities: [
      { kind: "slam", cooldown: 7, windup: 0.8, damage: 40, radiusTiles: 3 },
      { kind: "throw", cooldown: 5, windup: 0.6, damage: 22, radiusTiles: 1.2 },
    ],
    phases: [
      { hpBelow: 0.6, armorMult: 1 },
      { hpBelow: 0.3, speedMult: 0.9, cooldownMult: 0.57, rage: true },
    ],
    color: "#2f2a44",
    dark: "#161226",
    eye: "#9fef22",
  },
];

/** Jefe que corresponde a una planta (1-based), o undefined si esa planta no tiene. */
export function bossForFloor(floor: number): BossConfig | undefined {
  return BOSSES.find((b) => b.floor === floor);
}

/** true si la oleada (1-based) es la última de una planta con jefe. */
export function isBossWave(wave: number, wavesPerFloor: number): boolean {
  if (wave % wavesPerFloor !== 0) return false;
  return bossForFloor(wave / wavesPerFloor) !== undefined;
}

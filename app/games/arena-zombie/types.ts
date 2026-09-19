// Tipos del motor de Arena Z. Portados 1:1 del prototipo
// references/started-games/010-zombie/arena-zombie-prototipo.html.

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
  // Factor de radio relativo al tamaño de casilla: r = radiusFactor × min(tileW, tileH).
  radiusFactor: number;
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

// Firma visual de marcha por arquetipo (longitud de zancada, flexión de
// rodilla, grosor de pierna, rango de cojera por individuo, offset/tamaño de
// torso y balanceo de cabeza).
export interface GaitParams {
  stepAmp: number;
  kneeBend: number;
  legW: number;
  limpRange: [number, number];
  torsoOx: number;
  torsoOy: number;
  torsoRx: number;
  torsoRy: number;
  tiltAmp: number;
  tiltBias: number;
}

export interface Theme {
  name: string;
  sky: [string, string];
  floor: string;
  grid: string;
  fog: string;
}

export interface WaveConfig {
  total: number;
  limperChance: number;
  runnerChance: number;
  bruteChance: number;
  spawnInterval: number;
  speedMult: number;
  healthMult: number;
}

// Instantánea del HUD que el motor emite a React en cada frame.
export interface HudSnapshot {
  hp: number;
  score: number;
  wave: number;
  floor: number; // planta del edificio, 1-10
  floorName: string;
  weaponName: string;
  ammo: number | "∞";
}

export interface ArenaZombieCallbacks {
  onHud: (hud: HudSnapshot) => void;
  onBanner: (big: string, small: string) => void;
  onGameOver: (score: number, wave: number) => void;
  onVictory: (score: number, wave: number) => void;
  // Oleada superada (y no es la última): la partida se pausa hasta que
  // React llame a `continueAfterWave()` con la decisión del jugador.
  onWaveClear: (wave: number) => void;
}

// Handle con el que React controla la partida.
export interface ArenaZombieHandle {
  start: () => void; // (re)inicia una partida y arranca el bucle
  pause: () => void;
  resume: () => void;
  // Responde al aviso de `onWaveClear`: si `healFull` es true, restaura la
  // vida al máximo, y en cualquier caso reanuda la partida con la siguiente oleada.
  continueAfterWave: (healFull: boolean) => void;
  initAudio: () => void; // llamar en el gesto del usuario (botón Empezar)
  destroy: () => void; // cancela rAF y quita todos los listeners
}

// Datos de balance de Arena Z. Valores idénticos al prototipo
// references/started-games/010-zombie/arena-zombie-prototipo.html — no se retocan.

import type { GaitParams, Theme, Weapon, WaveConfig, ZombieType } from "./types";

// Radio del jugador relativo al tamaño de casilla: r = PLAYER_RADIUS_FACTOR × min(tileW, tileH).
export const PLAYER_RADIUS_FACTOR = 0.55;

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
    range: 180,
    arc: 0.52,
    fuelPerSec: 24,
    ammo: 150,
    color: "#ff7a2e",
  },
};

export const Z_TYPES: Record<string, ZombieType> = {
  walker: {
    radiusFactor: 0.5,
    speed: 58,
    hp: 2,
    color: "#4c5a3a",
    dark: "#333f27",
    dmg: 9,
    points: 10,
    gait: "shuffle",
  },
  limper: {
    radiusFactor: 0.48,
    speed: 32,
    hp: 3,
    color: "#4a4638",
    dark: "#2c2919",
    dmg: 11,
    points: 14,
    gait: "limp",
  },
  runner: {
    radiusFactor: 0.4,
    speed: 118,
    hp: 1,
    color: "#6a4a3a",
    dark: "#40291d",
    dmg: 6,
    points: 16,
    gait: "sprint",
  },
  brute: {
    radiusFactor: 0.8,
    speed: 38,
    hp: 8,
    color: "#5a3a4a",
    dark: "#331f2b",
    dmg: 19,
    points: 35,
    gait: "stomp",
  },
};

export const GAIT_PARAMS: Record<string, GaitParams> = {
  shuffle: {
    stepAmp: 6.5,
    kneeBend: 4,
    legW: 3.2,
    limpRange: [0.85, 1.15],
    torsoOx: -1,
    torsoOy: 0,
    torsoRx: 8,
    torsoRy: 6.3,
    tiltAmp: 0.26,
    tiltBias: 0,
  },
  limp: {
    stepAmp: 5,
    kneeBend: 2,
    legW: 3,
    limpRange: [0.18, 0.46],
    torsoOx: -1,
    torsoOy: 1.4,
    torsoRx: 7.4,
    torsoRy: 6.6,
    tiltAmp: 0.14,
    tiltBias: 0.46,
  },
  sprint: {
    stepAmp: 10.5,
    kneeBend: 7.5,
    legW: 3,
    limpRange: [0.92, 1.05],
    torsoOx: 2.6,
    torsoOy: 0,
    torsoRx: 9.6,
    torsoRy: 5.2,
    tiltAmp: 0.1,
    tiltBias: 0,
  },
  stomp: {
    stepAmp: 8,
    kneeBend: 2.2,
    legW: 5,
    limpRange: [0.9, 1.1],
    torsoOx: -1,
    torsoOy: 0,
    torsoRx: 9.6,
    torsoRy: 7.6,
    tiltAmp: 0.16,
    tiltBias: 0,
  },
};

// "Niveles" visuales: rotan cada 4 oleadas.
export const THEMES: Theme[] = [
  {
    name: "Tejados",
    sky: ["#1c2422", "#121613"],
    floor: "#2a322c",
    grid: "rgba(180,200,170,.05)",
    fog: "rgba(140,190,120,.06)",
  },
  {
    name: "Desierto",
    sky: ["#3a2413", "#1c130a"],
    floor: "#4a3018",
    grid: "rgba(255,200,120,.06)",
    fog: "rgba(255,150,60,.09)",
  },
  {
    name: "Noche",
    sky: ["#141328", "#08081a"],
    floor: "#1c1c34",
    grid: "rgba(140,150,255,.06)",
    fog: "rgba(120,120,255,.08)",
  },
];

export function waveConfig(w: number): WaveConfig {
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

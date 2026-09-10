// Audio procedural de Arena Z (Web Audio API, sin assets). Portado del
// prototipo: osciladores cortos con caída exponencial.

type OscType = OscillatorType;

export interface ArenaAudio {
  init: () => void;
  sfx: {
    shoot: () => void;
    shotgun: () => void;
    hit: () => void;
    death: () => void;
    hurt: () => void;
    pickup: () => void;
    wave: () => void;
    cannon: () => void;
    explosion: () => void;
    flame: () => void;
  };
}

export function createAudio(): ArenaAudio {
  let ctx: AudioContext | null = null;

  function init(): void {
    if (!ctx) {
      try {
        const Ctor =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (Ctor) ctx = new Ctor();
      } catch {
        // El navegador puede bloquear la creación del contexto: se juega sin audio.
      }
    } else if (ctx.state === "suspended") {
      void ctx.resume();
    }
  }

  function beep(freq: number, dur: number, type: OscType, vol: number): void {
    if (!ctx) return;
    try {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.value = freq;
      g.gain.value = vol;
      o.connect(g);
      g.connect(ctx.destination);
      const t0 = ctx.currentTime;
      o.start(t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.stop(t0 + dur);
    } catch {
      // Ignorar fallos puntuales del grafo de audio.
    }
  }

  const sfx = {
    shoot: () => beep(880, 0.05, "square", 0.035),
    shotgun: () => beep(220, 0.09, "sawtooth", 0.05),
    hit: () => beep(140, 0.06, "triangle", 0.05),
    death: () => beep(90, 0.18, "sawtooth", 0.06),
    hurt: () => beep(70, 0.15, "square", 0.08),
    pickup: () => {
      beep(660, 0.08, "sine", 0.05);
      window.setTimeout(() => beep(990, 0.08, "sine", 0.05), 80);
    },
    wave: () => {
      beep(220, 0.12, "triangle", 0.06);
      window.setTimeout(() => beep(330, 0.16, "triangle", 0.06), 110);
    },
    cannon: () => beep(70, 0.16, "sawtooth", 0.09),
    explosion: () => {
      beep(55, 0.28, "sawtooth", 0.11);
      window.setTimeout(() => beep(40, 0.2, "square", 0.06), 40);
    },
    flame: () => beep(140 + Math.random() * 60, 0.06, "sawtooth", 0.02),
  };

  return { init, sfx };
}

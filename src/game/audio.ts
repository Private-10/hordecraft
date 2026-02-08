// Procedural audio system using Web Audio API — no external files needed

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let musicGain: GainNode | null = null;
let sfxGain: GainNode | null = null;
let musicPlaying = false;
let musicOscillators: OscillatorNode[] = [];

function getCtx(): AudioContext | null {
  try {
  if (!ctx) {
    ctx = new AudioContext();
    masterGain = ctx.createGain();
    masterGain.gain.value = 0.5;
    masterGain.connect(ctx.destination);

    musicGain = ctx.createGain();
    musicGain.gain.value = 0.3;
    musicGain.connect(masterGain);

    sfxGain = ctx.createGain();
    sfxGain.gain.value = 0.6;
    sfxGain.connect(masterGain);
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
  } catch (e) {
    console.warn("Audio init failed:", e);
    return null;
  }
}

// ========== SFX ==========

export function playHit() {
  const c = getCtx(); if (!c) return;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = "square";
  osc.frequency.setValueAtTime(200, c.currentTime);
  osc.frequency.exponentialRampToValueAtTime(80, c.currentTime + 0.1);
  gain.gain.setValueAtTime(0.3, c.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, c.currentTime + 0.12);
  osc.connect(gain);
  gain.connect(sfxGain!);
  osc.start();
  osc.stop(c.currentTime + 0.12);
}

export function playKill() {
  const c = getCtx(); if (!c) return;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(400, c.currentTime);
  osc.frequency.exponentialRampToValueAtTime(800, c.currentTime + 0.08);
  osc.frequency.exponentialRampToValueAtTime(200, c.currentTime + 0.15);
  gain.gain.setValueAtTime(0.2, c.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, c.currentTime + 0.18);
  osc.connect(gain);
  gain.connect(sfxGain!);
  osc.start();
  osc.stop(c.currentTime + 0.18);
}

export function playXP() {
  const c = getCtx(); if (!c) return;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(600, c.currentTime);
  osc.frequency.exponentialRampToValueAtTime(1200, c.currentTime + 0.06);
  gain.gain.setValueAtTime(0.15, c.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, c.currentTime + 0.08);
  osc.connect(gain);
  gain.connect(sfxGain!);
  osc.start();
  osc.stop(c.currentTime + 0.08);
}

export function playLevelUp() {
  const c = getCtx(); if (!c) return;
  const notes = [523, 659, 784, 1047]; // C5 E5 G5 C6
  notes.forEach((freq, i) => {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    const t = c.currentTime + i * 0.1;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.25, t + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.3);
    osc.connect(gain);
    gain.connect(sfxGain!);
    osc.start(t);
    osc.stop(t + 0.3);
  });
}

export function playDamage() {
  const c = getCtx(); if (!c) return;
  // Noise burst
  const bufferSize = c.sampleRate * 0.1;
  const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  }
  const noise = c.createBufferSource();
  noise.buffer = buffer;
  const gain = c.createGain();
  gain.gain.setValueAtTime(0.3, c.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, c.currentTime + 0.1);
  const filter = c.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 800;
  noise.connect(filter);
  filter.connect(gain);
  gain.connect(sfxGain!);
  noise.start();
  noise.stop(c.currentTime + 0.1);
}

export function playShockWave() {
  const c = getCtx(); if (!c) return;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(150, c.currentTime);
  osc.frequency.exponentialRampToValueAtTime(40, c.currentTime + 0.3);
  gain.gain.setValueAtTime(0.25, c.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, c.currentTime + 0.35);
  osc.connect(gain);
  gain.connect(sfxGain!);
  osc.start();
  osc.stop(c.currentTime + 0.35);
}

export function playLightning() {
  const c = getCtx(); if (!c) return;
  const bufferSize = c.sampleRate * 0.15;
  const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.3));
  }
  const noise = c.createBufferSource();
  noise.buffer = buffer;
  const gain = c.createGain();
  gain.gain.value = 0.2;
  const filter = c.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.value = 2000;
  noise.connect(filter);
  filter.connect(gain);
  gain.connect(sfxGain!);
  noise.start();
  noise.stop(c.currentTime + 0.15);
}

export function playBossSlam() {
  const c = getCtx(); if (!c) return;
  // Deep boom
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(80, c.currentTime);
  osc.frequency.exponentialRampToValueAtTime(20, c.currentTime + 0.5);
  gain.gain.setValueAtTime(0.4, c.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, c.currentTime + 0.5);
  osc.connect(gain);
  gain.connect(sfxGain!);
  osc.start();
  osc.stop(c.currentTime + 0.5);
  // Crunch noise
  const bufferSize = c.sampleRate * 0.2;
  const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize) * 0.5;
  }
  const noise = c.createBufferSource();
  noise.buffer = buffer;
  const g2 = c.createGain();
  g2.gain.value = 0.2;
  noise.connect(g2);
  g2.connect(sfxGain!);
  noise.start();
  noise.stop(c.currentTime + 0.2);
}

export function playBossSpawn() {
  const c = getCtx(); if (!c) return;
  // Dramatic horn
  const notes = [130, 164, 196, 262]; // C3 E3 G3 C4
  notes.forEach((freq, i) => {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "sawtooth";
    osc.frequency.value = freq;
    const t = c.currentTime + i * 0.2;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.15, t + 0.05);
    gain.gain.setValueAtTime(0.15, t + 0.15);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.4);
    const filter = c.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 1000;
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(sfxGain!);
    osc.start(t);
    osc.stop(t + 0.4);
  });
}

export function playPortal() {
  const c = getCtx(); if (!c) return;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(200, c.currentTime);
  osc.frequency.linearRampToValueAtTime(600, c.currentTime + 0.5);
  osc.frequency.linearRampToValueAtTime(400, c.currentTime + 1.0);
  gain.gain.setValueAtTime(0, c.currentTime);
  gain.gain.linearRampToValueAtTime(0.2, c.currentTime + 0.2);
  gain.gain.setValueAtTime(0.2, c.currentTime + 0.7);
  gain.gain.exponentialRampToValueAtTime(0.01, c.currentTime + 1.2);
  osc.connect(gain);
  gain.connect(sfxGain!);
  osc.start();
  osc.stop(c.currentTime + 1.2);
  // Shimmer
  const osc2 = c.createOscillator();
  const gain2 = c.createGain();
  osc2.type = "triangle";
  osc2.frequency.setValueAtTime(800, c.currentTime);
  osc2.frequency.linearRampToValueAtTime(1600, c.currentTime + 0.8);
  gain2.gain.setValueAtTime(0, c.currentTime);
  gain2.gain.linearRampToValueAtTime(0.08, c.currentTime + 0.1);
  gain2.gain.exponentialRampToValueAtTime(0.01, c.currentTime + 1.0);
  osc2.connect(gain2);
  gain2.connect(sfxGain!);
  osc2.start();
  osc2.stop(c.currentTime + 1.0);
}

export function playSelect() {
  const c = getCtx(); if (!c) return;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(500, c.currentTime);
  osc.frequency.exponentialRampToValueAtTime(700, c.currentTime + 0.06);
  gain.gain.setValueAtTime(0.2, c.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, c.currentTime + 0.08);
  osc.connect(gain);
  gain.connect(sfxGain!);
  osc.start();
  osc.stop(c.currentTime + 0.08);
}

export function playGameOver() {
  const c = getCtx(); if (!c) return;
  const notes = [392, 330, 262, 196]; // G4 E4 C4 G3 - descending
  notes.forEach((freq, i) => {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    const t = c.currentTime + i * 0.25;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.2, t + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.5);
    osc.connect(gain);
    gain.connect(sfxGain!);
    osc.start(t);
    osc.stop(t + 0.5);
  });
}

// ========== MUSIC ==========

// HP intensity: 0 = full HP (calm), 1 = near death (intense)
let musicIntensity = 0;

export function setMusicIntensity(hpRatio: number) {
  // hpRatio: 0-1 (current HP / max HP)
  // intensity: 1 when low HP, 0 when full HP
  musicIntensity = Math.max(0, Math.min(1, 1 - hpRatio));
}

export function startMusic() {
  if (musicPlaying) return;
  const c = getCtx(); if (!c) return;
  musicPlaying = true;

  // Musical scales for different intensity levels
  const calmBass = [65, 73, 82, 65];     // C2 D2 E2 C2 — peaceful
  const tenseBass = [65, 62, 69, 73];     // C2 B1 Db2 D2 — minor/tense
  const calmPad = [262, 294, 330, 262];   // C4 D4 E4 C4
  const tensePad = [262, 277, 311, 262];  // C4 Db4 Eb4 C4 — minor

  function playMeasure(index: number) {
    if (!musicPlaying || !c) return;
    const noteIdx = index % 4;
    const t = c.currentTime;
    const intensity = musicIntensity;

    // Tempo: 4s (calm) → 2.2s (intense) — not too fast
    const measureDuration = 4 - intensity * 1.8;
    const fadeOut = measureDuration * 0.12;

    // Blend between calm and tense notes
    const bassFreq = calmBass[noteIdx] * (1 - intensity) + tenseBass[noteIdx] * intensity;
    const padFreq = calmPad[noteIdx] * (1 - intensity) + tensePad[noteIdx] * intensity;

    // Bass — always sine (no harsh sawtooth), slightly louder at low HP
    const bass = c.createOscillator();
    const bassG = c.createGain();
    bass.type = "sine";
    bass.frequency.value = bassFreq;
    const bassVol = 0.10 + intensity * 0.06;
    bassG.gain.setValueAtTime(bassVol, t);
    bassG.gain.setValueAtTime(bassVol, t + measureDuration - fadeOut);
    bassG.gain.linearRampToValueAtTime(0, t + measureDuration);
    bass.connect(bassG);
    bassG.connect(musicGain!);
    bass.start(t);
    bass.stop(t + measureDuration);
    musicOscillators.push(bass);

    // Pad — gentle, no tremolo spam. Just shifts to minor at high intensity
    const pad = c.createOscillator();
    const padG = c.createGain();
    pad.type = "triangle";
    pad.frequency.value = padFreq;
    const padVol = 0.04 + intensity * 0.03;
    padG.gain.setValueAtTime(0, t);
    padG.gain.linearRampToValueAtTime(padVol, t + measureDuration * 0.2);
    padG.gain.setValueAtTime(padVol, t + measureDuration - fadeOut);
    padG.gain.linearRampToValueAtTime(0, t + measureDuration);
    pad.connect(padG);
    padG.connect(musicGain!);
    pad.start(t);
    pad.stop(t + measureDuration);
    musicOscillators.push(pad);

    // Sub bass — gentle rumble
    const sub = c.createOscillator();
    const subG = c.createGain();
    sub.type = "sine";
    sub.frequency.value = bassFreq / 2;
    const subVol = 0.05 + intensity * 0.04;
    subG.gain.setValueAtTime(subVol, t);
    subG.gain.setValueAtTime(subVol, t + measureDuration - fadeOut);
    subG.gain.linearRampToValueAtTime(0, t + measureDuration);
    sub.connect(subG);
    subG.connect(musicGain!);
    sub.start(t);
    sub.stop(t + measureDuration);
    musicOscillators.push(sub);

    // Soft heartbeat at HP < 25% — double-beat like real heartbeat, not aggressive
    if (intensity > 0.75) {
      const heartbeatPairs = intensity > 0.9 ? 3 : 2;
      const spacing = measureDuration / (heartbeatPairs + 1);
      for (let h = 0; h < heartbeatPairs; h++) {
        const beatStart = spacing * (h + 1);
        // First beat (lub)
        const lub = c.createOscillator();
        const lubG = c.createGain();
        lub.type = "sine";
        lub.frequency.setValueAtTime(55, t + beatStart);
        lub.frequency.exponentialRampToValueAtTime(30, t + beatStart + 0.12);
        lubG.gain.setValueAtTime(0.08, t + beatStart);
        lubG.gain.exponentialRampToValueAtTime(0.001, t + beatStart + 0.18);
        lub.connect(lubG); lubG.connect(musicGain!);
        lub.start(t + beatStart); lub.stop(t + beatStart + 0.2);
        musicOscillators.push(lub);
        // Second beat (dub) — slightly softer, 0.15s later
        const dub = c.createOscillator();
        const dubG = c.createGain();
        dub.type = "sine";
        dub.frequency.setValueAtTime(45, t + beatStart + 0.18);
        dub.frequency.exponentialRampToValueAtTime(25, t + beatStart + 0.3);
        dubG.gain.setValueAtTime(0.05, t + beatStart + 0.18);
        dubG.gain.exponentialRampToValueAtTime(0.001, t + beatStart + 0.35);
        dub.connect(dubG); dubG.connect(musicGain!);
        dub.start(t + beatStart + 0.18); dub.stop(t + beatStart + 0.4);
        musicOscillators.push(dub);
      }
    }

    // Light ticking at medium intensity — subtle, not harsh hi-hat spam
    if (intensity > 0.5) {
      const ticks = intensity > 0.7 ? 4 : 2;
      const tickSpacing = measureDuration / (ticks + 1);
      for (let ti = 0; ti < ticks; ti++) {
        const tickTime = tickSpacing * (ti + 1);
        const tick = c.createOscillator();
        const tickG = c.createGain();
        tick.type = "sine";
        tick.frequency.value = 1200 + intensity * 400;
        tickG.gain.setValueAtTime(0.015, t + tickTime);
        tickG.gain.exponentialRampToValueAtTime(0.001, t + tickTime + 0.04);
        tick.connect(tickG); tickG.connect(musicGain!);
        tick.start(t + tickTime); tick.stop(t + tickTime + 0.06);
        musicOscillators.push(tick);
      }
    }

    setTimeout(() => playMeasure(index + 1), measureDuration * 1000);
  }

  playMeasure(0);
}

export function stopMusic() {
  musicPlaying = false;
  musicIntensity = 0;
  musicOscillators.forEach(o => { try { o.stop(); } catch {} });
  musicOscillators = [];
}

export function setMasterVolume(v: number) {
  if (masterGain) masterGain.gain.value = Math.max(0, Math.min(1, v));
}

export function setSFXVolume(v: number) {
  if (sfxGain) sfxGain.gain.value = Math.max(0, Math.min(1, v));
}

export function playFrostNova() {
  const c = getCtx(); if (!c) return;
  // Icy crystalline burst
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(1200, c.currentTime);
  osc.frequency.exponentialRampToValueAtTime(300, c.currentTime + 0.3);
  gain.gain.setValueAtTime(0.2, c.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, c.currentTime + 0.35);
  const filter = c.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.value = 400;
  osc.connect(filter);
  filter.connect(gain);
  gain.connect(sfxGain!);
  osc.start();
  osc.stop(c.currentTime + 0.35);
  // Shimmer
  const osc2 = c.createOscillator();
  const g2 = c.createGain();
  osc2.type = "triangle";
  osc2.frequency.setValueAtTime(2000, c.currentTime);
  osc2.frequency.exponentialRampToValueAtTime(800, c.currentTime + 0.25);
  g2.gain.setValueAtTime(0.1, c.currentTime);
  g2.gain.exponentialRampToValueAtTime(0.01, c.currentTime + 0.3);
  osc2.connect(g2);
  g2.connect(sfxGain!);
  osc2.start();
  osc2.stop(c.currentTime + 0.3);
}

export function playVoidVortex() {
  const c = getCtx(); if (!c) return;
  // Deep whooshing vortex
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(60, c.currentTime);
  osc.frequency.linearRampToValueAtTime(120, c.currentTime + 0.2);
  osc.frequency.linearRampToValueAtTime(40, c.currentTime + 0.6);
  gain.gain.setValueAtTime(0.15, c.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, c.currentTime + 0.6);
  const filter = c.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 300;
  osc.connect(filter);
  filter.connect(gain);
  gain.connect(sfxGain!);
  osc.start();
  osc.stop(c.currentTime + 0.6);
}

export function playEvolution() {
  const c = getCtx(); if (!c) return;
  // Epic transformation sound
  const notes = [262, 330, 392, 523, 659, 784, 1047];
  notes.forEach((freq, i) => {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    const t = c.currentTime + i * 0.08;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.2, t + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.4);
    osc.connect(gain);
    gain.connect(sfxGain!);
    osc.start(t);
    osc.stop(t + 0.4);
  });
}

export function playBurn() {
  const c = getCtx(); if (!c) return;
  // Subtle sizzle
  const bufferSize = c.sampleRate * 0.08;
  const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.5)) * 0.3;
  }
  const noise = c.createBufferSource();
  noise.buffer = buffer;
  const gain = c.createGain();
  gain.gain.value = 0.05;
  const filter = c.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.value = 3000;
  noise.connect(filter);
  filter.connect(gain);
  gain.connect(sfxGain!);
  noise.start();
  noise.stop(c.currentTime + 0.08);
}

export function playFreeze() {
  const c = getCtx(); if (!c) return;
  // Ice cracking
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = "square";
  osc.frequency.setValueAtTime(800, c.currentTime);
  osc.frequency.exponentialRampToValueAtTime(200, c.currentTime + 0.15);
  gain.gain.setValueAtTime(0.15, c.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, c.currentTime + 0.2);
  osc.connect(gain);
  gain.connect(sfxGain!);
  osc.start();
  osc.stop(c.currentTime + 0.2);
}

export function setMusicVolume(v: number) {
  if (musicGain) musicGain.gain.value = Math.max(0, Math.min(1, v));
}


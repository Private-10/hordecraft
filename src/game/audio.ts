// Procedural audio system using Web Audio API — no external files needed

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let musicGain: GainNode | null = null;
let sfxGain: GainNode | null = null;
let musicPlaying = false;
let musicOscillators: OscillatorNode[] = [];

function getCtx(): AudioContext {
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
}

// ========== SFX ==========

export function playHit() {
  const c = getCtx();
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
  const c = getCtx();
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
  const c = getCtx();
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
  const c = getCtx();
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
  const c = getCtx();
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
  const c = getCtx();
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
  const c = getCtx();
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
  const c = getCtx();
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
  const c = getCtx();
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
  const c = getCtx();
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
  const c = getCtx();
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
  const c = getCtx();
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

export function startMusic() {
  if (musicPlaying) return;
  const c = getCtx();
  musicPlaying = true;

  // Simple ambient loop with layered oscillators
  const bassNotes = [65, 73, 82, 65]; // C2 D2 E2 C2
  const padNotes = [262, 294, 330, 262]; // C4 D4 E4 C4

  function playMeasure(index: number) {
    if (!musicPlaying) return;
    const noteIdx = index % bassNotes.length;
    const t = c.currentTime;

    // Bass drone
    const bass = c.createOscillator();
    const bassG = c.createGain();
    bass.type = "sine";
    bass.frequency.value = bassNotes[noteIdx];
    bassG.gain.setValueAtTime(0.15, t);
    bassG.gain.setValueAtTime(0.15, t + 3.5);
    bassG.gain.linearRampToValueAtTime(0, t + 4);
    bass.connect(bassG);
    bassG.connect(musicGain!);
    bass.start(t);
    bass.stop(t + 4);
    musicOscillators.push(bass);

    // Pad
    const pad = c.createOscillator();
    const padG = c.createGain();
    pad.type = "triangle";
    pad.frequency.value = padNotes[noteIdx];
    padG.gain.setValueAtTime(0, t);
    padG.gain.linearRampToValueAtTime(0.06, t + 0.5);
    padG.gain.setValueAtTime(0.06, t + 3);
    padG.gain.linearRampToValueAtTime(0, t + 4);
    pad.connect(padG);
    padG.connect(musicGain!);
    pad.start(t);
    pad.stop(t + 4);
    musicOscillators.push(pad);

    // Sub
    const sub = c.createOscillator();
    const subG = c.createGain();
    sub.type = "sine";
    sub.frequency.value = bassNotes[noteIdx] / 2;
    subG.gain.setValueAtTime(0.08, t);
    subG.gain.setValueAtTime(0.08, t + 3.5);
    subG.gain.linearRampToValueAtTime(0, t + 4);
    sub.connect(subG);
    subG.connect(musicGain!);
    sub.start(t);
    sub.stop(t + 4);
    musicOscillators.push(sub);

    setTimeout(() => playMeasure(index + 1), 4000);
  }

  playMeasure(0);
}

export function stopMusic() {
  musicPlaying = false;
  musicOscillators.forEach(o => { try { o.stop(); } catch {} });
  musicOscillators = [];
}

export function setMasterVolume(v: number) {
  if (masterGain) masterGain.gain.value = Math.max(0, Math.min(1, v));
}

export function setSFXVolume(v: number) {
  if (sfxGain) sfxGain.gain.value = Math.max(0, Math.min(1, v));
}

export function setMusicVolume(v: number) {
  if (musicGain) musicGain.gain.value = Math.max(0, Math.min(1, v));
}

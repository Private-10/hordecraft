export const PLAYER = {
  baseSpeed: 8,
  sprintMultiplier: 1.6,
  jumpForce: 10,
  gravity: -25,
  slideDuration: 1500,
  slideCooldown: 3000,
  airControl: 0.6,
  radius: 0.5,
  baseHP: 100,
  iFrames: 500, // ms
  height: 1.8,
};

export const CAMERA = {
  distance: 14,
  minDistance: 8,
  maxDistance: 20,
  height: 8,
  lookAhead: 2,
  smoothing: 0.08,
  rotateSpeed: 0.003,
  minPitch: 0.15,
  maxPitch: 1.2,
};

export const ARENA = {
  size: 160,
  halfSize: 80,
};

export const ENEMIES = {
  goblin: { hp: 15, speed: 3.5, damage: 5, xp: 3, radius: 0.4, color: 0x44aa44 },
  slime: { hp: 25, speed: 2, damage: 3, xp: 2, radius: 0.5, color: 0x66cc66 },
  mini_slime: { hp: 10, speed: 3, damage: 2, xp: 1, radius: 0.3, color: 0x88ee88 },
  skeleton: { hp: 30, speed: 3, damage: 10, xp: 8, radius: 0.4, color: 0xccccaa },
  bat: { hp: 10, speed: 6, damage: 4, xp: 4, radius: 0.3, color: 0x8844aa },
  ogre: { hp: 120, speed: 1.8, damage: 25, xp: 20, radius: 0.9, color: 0x886644 },
  spider: { hp: 12, speed: 5, damage: 4, xp: 3, radius: 0.3, color: 0x332222 },
  zombie: { hp: 40, speed: 1.5, damage: 8, xp: 5, radius: 0.5, color: 0x556644 },
  wolf: { hp: 18, speed: 5.5, damage: 7, xp: 4, radius: 0.4, color: 0x666666 },
  // Tier 3
  necromancer: { hp: 60, speed: 3, damage: 15, xp: 25, radius: 0.5, color: 0x663399 },
  troll: { hp: 200, speed: 2.5, damage: 35, xp: 35, radius: 0.8, color: 0x447744 },
  shaman: { hp: 40, speed: 3.5, damage: 8, xp: 30, radius: 0.4, color: 0xaa8833 },
  // Bosses
  stoneGolem: { hp: 800, speed: 1.2, damage: 40, xp: 200, radius: 1.8, color: 0x888888 },
  fireWraith: { hp: 1200, speed: 1.5, damage: 50, xp: 350, radius: 1.5, color: 0xff4400 },
  shadowLord: { hp: 2000, speed: 1.8, damage: 65, xp: 500, radius: 1.6, color: 0x440066 },
};

export const BOSSES = {
  stoneGolem: { spawnMinute: 5, name: "Stone Golem", nametr: "Taş Golem", slamInterval: 4, slamRadius: 6, slamDamage: 30 },
  fireWraith: { spawnMinute: 10, name: "Fire Wraith", nametr: "Ateş Hayaleti", slamInterval: 3, slamRadius: 7, slamDamage: 40 },
  shadowLord: { spawnMinute: 15, name: "Shadow Lord", nametr: "Gölge Lordu", slamInterval: 2.5, slamRadius: 8, slamDamage: 55 },
};

export const WEAPONS = {
  orbitBlade: {
    name: "Orbit Blade",
    icon: "⚔️",
    baseDamage: 12,
    baseSpeed: 1.5, // rotations per second
    baseCount: 2,
    range: 2.5,
  },
  boneToss: {
    name: "Bone Toss",
    icon: "🦴",
    baseDamage: 18,
    fireRate: 1.2, // shots per second
    speed: 15,
    range: 20,
    baseCount: 1,
  },
  shockWave: {
    name: "Shock Wave",
    icon: "🌊",
    baseDamage: 22,
    fireRate: 0.4,
    range: 4,
    knockback: 5,
  },
  lightningArc: {
    name: "Lightning Arc",
    icon: "⚡",
    baseDamage: 28,
    fireRate: 0.5,
    range: 12,
    chainCount: 3,
  },
  fireTrail: {
    name: "Fire Trail",
    icon: "🔥",
    damagePerSecond: 8,
    duration: 3000,
    width: 1.5,
  },
  frostNova: {
    name: "Frost Nova",
    icon: "❄️",
    baseDamage: 15,
    fireRate: 0.25,
    range: 5,
    slowAmount: 0.3,
    slowDuration: 2000,
  },
  voidVortex: {
    name: "Void Vortex",
    icon: "🌀",
    baseDamage: 10,
    fireRate: 0.15,
    range: 6,
    pullForce: 8,
    duration: 3000,
  },
  holySmite: {
    name: "Holy Smite",
    icon: "🌟",
    baseDamage: 25,
    fireRate: 0.33,
    range: 4,
    healAmount: 3,
  },
  shuriken: {
    name: "Shuriken",
    icon: "✦",
    baseDamage: 10,
    fireRate: 2.5,
    speed: 16,
    range: 15,
    baseCount: 1,
    critChance: 0.25,
    hitRadius: 0.6,
  },
  bloodAxe: {
    name: "Blood Axe",
    icon: "🪓",
    baseDamage: 40,
    fireRate: 0.5,
    speed: 10,
    range: 18,
    baseCount: 1,
    lowHpBonusDamage: 0.5,
  },
  soulHarvest: {
    name: "Soul Harvest",
    icon: "👻",
    baseDamage: 35,
    soulsToDetonate: 10,
    range: 8,
    soulCollectRadius: 3,
  },
  arcaneOrb: {
    name: "Arcane Orb",
    icon: "🔮",
    baseDamage: 15,
    fireRate: 0.25,
    speed: 4,
    range: 4.5,
    duration: 6000,
  },
};

export const EVOLUTIONS: Record<string, { weapon: string; passive: string; evolvedName: string; evolvedIcon: string; description: string }> = {
  stormBlade: { weapon: "orbitBlade", passive: "speed", evolvedName: "Storm Blade", evolvedIcon: "⚡⚔️", description: "8 electric blades, 2x speed" },
  deathBarrage: { weapon: "boneToss", passive: "crit", evolvedName: "Death Barrage", evolvedIcon: "💀🦴", description: "Triple bones, all crit" },
  thunderGod: { weapon: "lightningArc", passive: "cooldown", evolvedName: "Thunder God", evolvedIcon: "🌩️", description: "Constant lightning, no cooldown" },
  infernoPath: { weapon: "fireTrail", passive: "damage", evolvedName: "Inferno Path", evolvedIcon: "🌋🔥", description: "Trail explodes, massive damage" },
  absoluteZero: { weapon: "frostNova", passive: "hp", evolvedName: "Absolute Zero", evolvedIcon: "🧊❄️", description: "Freezes all enemies 3s" },
  singularity: { weapon: "voidVortex", passive: "magnet", evolvedName: "Singularity", evolvedIcon: "🕳️🌀", description: "Massive vortex, pulls everything" },
  divineWrath: { weapon: "holySmite", passive: "hp", evolvedName: "Divine Wrath", evolvedIcon: "✝️🌟", description: "Constant light pillars, full heal" },
  phantomBlade: { weapon: "shuriken", passive: "crit", evolvedName: "Phantom Shuriken", evolvedIcon: "👤✦", description: "8-directional shuriken barrage" },
  berserkerFury: { weapon: "bloodAxe", passive: "damage", evolvedName: "Berserker Fury", evolvedIcon: "🩸🪓", description: "Spinning axes, lifesteal" },
  soulStorm: { weapon: "soulHarvest", passive: "cooldown", evolvedName: "Soul Storm", evolvedIcon: "💀👻", description: "Auto-detonate at 5 souls, 2x radius" },
  arcaneNova: { weapon: "arcaneOrb", passive: "speed", evolvedName: "Arcane Nova", evolvedIcon: "💎🔮", description: "3 orbs, explode on expire" },
};

export const XP_TABLE = {
  baseXP: 20,
  scaling: 1.15,
  getRequired: (level: number) => Math.floor(20 * Math.pow(1.15, level)),
};

export const SCORE = {
  timeMultiplier: 10,
  killPoints: 2,
  levelPoints: 50,
  bossPoints: 500,
};

export const MAPS = {
  forest: {
    name: "Enchanted Forest",
    nametr: "Büyülü Orman",
    icon: "🌲",
    unlockCondition: null as string | null,
    unlockConditiontr: null as string | null,
    unlockCost: 0,
    arenaSize: 160,
    groundColor: 0x1a2a1a,
    groundLineColor: 0x2a3a2a,
    skyColor: 0x0a0a1a,
    fogColor: 0x0a0a1a,
  },
  desert: {
    name: "Scorched Desert",
    nametr: "Kavurucu Çöl",
    icon: "🏜️",
    unlockCondition: "Survive 10 min in Forest",
    unlockConditiontr: "Orman'da 10 dk hayatta kal",
    unlockCost: 300,
    arenaSize: 120,
    groundColor: 0x3a2a1a,
    groundLineColor: 0x4a3a2a,
    skyColor: 0x1a0a00,
    fogColor: 0x2a1500,
  },
  volcanic: {
    name: "Volcanic Depths",
    nametr: "Volkanik Derinlikler",
    icon: "🌋",
    unlockCondition: "Survive 15min in Desert + 500G",
    unlockConditiontr: "Çöl haritasında 15dk hayatta kal + 500G",
    unlockCost: 500,
    arenaSize: 120,
    groundColor: 0x2a1515,
    groundLineColor: 0x3a2020,
    skyColor: 0x1a0500,
    fogColor: 0x2a0a00,
  },
  frozen: {
    name: "Frozen Tundra",
    nametr: "Donmuş Tundra",
    icon: "❄️",
    unlockCondition: "Survive 15 min in Volcanic Depths",
    unlockConditiontr: "Volkanik Derinlik'te 15dk hayatta kal",
    unlockCost: 800,
    arenaSize: 150,
    groundColor: 0xddeeff,
    groundLineColor: 0xbbccdd,
    skyColor: 0x223344,
    fogColor: 0x889bcc,
  },
};

export const COLORS = {
  ground: 0x1a2a1a,
  groundLine: 0x2a3a2a,
  sky: 0x0a0a1a,
  fog: 0x0a0a1a,
  xpGem: 0x00d4ff,
  playerBody: 0xff6b35,
  playerHead: 0xffcc99,
  orbBlade: 0xaaddff,
  projectile: 0xffddaa,
  shockwave: 0x6699ff,
  lightning: 0xffff66,
  fire: 0xff4400,
  healthOrb: 0xff3366,
};

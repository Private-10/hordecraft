// Bot name pools and score generation logic

const TURKISH_NAMES = ["Kral", "Yıldırım", "Fırtına", "Gölge", "Aslan", "Kurt", "Şahin", "Kaplan", "Demir", "Alev"];
const ENGLISH_NAMES = ["StormBlade", "NightHawk", "IronFist", "ShadowKing", "DragonSlayer", "PhantomX"];
const ANON_ADJ = ["Brave", "Swift", "Shadow", "Fierce", "Silent", "Wild", "Dark", "Iron", "Storm", "Frost"];
const ANON_NOUN = ["Wolf", "Hawk", "Bear", "Fox", "Raven", "Dragon", "Knight", "Hunter", "Blade", "Ghost"];

export const NAMED_BOTS = [
  "xKralx", "StormBlade99", "GölgeAvcısı", "DragonHunter", "NightWolf42",
  "Yıldırım34", "PhantomX", "KurtAdam55", "ShadowQueen", "AlpSavaşçı",
];

const CHARACTERS = ["knight", "mage", "rogue", "priest", "berserker", "necromancer"];
const CHAR_WEIGHTS = [30, 20, 18, 12, 12, 8]; // knight most common, necromancer rare

function weightedRandom<T>(items: T[], weights: number[]): T {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

function rand(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomAnonName(): string {
  return `${ANON_ADJ[rand(0, ANON_ADJ.length - 1)]}${ANON_NOUN[rand(0, ANON_NOUN.length - 1)]}${rand(1, 999)}`;
}

export function generateBotName(): string {
  const roll = Math.random();
  if (roll < 0.3) {
    // Named bot
    return NAMED_BOTS[rand(0, NAMED_BOTS.length - 1)];
  } else if (roll < 0.5) {
    // Turkish
    const base = TURKISH_NAMES[rand(0, TURKISH_NAMES.length - 1)];
    return Math.random() < 0.5 ? `${base}${rand(1, 99)}` : base;
  } else if (roll < 0.7) {
    // English
    const base = ENGLISH_NAMES[rand(0, ENGLISH_NAMES.length - 1)];
    return Math.random() < 0.5 ? `${base}${rand(1, 99)}` : base;
  } else {
    // Anonymous
    return randomAnonName();
  }
}

export interface BotScore {
  nickname: string;
  score: number;
  kills: number;
  survivalTime: number;
  level: number;
  maxCombo: number;
  character: string;
  map: string;
  date: string;
}

export function generateBotScore(): BotScore {
  const survivalTime = rand(60, 1500);
  const kills = Math.max(1, rand(Math.floor(survivalTime / 3), Math.floor(survivalTime * 2)));
  const maxCombo = rand(5, 200);
  const comboBonus = Math.floor(maxCombo * rand(5, 15));
  const score = kills * 10 + survivalTime * 5 + comboBonus;
  const level = Math.min(50, Math.floor(survivalTime / 30) + rand(-2, 5));
  const character = weightedRandom(CHARACTERS, CHAR_WEIGHTS);
  const map = Math.random() < 0.75 ? "forest" : "desert";
  const nickname = generateBotName();

  return {
    nickname,
    score,
    kills,
    survivalTime,
    level: Math.max(1, level),
    maxCombo,
    character,
    map,
    date: new Date().toISOString(),
  };
}

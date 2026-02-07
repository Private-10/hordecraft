import { t } from "./i18n";

export interface CharacterDef {
  id: string;
  name: () => string;
  icon: string;
  description: () => string;
  color: number;
  // Stat modifiers (multipliers, 1.0 = default)
  hpMult: number;
  speedMult: number;
  damageMult: number;
  xpMult: number;
  cooldownMult: number; // lower = faster
  critChance: number;
  armor: number;
  magnetRange: number;
  startWeapon: string;
}

export const CHARACTERS: CharacterDef[] = [
  {
    id: "knight",
    name: () => t("char.knight"),
    icon: "🗡️",
    description: () => t("char.knight_desc"),
    color: 0x4488cc,
    hpMult: 1.2,
    speedMult: 1.0,
    damageMult: 1.0,
    xpMult: 1.0,
    cooldownMult: 1.0,
    critChance: 0.05,
    armor: 2,
    magnetRange: 3,
    startWeapon: "orbitBlade",
  },
  {
    id: "mage",
    name: () => t("char.mage"),
    icon: "🔮",
    description: () => t("char.mage_desc"),
    color: 0x8844cc,
    hpMult: 0.8,
    speedMult: 1.0,
    damageMult: 1.3,
    xpMult: 1.15,
    cooldownMult: 0.85,
    critChance: 0.1,
    armor: 0,
    magnetRange: 4,
    startWeapon: "lightningArc",
  },
  {
    id: "rogue",
    name: () => t("char.rogue"),
    icon: "🗡️",
    description: () => t("char.rogue_desc"),
    color: 0x44aa44,
    hpMult: 0.9,
    speedMult: 1.25,
    damageMult: 1.1,
    xpMult: 1.0,
    cooldownMult: 0.9,
    critChance: 0.2,
    armor: 0,
    magnetRange: 3,
    startWeapon: "boneToss",
  },
  {
    id: "priest",
    name: () => t("char.priest"),
    icon: "✨",
    description: () => t("char.priest_desc"),
    color: 0xffcc44,
    hpMult: 1.0,
    speedMult: 0.95,
    damageMult: 0.9,
    xpMult: 1.3,
    cooldownMult: 0.95,
    critChance: 0.05,
    armor: 1,
    magnetRange: 5,
    startWeapon: "shockWave",
  },
  {
    id: "berserker",
    name: () => t("char.berserker"),
    icon: "🪓",
    description: () => t("char.berserker_desc"),
    color: 0xcc4444,
    hpMult: 1.5,
    speedMult: 1.1,
    damageMult: 1.4,
    xpMult: 0.85,
    cooldownMult: 1.1,
    critChance: 0.15,
    armor: 0,
    magnetRange: 2,
    startWeapon: "orbitBlade",
  },
  {
    id: "necromancer",
    name: () => t("char.necro"),
    icon: "💀",
    description: () => t("char.necro_desc"),
    color: 0x66cc88,
    hpMult: 0.85,
    speedMult: 1.0,
    damageMult: 1.2,
    xpMult: 1.1,
    cooldownMult: 0.8,
    critChance: 0.08,
    armor: 0,
    magnetRange: 4,
    startWeapon: "fireTrail",
  },
];

export function getCharacter(id: string): CharacterDef {
  return CHARACTERS.find(c => c.id === id) || CHARACTERS[0];
}

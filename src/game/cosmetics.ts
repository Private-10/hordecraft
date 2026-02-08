export interface Skin {
  id: string;
  characterId: string; // which character this skin is for, or "all" for universal
  name: () => string; // i18n function
  description: () => string;
  rarity: "common" | "rare" | "epic" | "legendary";
  colors: {
    primary: number;    // main body color
    secondary: number;  // accent color
    boots: number;
    accessory: number;
  };
  unlockCondition: string; // description
  unlockCost: number; // gold
  icon: string; // emoji
  effect?: "fire" | "ice" | "dark" | "golden" | "rainbow" | "crystal";
}

export const SKINS: Skin[] = [
  // Knight skins
  { id: "knight_golden", characterId: "knight", name: () => "Altın Şövalye", description: () => "Parlayan altın zırh", rarity: "rare", colors: { primary: 0xffd700, secondary: 0xdaa520, boots: 0x8b6914, accessory: 0xffd700 }, unlockCondition: "10 boss öldür", unlockCost: 500, icon: "👑", effect: "golden" },
  { id: "knight_dark", characterId: "knight", name: () => "Kara Şövalye", description: () => "Gece kadar karanlık", rarity: "epic", colors: { primary: 0x1a1a2e, secondary: 0x16213e, boots: 0x0f0f1a, accessory: 0x4a0080 }, unlockCondition: "30dk hayatta kal", unlockCost: 1000, icon: "🖤", effect: "dark" },

  // Mage skins
  { id: "mage_fire", characterId: "mage", name: () => "Ateş Büyücüsü", description: () => "Alevler içinde", rarity: "rare", colors: { primary: 0xff4400, secondary: 0xff6600, boots: 0x8b2500, accessory: 0xff8800 }, unlockCondition: "500 kill tek run", unlockCost: 500, icon: "🔥", effect: "fire" },
  { id: "mage_ice", characterId: "mage", name: () => "Buz Büyücüsü", description: () => "Dondurucu güç", rarity: "epic", colors: { primary: 0x88ccff, secondary: 0x4488ff, boots: 0x2255aa, accessory: 0xaaddff }, unlockCondition: "Level 25 ulaş", unlockCost: 800, icon: "❄️", effect: "ice" },

  // Rogue skins
  { id: "rogue_shadow", characterId: "rogue", name: () => "Gölge Hırsız", description: () => "Karanlıkla bir", rarity: "rare", colors: { primary: 0x2d1b4e, secondary: 0x1a0d2e, boots: 0x110822, accessory: 0x6a0dad }, unlockCondition: "1000 kill tek run", unlockCost: 600, icon: "🌑", effect: "dark" },

  // Berserker skins
  { id: "berserker_blood", characterId: "berserker", name: () => "Kan Berserker", description: () => "Kan kızıl öfke", rarity: "epic", colors: { primary: 0x8b0000, secondary: 0xcc0000, boots: 0x4a0000, accessory: 0xff0000 }, unlockCondition: "2000 kill tek run", unlockCost: 1200, icon: "🩸", effect: "fire" },

  // Universal skins
  { id: "rainbow", characterId: "all", name: () => "Gökkuşağı", description: () => "Tüm renkler", rarity: "legendary", colors: { primary: 0xff0000, secondary: 0x00ff00, boots: 0x0000ff, accessory: 0xffff00 }, unlockCondition: "Tüm karakterleri aç", unlockCost: 3000, icon: "🌈", effect: "rainbow" },
  { id: "crystal", characterId: "all", name: () => "Kristal", description: () => "Parlak kristal zırh", rarity: "legendary", colors: { primary: 0x88ffff, secondary: 0xffffff, boots: 0x44dddd, accessory: 0xccffff }, unlockCondition: "50 toplam run", unlockCost: 5000, icon: "💎", effect: "crystal" },
];

export function getSkinsForCharacter(charId: string): Skin[] {
  return SKINS.filter(s => s.characterId === charId || s.characterId === "all");
}

export function getSkin(skinId: string): Skin | undefined {
  return SKINS.find(s => s.id === skinId);
}

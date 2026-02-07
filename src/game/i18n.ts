export type Lang = "tr" | "en";

const translations = {
  // Menu
  "menu.title": { tr: "HORDECRAFT", en: "HORDECRAFT" },
  "menu.subtitle": { tr: "3D Roguelike Hayatta Kalma", en: "3D Roguelike Survival" },
  "menu.play": { tr: "▶ OYNA", en: "▶ PLAY" },
  "menu.play_guest": { tr: "👤 Misafir Oyna", en: "👤 Play as Guest" },
  "menu.play_registered": { tr: "✨ Kayıtlı Oyna", en: "✨ Play Registered" },
  "menu.nickname_placeholder": { tr: "Takma adını gir...", en: "Enter nickname..." },
  "menu.nickname_hint": { tr: "Sıralamada bu isimle görünürsün", en: "You'll appear with this name on leaderboard" },
  "menu.guest_warning": { tr: "⚠️ Misafir skorları sıralamada 'Anonim' olarak görünür", en: "⚠️ Guest scores appear as 'Anonymous' on leaderboard" },
  "menu.leaderboard": { tr: "🏆 SIRALAMALAR", en: "🏆 LEADERBOARD" },
  "menu.controls": {
    tr: "WASD: Hareket · Mouse: Kamera · Space: Zıpla · Shift: Kay",
    en: "WASD: Move · Mouse: Camera · Space: Jump · Shift: Slide",
  },

  // HUD
  "hud.kills": { tr: "öldürme", en: "kills" },
  "hud.combo": { tr: "kombo", en: "combo" },
  "hud.controls_hint": {
    tr: "WASD: Hareket · Mouse: Kamera · Space: Zıpla · Shift: Kay · Click: Kamera Kilitle",
    en: "WASD: Move · Mouse: Camera · Space: Jump · Shift: Slide · Click: Lock Camera",
  },

  // Level Up
  "levelup.title": { tr: "⬆️ SEVİYE ATLADIN!", en: "⬆️ LEVEL UP!" },
  "levelup.pick": { tr: "Bir geliştirme seç (1/2/3)", en: "Pick an upgrade (1/2/3)" },

  // Game Over
  "gameover.title": { tr: "💀 OYUN BİTTİ", en: "💀 GAME OVER" },
  "gameover.score": { tr: "Skor", en: "Score" },
  "gameover.kill": { tr: "öldürme", en: "kills" },
  "gameover.gold_earned": { tr: "Gold kazanıldı!", en: "Gold earned!" },
  "gameover.retry": { tr: "▶ Tekrar Oyna", en: "▶ Play Again" },
  "gameover.menu": { tr: "🏠 Ana Menü", en: "🏠 Main Menu" },
  "gameover.max_combo": { tr: "maks kombo", en: "max combo" },

  // Upgrades
  "upgrade.new_weapon": { tr: "Yeni silah!", en: "New weapon!" },
  "upgrade.speed": { tr: "Hız+", en: "Speed+" },
  "upgrade.speed_desc": { tr: "+%8 hız", en: "+8% speed" },
  "upgrade.hp": { tr: "Can+", en: "HP+" },
  "upgrade.hp_desc": { tr: "+15 max HP", en: "+15 max HP" },
  "upgrade.damage": { tr: "Hasar+", en: "Damage+" },
  "upgrade.damage_desc": { tr: "+%10 hasar", en: "+10% damage" },
  "upgrade.magnet": { tr: "Mıknatıs+", en: "Magnet+" },
  "upgrade.magnet_desc": { tr: "+%20 çekim", en: "+20% range" },
  "upgrade.crit": { tr: "Kritik+", en: "Crit+" },
  "upgrade.crit_desc": { tr: "+%3 kritik şans", en: "+3% crit chance" },
  "upgrade.armor": { tr: "Zırh+", en: "Armor+" },
  "upgrade.armor_desc": { tr: "+3 zırh", en: "+3 armor" },
  "upgrade.xp": { tr: "XP+", en: "XP+" },
  "upgrade.xp_desc": { tr: "+%10 XP kazanımı", en: "+10% XP gain" },
  "upgrade.cooldown": { tr: "Bekleme-", en: "Cooldown-" },
  "upgrade.cooldown_desc": { tr: "+%5 bekleme azaltma", en: "+5% cooldown reduction" },
  "upgrade.regen": { tr: "Yenilenme+", en: "Regen+" },
  "upgrade.regen_desc": { tr: "+1 HP/sn", en: "+1 HP/sec" },

  // Landing
  "play": { tr: "OYNA", en: "PLAY" },
  "leaderboard": { tr: "SIRALAMA", en: "LEADERBOARD" },
  "survival_description": { tr: "3D Roguelike Hayatta Kalma Oyunu - Düşman hordalarına karşı hayatta kal ve güçlen!", en: "3D Roguelike Survival Game - Survive against enemy hordes and grow stronger!" },
  "characters": { tr: "Karakterler", en: "Characters" },
  "unique_characters": { tr: "benzersiz karakter", en: "unique characters" },
  "weapons": { tr: "Silahlar", en: "Weapons" },
  "powerful_weapons": { tr: "güçlü silah", en: "powerful weapons" },
  "bosses": { tr: "Boss'lar", en: "Bosses" },
  "epic_bosses": { tr: "epik boss", en: "epic bosses" },
  "game_description": { tr: "Düşman dalgalarına karşı hayatta kal · Güçlen · Sıralamada yarış", en: "Survive enemy hordes · Power up · Compete on leaderboard" },
  "controls_info": { tr: "WASD + Mouse · Tarayıcı tabanlı · Ücretsiz", en: "WASD + Mouse · Browser based · Free" },
  "landing.play": { tr: "🎮 OYNA", en: "🎮 PLAY" },
  "landing.desc1": { tr: "Düşman dalgalarına karşı hayatta kal · Güçlen · Sıralamada yarış", en: "Survive enemy hordes · Power up · Compete on leaderboard" },
  "landing.desc2": { tr: "WASD + Mouse · Tarayıcı tabanlı · Ücretsiz", en: "WASD + Mouse · Browser based · Free" },

  // Language
  "lang.tr": { tr: "🇹🇷 Türkçe", en: "🇹🇷 Turkish" },
  "lang.en": { tr: "🇬🇧 İngilizce", en: "🇬🇧 English" },

  // Characters
  "char.knight": { tr: "Şövalye", en: "Knight" },
  "char.knight_desc": { tr: "Dengeli savaşçı. Yüksek HP, zırh bonusu.", en: "Balanced warrior. High HP, armor bonus." },
  "char.mage": { tr: "Büyücü", en: "Mage" },
  "char.mage_desc": { tr: "Güçlü hasar, hızlı bekleme. Kırılgan.", en: "High damage, fast cooldowns. Fragile." },
  "char.rogue": { tr: "Hırsız", en: "Rogue" },
  "char.rogue_desc": { tr: "Hızlı ve kritik vuruşlu. Düşük HP.", en: "Fast with high crit. Low HP." },
  "char.priest": { tr: "Rahip", en: "Priest" },
  "char.priest_desc": { tr: "XP avcısı, geniş mıknatıs. Düşük hasar.", en: "XP hunter, wide magnet. Low damage." },
  "char.berserker": { tr: "Berserker", en: "Berserker" },
  "char.berserker_desc": { tr: "Çılgın hasar ve HP. Yavaş bekleme, az XP.", en: "Insane damage & HP. Slow cooldown, less XP." },
  "char.necro": { tr: "Nekromansır", en: "Necromancer" },
  "char.necro_desc": { tr: "Ateş izi ile başlar. Hızlı bekleme.", en: "Starts with fire trail. Fast cooldowns." },
  "char.select": { tr: "KARAKTER SEÇ", en: "SELECT CHARACTER" },
  "char.stats": { tr: "Özellikler", en: "Stats" },
  "char.hp": { tr: "Can", en: "HP" },
  "char.speed": { tr: "Hız", en: "Speed" },
  "char.damage": { tr: "Hasar", en: "Damage" },
  "char.crit": { tr: "Kritik", en: "Crit" },
} as const;

type TranslationKey = keyof typeof translations;

let currentLang: Lang = "tr";
let initialized = false;

export function setLang(lang: Lang) {
  currentLang = lang;
  if (typeof window !== "undefined") {
    localStorage.setItem("hordecraft_lang", lang);
  }
}

export function getLang(): Lang {
  if (!initialized && typeof window !== "undefined") {
    initialized = true;
    const saved = localStorage.getItem("hordecraft_lang") as Lang | null;
    if (saved === "tr" || saved === "en") {
      currentLang = saved;
    }
  }
  return currentLang;
}

export function t(key: TranslationKey): string;
export function t(lang: Lang, key: TranslationKey): string;
export function t(keyOrLang: TranslationKey | Lang, maybeKey?: TranslationKey): string {
  let key: TranslationKey;
  let lang: Lang;
  
  if (maybeKey) {
    lang = keyOrLang as Lang;
    key = maybeKey;
  } else {
    lang = currentLang;
    key = keyOrLang as TranslationKey;
  }
  
  const entry = translations[key];
  if (!entry) return key;
  return entry[lang] || entry.en || key;
}

export type Lang = "tr" | "en";

const translations = {
  // Menu
  "menu.title": { tr: "HORDECRAFT", en: "HORDECRAFT" },
  "menu.subtitle": { tr: "3D Roguelike Hayatta Kalma", en: "3D Roguelike Survival" },
  "menu.play": { tr: "▶ OYNA", en: "▶ PLAY" },
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
  "landing.play": { tr: "🎮 OYNA", en: "🎮 PLAY" },
  "landing.desc1": { tr: "Düşman dalgalarına karşı hayatta kal · Güçlen · Sıralamada yarış", en: "Survive enemy hordes · Power up · Compete on leaderboard" },
  "landing.desc2": { tr: "WASD + Mouse · Tarayıcı tabanlı · Ücretsiz", en: "WASD + Mouse · Browser based · Free" },

  // Language
  "lang.tr": { tr: "🇹🇷 Türkçe", en: "🇹🇷 Turkish" },
  "lang.en": { tr: "🇬🇧 İngilizce", en: "🇬🇧 English" },
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

export function t(key: TranslationKey): string {
  const entry = translations[key];
  if (!entry) return key;
  return entry[currentLang] || entry.en || key;
}

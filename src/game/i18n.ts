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
  "treant_guardian": { tr: "Treant Muhafız", en: "Treant Guardian" },
  "ancient_oak": { tr: "Kadim Meşe", en: "Ancient Oak" },
  "forest_warden": { tr: "Orman Koruyucu", en: "Forest Warden" },
  "sand_scorpion": { tr: "Kum Akrebi", en: "Sand Scorpion" },
  "desert_colossus": { tr: "Çöl Devi", en: "Desert Colossus" },
  "sandstorm_djinn": { tr: "Kum Fırtınası Cini", en: "Sandstorm Djinn" },
  "magma_slime": { tr: "Magma Balçığı", en: "Magma Slime" },
  "obsidian_golem": { tr: "Obsidyen Golem", en: "Obsidian Golem" },
  "inferno_dragon": { tr: "Cehennem Ejderhası", en: "Inferno Dragon" },
  "frost_wolf_alpha": { tr: "Buz Kurdu Alfa", en: "Frost Wolf Alpha" },
  "ice_golem": { tr: "Buz Golem", en: "Ice Golem" },
  "blizzard_titan": { tr: "Kar Fırtınası Titanı", en: "Blizzard Titan" },
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

  // Frost Nova & Void Vortex
  "upgrade.frostNova": { tr: "+çap, +yavaşlatma", en: "+range, +slow" },
  "upgrade.voidVortex": { tr: "+çap, +çekim gücü", en: "+range, +pull force" },

  // New character-specific weapons
  "upgrade.holySmite": { tr: "+çap, +iyileştirme", en: "+range, +healing" },
  "upgrade.shuriken": { tr: "+shuriken, +kritik şans", en: "+shuriken, +crit chance" },
  "upgrade.bloodAxe": { tr: "+hasar, +can emme", en: "+damage, +lifesteal" },
  "upgrade.soulHarvest": { tr: "+ruh çapı, +patlama hasarı", en: "+soul radius, +blast damage" },
  "upgrade.arcaneOrb": { tr: "+süre, +hasar", en: "+duration, +damage" },

  // Evolutions
  "evolution.stormBlade": { tr: "⚡⚔️ Fırtına Kılıcı — 8 elektrik bıçak, 2x hız", en: "⚡⚔️ Storm Blade — 8 electric blades, 2x speed" },
  "evolution.deathBarrage": { tr: "💀🦴 Ölüm Yağmuru — 3 kemik, hep kritik", en: "💀🦴 Death Barrage — Triple bones, all crit" },
  "evolution.thunderGod": { tr: "🌩️ Gök Tanrısı — Sürekli yıldırım", en: "🌩️ Thunder God — Constant lightning" },
  "evolution.infernoPath": { tr: "🌋🔥 Cehennem Yolu — Patlamalı iz, dev hasar", en: "🌋🔥 Inferno Path — Explosive trail, massive damage" },
  "evolution.absoluteZero": { tr: "🧊❄️ Mutlak Sıfır — Tüm düşmanları dondur", en: "🧊❄️ Absolute Zero — Freezes all enemies" },
  "evolution.singularity": { tr: "🕳️🌀 Tekillik — Dev girdap, her şeyi çeker", en: "🕳️🌀 Singularity — Massive vortex, pulls everything" },
  "evolution.divineWrath": { tr: "✝️🌟 İlahi Gazap — Sürekli ışık sütunları, tam iyileştirme", en: "✝️🌟 Divine Wrath — Constant light pillars, full heal" },
  "evolution.phantomBlade": { tr: "👤🗡️ Hayalet Bıçak — 3'lü hançer, sürekli arkadan vuruş", en: "👤🗡️ Phantom Blade — Triple daggers, always backstab" },
  "evolution.berserkerFury": { tr: "🩸🪓 Berserker Öfkesi — Dönen baltalar, can emme", en: "🩸🪓 Berserker Fury — Spinning axes, lifesteal" },
  "evolution.soulStorm": { tr: "💀👻 Ruh Fırtınası — 5 ruhta otomatik patlama, 2x çap", en: "💀👻 Soul Storm — Auto-detonate at 5 souls, 2x radius" },
  "evolution.arcaneNova": { tr: "💎🔮 Arcane Nova — 3 küre, süresi dolunca patlama", en: "💎🔮 Arcane Nova — 3 orbs, explode on expire" },

  // Meta upgrades
  "meta.hp": { tr: "Kalıcı Can+", en: "Permanent HP+" },
  "meta.damage": { tr: "Kalıcı Hasar+", en: "Permanent Damage+" },
  "meta.speed": { tr: "Kalıcı Hız+", en: "Permanent Speed+" },
  "meta.xp": { tr: "Kalıcı XP+", en: "Permanent XP+" },
  "meta.magnet": { tr: "Kalıcı Mıknatıs+", en: "Permanent Magnet+" },
  "meta.startLevel": { tr: "Başlangıç Seviyesi+", en: "Starting Level+" },
  "meta.extraChoice": { tr: "Ekstra Seçenek", en: "Extra Choice" },

  // Shop
  "shop.title": { tr: "🛒 MAĞAZA", en: "🛒 SHOP" },
  "shop.btn": { tr: "🛒 MAĞAZA", en: "🛒 SHOP" },
  "shop.gold": { tr: "Altın", en: "Gold" },
  "shop.buy": { tr: "SATIN AL", en: "BUY" },
  "shop.maxed": { tr: "MAKS", en: "MAXED" },
  "shop.close": { tr: "✕ KAPAT", en: "✕ CLOSE" },
  "shop.effect.metaHp": { tr: "+5 maks HP / seviye", en: "+5 max HP / level" },
  "shop.effect.metaDamage": { tr: "+%2 hasar / seviye", en: "+2% damage / level" },
  "shop.effect.metaSpeed": { tr: "+%3 hız / seviye", en: "+3% speed / level" },
  "shop.effect.metaXp": { tr: "+%5 XP / seviye", en: "+5% XP / level" },
  "shop.effect.metaMagnet": { tr: "+%10 mıknatıs / seviye", en: "+10% magnet / level" },
  "shop.effect.metaStartLevel": { tr: "Seviye 2/3/4 başla", en: "Start at level 2/3/4" },
  "shop.effect.metaExtraChoice": { tr: "Seviye atlayınca 4. seçenek", en: "4th option on level up" },

  // Unlock conditions
  "unlock.knight": { tr: "Varsayılan karakter", en: "Default character" },
  "unlock.rogue": { tr: "1 oyun tamamla", en: "Complete 1 run" },
  "unlock.mage": { tr: "1 oyunda 100 düşman öldür", en: "Kill 100 enemies in 1 run" },
  "unlock.priest": { tr: "5 oyun tamamla", en: "Complete 5 runs" },
  "unlock.berserker": { tr: "15 dakika hayatta kal", en: "Survive 15 minutes" },
  "unlock.necromancer": { tr: "1 oyunda seviye 20'ye ulaş", en: "Reach level 20 in a run" },
  "unlock.btn": { tr: "🔓 AÇ", en: "🔓 UNLOCK" },
  "unlock.locked": { tr: "🔒 Kilitli", en: "🔒 Locked" },
  "unlock.condition_not_met": { tr: "Koşul karşılanmadı", en: "Condition not met" },

  // Settings
  "settings.title": { tr: "⚙️ AYARLAR", en: "⚙️ SETTINGS" },
  "settings.invertY": { tr: "Mouse Y Ekseni Ters", en: "Invert Mouse Y Axis" },
  "settings.volume": { tr: "Ses Seviyesi", en: "Volume" },
  "settings.close": { tr: "Kapat", en: "Close" },
  "settings.quality": { tr: "Grafik Kalitesi", en: "Graphics Quality" },
  "settings.quality.low": { tr: "Düşük", en: "Low" },
  "settings.quality.medium": { tr: "Orta", en: "Medium" },
  "settings.quality.high": { tr: "Yüksek", en: "High" },

  // Tier 3 enemies
  "enemy.necromancer": { tr: "Nekromansır", en: "Necromancer" },
  "enemy.troll": { tr: "Trol", en: "Troll" },
  "enemy.shaman": { tr: "Şaman", en: "Shaman" },
  "enemy.elite": { tr: "Elit", en: "Elite" },

  // Maps
  "map.forest": { tr: "Büyülü Orman", en: "Enchanted Forest" },
  "map.forest_desc": { tr: "Huzurlu orman arenası", en: "Peaceful forest arena" },
  "map.desert": { tr: "Kavurucu Çöl", en: "Scorched Desert" },
  "map.desert_desc": { tr: "Kum tepeleri ve fırtınalar", en: "Sand dunes and storms" },
  "map.volcanic": { tr: "Volkanik Derinlikler", en: "Volcanic Depths" },
  "map.volcanic_desc": { tr: "Lav havuzları ve meteor yağmuru", en: "Lava pools and meteor showers" },
  "map.select": { tr: "Harita değiştir", en: "Change map" },
  "map.locked": { tr: "🔒 Kilitli", en: "🔒 Locked" },
  "hud.sandstorm": { tr: "⚠️ KUM FIRTINASI!", en: "⚠️ SANDSTORM!" },
  "hud.eruption": { tr: "🌋 VOLKANİK PATLAMA!", en: "🌋 VOLCANIC ERUPTION!" },
  "hud.blizzard": { tr: "❄️ KAR FIRTINASI!", en: "❄️ BLIZZARD!" },
  "hud.blizzard_warning": { tr: "❄️ Kar Fırtınası Geliyor!", en: "❄️ Blizzard Incoming!" },
  "map.frozen": { tr: "Donmuş Tundra", en: "Frozen Tundra" },
  "map.frozen_desc": { tr: "Buz fırtınaları ve kaygan zemin", en: "Ice storms and slippery terrain" },
  "chest.xp": { tr: "+{0} XP!", en: "+{0} XP!" },
  "chest.gold": { tr: "+{0} Gold!", en: "+{0} Gold!" },
  "chest.hp": { tr: "+{0} HP!", en: "+{0} HP!" },

  // Chat
  "chat.title": { tr: "💬 SOHBET", en: "💬 CHAT" },
  "chat.placeholder": { tr: "Mesaj yaz...", en: "Type a message..." },
  "chat.send": { tr: "Gönder", en: "Send" },
  "chat.login_required": { tr: "Sohbet için giriş yap", en: "Login to chat" },
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

# MegaBonk Web — Game Design Document v2.0

> **Proje Türü:** 3D Roguelike Survival (Vampire Survivors-like)
> **Platform:** Web Tarayıcı (Desktop & Mobile)
> **Tech Stack:** Next.js 14 · Three.js (React Three Fiber) · TypeScript · Rapier Physics
> **İlham:** Megabonk (vedinad, 2025) — 1M+ kopya, 117K eşzamanlı oyuncu
> **Hedef Kitle:** Casual-to-midcore oyuncular, tarayıcı oyunu seven kitle
> **Tahmini Geliştirme:** 6-8 hafta (2 kişi: 1 developer + 1 AI co-pilot)

---

## İçindekiler

1. [Vizyon & Hedefler](#1-vizyon--hedefler)
2. [Oyun Konsepti](#2-oyun-konsepti)
3. [Core Gameplay Loop](#3-core-gameplay-loop)
4. [Mekanikler — Detaylı](#4-mekanikler--detaylı)
5. [Düşman Tasarımı](#5-düşman-tasarımı)
6. [Silah & Item Sistemi](#6-silah--item-sistemi)
7. [Karakter Sistemi](#7-karakter-sistemi)
8. [Harita & Level Tasarımı](#8-harita--level-tasarımı)
9. [Progression & Ekonomi](#9-progression--ekonomi)
10. [Leaderboard & Sosyal Sistemler](#10-leaderboard--sosyal-sistemler)
11. [UI/UX Tasarımı](#11-uiux-tasarımı)
12. [Teknik Mimari](#12-teknik-mimari)
13. [Performans Stratejisi](#13-performans-stratejisi)
14. [Ses & Müzik](#14-ses--müzik)
15. [Monetizasyon](#15-monetizasyon)
16. [Analitik & Telemetri](#16-analitik--telemetri)
17. [Deployment & DevOps](#17-deployment--devops)
18. [Geliştirme Yol Haritası](#18-geliştirme-yol-haritası)
19. [Risk Analizi](#19-risk-analizi)
20. [Referanslar](#20-referanslar)

---

## 1. Vizyon & Hedefler

### 1.1 Vizyon
Megabonk'un bağımlılık yapan "bir run daha" döngüsünü tarayıcıya taşımak. İndirme yok, kurulum yok — link aç, oyna. Arkadaşlarınla sıralamada yarış.

### 1.2 Hedefler

| Hedef | Metrik | Başarı Kriteri |
|-------|--------|----------------|
| Retention | D1 Retention | >%30 |
| Engagement | Ortalama session süresi | >15 dakika |
| Virality | Skor paylaşma oranı | >%10 |
| Performance | Desktop FPS | Sabit 60 FPS |
| Performance | Mobil FPS | 30+ FPS |
| Reach | İlk ay aktif oyuncu | 10K+ |

### 1.3 Unique Selling Points
- **Sıfır kurulum** → Link paylaş, hemen oyna
- **Global leaderboard** → Gerçek zamanlı rekabet
- **3D Vampire Survivors** → Tarayıcıda bu kalitede yok
- **Paylaşılabilir skorlar** → Her run sonunda özel link + Open Graph preview

---

## 2. Oyun Konsepti

### 2.1 Elevator Pitch
> "Tarayıcıda oynanan 3D Megabonk. Düşman dalgalarına karşı hayatta kal, güçlen, sıralamada zirveye çık. Link paylaş, arkadaşını geç."

### 2.2 Oyun Akışı
```
[Ana Sayfa] → [Karakter Seç] → [Harita Seç] → [RUN BAŞLA]
     ↑                                              ↓
     │                                    [Hayatta Kal & Güçlen]
     │                                              ↓
     │                                    [Ölüm / Game Over]
     │                                              ↓
     ├──────────────────────────────── [Skor & Leaderboard]
     │                                              ↓
     └──────────────────────────────── [Tekrar Oyna / Paylaş]
```

### 2.3 Oturum Yapısı
- **Ortalama run:** 15-30 dakika
- **Maksimum run:** ~45 dakika (zorluk tavan yapar)
- **Minimum anlamlı run:** 3-5 dakika (yeni oyuncu bile bir şey başarır)
- **Quick restart:** Ölümden yeni run'a <5 saniye

---

## 3. Core Gameplay Loop

### 3.1 Micro Loop (Saniye bazlı)
```
Hareket Et → Pozisyon Al → Otomatik Saldırı → Düşman Ölür → Gem Topla
     ↑                                                          ↓
     └──────────────── Hayatta Kal ←── (repeat) ←──────────────┘
```

### 3.2 Macro Loop (Dakika bazlı)
```
Run Başla → Dalga Hayatta Kal → Level Up → Upgrade Seç → Daha Güçlü Ol
                                                              ↓
                                                    Daha Zor Dalgalar
                                                              ↓
                                                    Boss Dalgası (5 dk)
                                                              ↓
                                                    Ölüm veya Devam
```

### 3.3 Meta Loop (Run'lar arası)
```
Run Bitir → Gold Kazan → Kalıcı Upgrade Al → Yeni Karakter Aç
     ↓                                              ↓
Leaderboard Kontrol → Daha İyi Skor Hedefle → Yeni Run
```

### 3.4 Engagement Hooks
- **"Bir run daha" etkisi:** Run'lar kısa, restart hızlı
- **Skor takıntısı:** "42. sıradayım, 41.'yi geçebilirim"
- **Build keşfi:** "Bu sefer farklı upgrade'ler deneyeyim"
- **Karakter çeşitliliği:** "Ninja ile oynasam nasıl olur?"

---

## 4. Mekanikler — Detaylı

### 4.1 Hareket Sistemi

#### Desktop Kontrolleri
| Tuş | Aksiyon | Detay |
|-----|---------|-------|
| W/A/S/D | Yön | Kameraya göre relatif |
| Space | Zıplama | Havada yön değiştirebilir |
| Shift | Kayma (Slide) | 2sn süre, 4sn cooldown, %50 hız artışı |
| Mouse | Kamera | 3. şahıs, orbital |
| Scroll | Zoom | Min/max sınırlı |

#### Mobil Kontrolleri
| Input | Aksiyon |
|-------|---------|
| Sol sanal joystick | Hareket |
| Sağ yarı ekran sürükleme | Kamera |
| Zıpla butonu | Zıplama |
| Kayma butonu | Slide |
| Çift dokunma | Zoom toggle |

#### Hareket Parametreleri
```typescript
const MOVEMENT = {
  baseSpeed: 6,            // birim/saniye
  sprintMultiplier: 1.5,    // slide sırasında
  jumpForce: 8,             // yukarı kuvvet
  gravity: -20,             // yerçekimi
  slideDuration: 2000,      // ms
  slideCooldown: 4000,      // ms
  airControl: 0.6,          // havada yön kontrolü çarpanı
  acceleration: 15,         // hızlanma
  deceleration: 20,         // yavaşlama
  maxSlopeAngle: 45,        // tırmanılabilir max eğim (derece)
};
```

### 4.2 Kamera Sistemi
- **Tip:** 3. şahıs orbital kamera
- **Varsayılan mesafe:** 12 birim
- **Zoom aralığı:** 8-18 birim
- **Dikey açı sınırı:** -10° ile 75°
- **Çarpışma:** Kamera duvardan geçmez, yakınlaşır
- **Smooth follow:** Lerp ile yumuşak takip (damping: 0.1)
- **Savaş sırasında:** Hafif zoom-out (düşman yoğunluğuna göre)

### 4.3 Savaş Sistemi

#### Otomatik Saldırı Kuralları
- Silahlar **otomatik** ateşlenir, oyuncunun müdahalesi yok
- Her silahın kendi **ateş hızı**, **menzili**, **pattern'i** var
- Birden fazla silah aynı anda aktif olabilir (max 6)
- Silahlar bağımsız çalışır, senkronize değil

#### Hasar Hesaplama
```
Final Hasar = (Baz Hasar × Silah Seviyesi Çarpanı) × (1 + Hasar Bonus%) × Kritik Çarpan
```

#### Kritik Vuruş
- Baz kritik şansı: %5
- Kritik çarpan: ×2
- Upgrade'lerle artırılabilir

#### Hasar Tipleri
| Tip | Özellik |
|-----|---------|
| **Fiziksel** | Standart hasar |
| **Ateş** | 3sn yanma DoT (Damage over Time) |
| **Buz** | %30 yavaşlatma, 2sn |
| **Şimşek** | Yakın düşmana zincir atlama |

### 4.4 Sağlık & Ölüm
- **Baz HP:** 100
- **HP Regen:** Yok (sadece upgrade ile)
- **Damage Flash:** Hasar alınca ekran kırmızı flash
- **Knockback:** Hasar alınca hafif itilme
- **I-Frames:** Hasar sonrası 0.5sn dokunulmazlık
- **Ölüm:** HP 0 → slow-motion → ragdoll → Game Over ekranı (2sn geçiş)

---

## 5. Düşman Tasarımı

### 5.1 Düşman AI Davranış Modelleri

| Model | Davranış | Kullanan Düşmanlar |
|-------|----------|-------------------|
| **Chase** | Direkt oyuncuya yürü | Goblin, Zombie |
| **Swarm** | Grup halinde hareket, sürü zekası | Bat, Spider |
| **Ranged** | Mesafe koru, uzaktan saldır | Necromancer, Archer |
| **Berserker** | Düşük HP'de hızlanır ve güçlenir | Ogre, Troll |
| **Support** | Diğer düşmanları buff'lar / iyileştirir | Shaman |
| **Boss** | Faz bazlı, özel mekanikler | Boss'lar |

### 5.2 Düşman Kataloğu

#### Tier 1 — Erken Oyun (0-5 dk)

**🟢 Goblin**
- HP: 15 | Hız: 4 | Hasar: 5 | XP: 3
- Davranış: Chase, sürü halinde gelir
- Özel: Yok
- Spawn: 3-8'li gruplar

**🟢 Slime**
- HP: 20 | Hız: 2.5 | Hasar: 3 | XP: 2
- Davranış: Chase, yavaş ama dayanıklı
- Özel: Ölünce 2 mini slime'a bölünür
- Spawn: Tekil veya 2-4'lü

#### Tier 2 — Orta Oyun (5-15 dk)

**🟡 Skeleton Archer**
- HP: 25 | Hız: 3 | Hasar: 12 (ok) | XP: 8
- Davranış: Ranged, 15 birim mesafe korur
- Özel: 2sn'de bir ok atar, ok yavaştır (kaçınılabilir)
- Spawn: 2-5'li gruplar

**🟡 Bat Swarm**
- HP: 8 | Hız: 7 | Hasar: 4 | XP: 4
- Davranış: Swarm, uçar (yükseklik engeli yok)
- Özel: Çok hızlı ama çok kırılgan
- Spawn: 10-20'li sürüler

**🟡 Ogre**
- HP: 120 | Hız: 2 | Hasar: 25 | XP: 20
- Davranış: Berserker, HP<%30'da hızı 2x
- Özel: Yere vurma (AoE 3 birim)
- Spawn: Tekil

#### Tier 3 — Geç Oyun (15-30 dk)

**🔴 Necromancer**
- HP: 60 | Hız: 3 | Hasar: 15 (projectile) | XP: 25
- Davranış: Ranged + Support
- Özel: Her 10sn'de 3 iskelet canlandırır, ölü düşmanlardan spawn yapar
- Spawn: Tekil, elit koruma ile

**🔴 Troll**
- HP: 200 | Hız: 2.5 | Hasar: 35 | XP: 35
- Davranış: Berserker
- Özel: 5sn savaş dışı kalırsa HP regen (%5/sn)
- Spawn: Tekil

**🔴 Shaman**
- HP: 40 | Hız: 3.5 | Hasar: 8 | XP: 30
- Davranış: Support, 20 birim içindeki düşmanlara buff
- Özel: Aura — etraftaki düşmanlara +%30 hız, +%20 hasar
- Öncelikli hedef: Öldürülmezse dalgalar çok zorlaşır
- Spawn: Tekil, her zaman grubun arkasında

#### Elit Varyantlar
- Her düşmanın **elit versiyonu** var (2x HP, 1.5x hasar, altın rengi glow)
- %10 spawn şansı (dakika arttıkça artar)
- Elit öldürmek 3x XP + garanti item drop

### 5.3 Boss Tasarımı

Boss'lar **her 5 dakikada** bir gelir. Normal düşmanlar da devam eder.

#### Boss 1 — Stone Golem (5. dakika)
- HP: 800 | Hasar: 40
- **Faz 1 (HP>%50):** Yavaş yürür, yere vurma (AoE), kaya fırlatma
- **Faz 2 (HP<%50):** Zırh kırılır, hızlanır, slam sıklığı artar
- Ölünce: Büyük XP orb + garanti silah upgrade

#### Boss 2 — Shadow Dragon (10. dakika)
- HP: 1500 | Hasar: 55
- **Faz 1:** Uçarak ateş nefesi (çizgi AoE), arada dalış saldırısı
- **Faz 2 (HP<%50):** Yere iner, kuyruk savurma + ateş havuzu bırakma
- Ölünce: Büyük XP + nadir item

#### Boss 3 — Lich King (15. dakika)
- HP: 2500 | Hasar: 70
- **Faz 1:** Teleport + projectile barrage, iskelet ordusu çağırma
- **Faz 2 (HP<%30):** Sürekli necro summon, büyü bombardımanı
- Ölünce: Devasa XP + legendary item seçimi

#### Boss 4+ (20. dk ve sonrası)
- Önceki boss'ların güçlendirilmiş versiyonları (scaling)
- Her seferinde +%50 HP, +%25 hasar

### 5.4 Zorluk Eğrisi (Difficulty Scaling)

```
Dakika:  0    5    10    15    20    25    30    35    40    45
         │    │     │     │     │     │     │     │     │     │
Spawn:   ████ ██████ ████████ ██████████ ████████████ ██████████████
         Kolay  Orta    Zor    Çok Zor   Kabus    Ölüm Duvarı
```

| Dakika | Spawn Hızı | Düşman Tier | Elit % | Boss |
|--------|-----------|-------------|--------|------|
| 0-5 | 1 grup/3sn | Tier 1 | %0 | — |
| 5-10 | 1 grup/2sn | Tier 1-2 | %5 | Stone Golem |
| 10-15 | 1 grup/1.5sn | Tier 2 | %10 | Shadow Dragon |
| 15-20 | 1 grup/1sn | Tier 2-3 | %15 | Lich King |
| 20-30 | 1 grup/0.7sn | Tier 3 | %25 | Scaled Boss |
| 30-40 | 1 grup/0.5sn | Tier 3 Elit | %40 | Double Boss |
| 40+ | Sürekli | Full Elit | %60 | "Ölüm Duvarı" |

---

## 6. Silah & Item Sistemi

### 6.1 Silahlar

Her silahın **5 seviyesi** var. Level up'ta mevcut silahı geliştirme veya yeni silah alma şansı çıkar.

#### Başlangıç Silahları

**⚔️ Orbit Blade**
- Tip: Çevresel
- Baz hasar: 10 | Baz hız: 1 tur/2sn
- Karakterin etrafında dönen bıçaklar
- Seviye artışı: +1 bıçak (max 5), hız artışı
- Sinerji: Fire Trail ile ateşli bıçaklar

**🦴 Bone Toss**
- Tip: Yönlü projectile
- Baz hasar: 15 | Baz hız: 1 atış/1.5sn
- En yakın düşmana kemik fırlatır
- Seviye artışı: +1 projectile, penetrasyon (düşmandan geçme)
- Sinerji: Lightning Arc ile elektrikli kemik

#### Açılabilir Silahlar

**🌊 Shock Wave**
- Tip: AoE (Alan hasarı)
- Baz hasar: 20 | Baz hız: 1 vuruş/3sn
- Yere vurma, etrafta halka şeklinde hasar
- Seviye artışı: Çap artışı, knockback eklenir
- Açılma: 50 kill streak

**🔥 Fire Trail**
- Tip: Alan kontrolü
- Baz hasar: 5/sn (DoT) | Süre: 4sn
- Hareket ederken arkada ateş izi bırakır
- Seviye artışı: İz genişliği, süre, hasar
- Açılma: 10 dakika hayatta kal

**⚡ Lightning Arc**
- Tip: Zincir
- Baz hasar: 25 | Baz hız: 1 atış/2sn
- En yakın düşmana şimşek, 3 düşmana zincir atlar
- Seviye artışı: +1 zincir hedefi, hasar azalması düşer
- Açılma: 3 farklı düşman tipini tek seferde öldür

**❄️ Frost Nova**
- Tip: AoE + CC (Crowd Control)
- Baz hasar: 12 | Baz hız: 1/4sn
- Etrafta buz patlaması, düşmanları yavaşlatır
- Seviye artışı: Dondurma süresi artar, hasar artar
- Açılma: 200 düşmanı bir run'da öldür

**🌀 Void Vortex**
- Tip: Çekim + AoE
- Baz hasar: 8/sn | Çap: 5 birim
- Rastgele konumda kara delik, düşmanları çeker ve hasar verir
- Seviye artışı: Çap, süre, çekim gücü
- Açılma: 1 boss öldür

### 6.2 Pasif Item'lar

Level up'ta silah yerine pasif item de çıkabilir.

| Item | Etki | Max Seviye |
|------|------|-----------|
| **Iron Boots** | +%8 hız /seviye | 5 |
| **Heart Crystal** | +15 max HP /seviye | 5 |
| **Whetstone** | +%10 hasar /seviye | 5 |
| **Magnet Ring** | +%20 XP çekim mesafesi /seviye | 5 |
| **Lucky Clover** | +%3 kritik şans /seviye | 5 |
| **Skull Pendant** | +%5 kritik hasar /seviye | 5 |
| **Armor Shard** | +3 zırh /seviye (flat hasar azaltma) | 5 |
| **Hourglass** | +%5 cooldown azaltma /seviye | 5 |
| **XP Tome** | +%10 XP kazanımı /seviye | 5 |
| **Regeneration Orb** | +1 HP/sn /seviye | 3 |

### 6.3 Sinerji Sistemi (Silah Evrimleri)

Belirli silah + item kombinasyonu max seviyeye ulaşınca → **Evolved Weapon** açılır.

| Silah (Lv5) | Item (Lv5) | Evrim |
|-------------|-----------|-------|
| Orbit Blade | Iron Boots | **Storm Blade** — Bıçaklar hızlanır, elektrik efekti, 8 bıçak |
| Bone Toss | Lucky Clover | **Death Barrage** — Her atış 3 kemik, hepsi crit |
| Lightning Arc | Hourglass | **Thunder God** — Sürekli şimşek yağmuru, cooldown yok |
| Fire Trail | Whetstone | **Inferno Path** — İz patlar, takip eden düşmanlara büyük hasar |
| Frost Nova | Heart Crystal | **Absolute Zero** — Ekrandaki tüm düşmanları 3sn dondurur |
| Void Vortex | Magnet Ring | **Singularity** — Devasa kara delik, tüm düşmanları çeker |

---

## 7. Karakter Sistemi

### 7.1 Karakter Kataloğu

#### 🟢 Başlangıç Karakteri

**⚔️ Knight**
- Başlangıç silahı: Orbit Blade
- Pasif: +%20 max HP
- Playstyle: Tank, yakın dövüş odaklı
- Açılma: Varsayılan

#### 🔓 Açılabilir Karakterler

**🗡️ Rogue**
- Başlangıç silahı: Bone Toss
- Pasif: +%15 hız, slide süresi 2x
- Playstyle: Hızlı, hit-and-run
- Açılma: 1 run tamamla (herhangi bir süre)
- Maliyet: 200 Gold

**🧙 Mage**
- Başlangıç silahı: Frost Nova
- Pasif: +%25 AoE çapı, +%15 alan hasarı
- Playstyle: Crowd control, alan kontrolü
- Açılma: 100 düşmanı tek run'da öldür
- Maliyet: 500 Gold

**💀 Skeleton**
- Başlangıç silahı: Bone Toss
- Pasif: Ölünce 1 kez canlanır (%50 HP ile)
- Playstyle: Agresif, risk/ödül
- Açılma: 5 farklı run tamamla
- Maliyet: 800 Gold

**🗿 Golem**
- Başlangıç silahı: Shock Wave
- Pasif: 20 zırh (flat hasar azaltma), -%20 hız
- Playstyle: Yavaş tank, ortada durur
- Açılma: 15 dakika hayatta kal
- Maliyet: 1000 Gold

**🥷 Ninja**
- Başlangıç silahı: Lightning Arc
- Pasif: XP çekim mesafesi 2x, +%10 kritik şans
- Playstyle: Hızlı level up, kritik odaklı
- Açılma: Lvl 20'ye ulaş bir run'da
- Maliyet: 1500 Gold

### 7.2 Karakter Seçim Ekranı
- 3D model preview (döndürülebilir)
- Stat karşılaştırma bar'ları (HP, Hız, Hasar, Özel)
- Pasif yetenek açıklaması
- Kilitli karakterlerde: açılma koşulu + maliyet gösterimi

---

## 8. Harita & Level Tasarımı

### 8.1 Harita Felsefesi
- Prosedürel arena: Her run farklı layout
- Sınırlı alan: Oyuncu görünmez duvarlarla sınırlı (80x80 birim)
- Dikey oyun: Rampalar, platformlar, tepeler
- Harita tehlikeleri: Ortam hasarı, tuzaklar

### 8.2 Haritalar

#### 🌲 Enchanted Forest (Başlangıç)
- **Arazi:** Düz çim, hafif tepeler, ağaç grupları
- **Yükseklik:** Minimal (0-3 birim)
- **Tehlike:** Yok
- **Atmosfer:** Yeşil, parlak, huzurlu → giderek karanlık
- **Özel:** Ağaçlar kırılabilir (XP verir)
- **Açılma:** Varsayılan

#### 🏜️ Scorched Desert (Orta)
- **Arazi:** Kum tepeleri, kayalıklar, rampalar
- **Yükseklik:** Yoğun (0-8 birim)
- **Tehlike:** Kum fırtınası (her 2 dk, 5sn süre, görüş mesafesi düşer)
- **Atmosfer:** Sıcak, turuncu, toz partikülleri
- **Özel:** Rampalardan kayarak hız kazanma
- **Açılma:** Forest'ta 10 dakika hayatta kal
- **Maliyet:** 300 Gold

#### 🌋 Volcanic Depths (Zor)
- **Arazi:** Obsidyen zemin, lav havuzları, dar köprüler
- **Yükseklik:** Orta (0-5 birim), ama platformlar dar
- **Tehlike:** Lav havuzları (10 hasar/sn), lav fışkırması (rastgele)
- **Atmosfer:** Kırmızı/turuncu ışık, duman, parçacık efektleri
- **Özel:** Lav üstünde geçici platformlar belirir/kaybolur
- **Açılma:** Desert'te 15 dakika hayatta kal
- **Maliyet:** 600 Gold

### 8.3 Prosedürel Oluşturma Kuralları
- Arena **chunk** tabanlı: 10x10 birimlik parçalar birleşir
- Her chunk'ın yükseklik profili ve dekor seti var
- Kenarlar smooth blending ile birleşir
- Spawn noktaları arena kenarlarında
- XP gem'leri düşman ölüm pozisyonunda kalır (30sn sonra kaybolur)

---

## 9. Progression & Ekonomi

### 9.1 Run İçi Progression

#### XP & Level Sistemi
```
Gereken XP = Baz_XP × (1.15 ^ Seviye)
Baz_XP = 20

Seviye 1→2: 20 XP
Seviye 5→6: 40 XP
Seviye 10→11: 81 XP
Seviye 20→21: 328 XP
Seviye 30→31: 1,327 XP
```

#### Level Up Seçenekleri
- 3 rastgele seçenek sunulur
- Olasılık ağırlıkları:

| Seçenek | Ağırlık |
|---------|---------|
| Mevcut silah upgrade | %35 |
| Yeni silah | %20 |
| Pasif item (yeni) | %25 |
| Pasif item (upgrade) | %15 |
| Evrim (koşullar sağlanmışsa) | %5 |

#### Nadir Chest Spawn
- Arenada rastgele **sandık** belirir (altın parıltı)
- İçinden: Rastgele item, bonus XP, veya Gold
- Spawn: Ortalama 1 adet/5dk

### 9.2 Meta Progression

#### Gold Ekonomisi
```
Kazanılan Gold = (Hayatta Kalma Süresi × 2) + (Kill / 10) + Boss Bonus
```

| Kaynak | Gold |
|--------|------|
| Dakika başı | 2 |
| 100 kill | 10 |
| Boss öldürme | 50 |
| Yeni rekor skor | 100 (1 kez) |

#### Kalıcı Upgrade Mağazası

| Upgrade | Seviye | Maliyet | Etki |
|---------|--------|---------|------|
| Max HP+ | 10 | 100-1000 | +5 max HP /seviye |
| Base Damage+ | 10 | 150-1500 | +%2 hasar /seviye |
| Move Speed+ | 5 | 200-1000 | +%3 hız /seviye |
| XP Gain+ | 5 | 250-1250 | +%5 XP kazanımı /seviye |
| Magnet Range+ | 5 | 100-500 | +%10 çekim /seviye |
| Starting Level | 3 | 500-2000 | Lvl 1/2/3 başla |
| Extra Choice | 1 | 3000 | Level up'ta 4. seçenek |

---

## 10. Leaderboard & Sosyal Sistemler

### 10.1 Leaderboard Yapısı

#### Skor Hesaplama
```
Skor = (Hayatta Kalma Süresi(sn) × 10)
     + (Kill Sayısı × 2)
     + (Seviye × 50)
     + (Boss Kill × 500)
     + Combo Bonus
```

#### Combo Sistemi
- 3sn içinde 10+ kill → **Combo başlar**
- Combo sürdükçe çarpan artar: ×1.5, ×2, ×3 (max)
- Combo sırasında kazanılan skor × çarpan
- 3sn kill yoksa combo biter
- En yüksek combo run sonunda bonusa eklenir: `maxCombo × 100`

#### Sıralama Filtreleri
| Filtre | Seçenekler |
|--------|-----------|
| Zaman | Tüm zamanlar · Bu ay · Bu hafta · Bugün |
| Harita | Tümü · Forest · Desert · Volcano |
| Karakter | Tümü · Her karakter ayrı |

#### Leaderboard Entry
```json
{
  "rank": 42,
  "nickname": "AlpDev",
  "score": 45200,
  "survivalTime": 1234,
  "kills": 1847,
  "level": 22,
  "character": "ninja",
  "map": "desert",
  "maxCombo": 87,
  "bossKills": 3,
  "date": "2026-02-07T14:30:00Z"
}
```

### 10.2 Nickname Sistemi
- İlk oyunda nickname sor (3-16 karakter, alfanumerik + _)
- localStorage'da sakla
- Değiştirme: Ayarlardan (günde 1 kez)
- Uygunsuz isim filtresi (basit kelime listesi)

### 10.3 Skor Paylaşma

#### Paylaşılabilir Link
```
https://megabonk-web.vercel.app/score/abc123
```

#### Open Graph Preview (Sosyal medya kartı)
```
┌──────────────────────────────┐
│  🏆 MegaBonk Web             │
│  AlpDev — #42 Sıralama      │
│  Skor: 45,200                │
│  ⏱️ 20:34 | ☠️ 1,847 kill    │
│  🥷 Ninja · 🏜️ Desert        │
│  Onu geçebilir misin?        │
└──────────────────────────────┘
```

#### Paylaşım Butonları
- Kopyala (link)
- Twitter/X
- WhatsApp
- Telegram

### 10.4 Haftalık Turnuva (İleri Aşama)
- Her Pazartesi sıralama sıfırlanır
- Hafta sonu ilk 10'a **özel badge** verilir
- Badge profilde kalıcı görünür

---

## 11. UI/UX Tasarımı

### 11.1 Tasarım Dili
- **Stil:** Semi-flat, oyunsu ama temiz
- **Renkler:** Koyu arka plan (#0a0a0f), neon vurgular
  - Primary: #ff6b35 (turuncu)
  - Secondary: #00d4ff (cyan)
  - Success: #00ff88 (yeşil)
  - Danger: #ff3366 (kırmızı)
  - Gold: #ffd700
- **Font:** Inter (UI), Press Start 2P veya Silkscreen (başlıklar)
- **Animasyonlar:** Framer Motion, yumuşak geçişler

### 11.2 Sayfa Yapısı (Next.js Routes)

```
/                   → Landing page (SSR, SEO)
/play               → Oyun sayfası (client-only)
/leaderboard        → Sıralama tablosu (SSR, paylaşılabilir)
/leaderboard/[map]  → Harita bazlı sıralama
/score/[id]         → Tek skor detay (SSR, OG preview)
/api/scores         → Skor API (POST: kayıt, GET: sorgulama)
/api/scores/[id]    → Tek skor API
```

### 11.3 HUD Layout

```
┌──────────────────────────────────────────────────┐
│ ❤️❤️❤️❤️❤️░░░░░  78/100        ⏱️ 12:34  🏆 #42 │
│                                                  │
│ [🗡️Lv3] [🦴Lv2] [⚡Lv1]                         │
│                                                  │
│                                                  │
│                  3D OYUN ALANI                    │
│                                                  │
│                                                  │
│                              COMBO x2.5! 🔥      │
│ LVL 15  ████████████░░░░  XP                     │
│ ☠️ 1,247 kills              Score: 45,200        │
└──────────────────────────────────────────────────┘
```

### 11.4 Level Up Modal

```
┌──────────────────────────────────────────┐
│              ⬆️ LEVEL UP!                │
│                                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ │
│  │   ⚔️     │ │   ❤️     │ │   ⚡     │ │
│  │  Orbit   │ │  Heart   │ │Lightning │ │
│  │  Blade   │ │ Crystal  │ │   Arc    │ │
│  │  Lv3→4   │ │  NEW!    │ │  Lv1→2   │ │
│  │          │ │          │ │          │ │
│  │ +1 bıçak │ │ +15 HP   │ │ +1 chain │ │
│  │ +%10 hız │ │          │ │ +%10 dmg │ │
│  └──────────┘ └──────────┘ └──────────┘ │
│                                          │
│         Bir upgrade seç (1/2/3)          │
└──────────────────────────────────────────┘
```

### 11.5 Game Over Ekranı

```
┌──────────────────────────────────────────┐
│             💀 GAME OVER                 │
│                                          │
│          Skor: 45,200  🏆 #42            │
│                                          │
│    ⏱️ 20:34    ☠️ 1,847    📊 Lvl 22     │
│    🗡️ 3 Boss   🔥 x87 Max Combo         │
│                                          │
│    +246 Gold kazanıldı! 💰               │
│                                          │
│   [▶ Tekrar Oyna]  [🏠 Ana Menü]        │
│                                          │
│   [🔗 Skoru Paylaş]  [🏆 Sıralama]      │
└──────────────────────────────────────────┘
```

---

## 12. Teknik Mimari

### 12.1 Proje Yapısı

```
megabonk-web/
├── public/
│   ├── models/              # GLTF 3D modeller
│   ├── textures/            # Texture dosyaları
│   ├── sounds/              # Ses efektleri
│   └── og-template.png      # Open Graph şablon
├── src/
│   ├── app/                 # Next.js App Router
│   │   ├── page.tsx         # Landing page
│   │   ├── play/
│   │   │   └── page.tsx     # Oyun sayfası (client-only)
│   │   ├── leaderboard/
│   │   │   ├── page.tsx     # Genel sıralama
│   │   │   └── [map]/
│   │   │       └── page.tsx # Harita bazlı sıralama
│   │   ├── score/
│   │   │   └── [id]/
│   │   │       └── page.tsx # Skor detay + OG
│   │   └── api/
│   │       └── scores/
│   │           ├── route.ts     # POST/GET scores
│   │           └── [id]/
│   │               └── route.ts # GET single score
│   ├── game/                # Oyun motoru (Three.js)
│   │   ├── core/
│   │   │   ├── Engine.ts        # Ana oyun loop
│   │   │   ├── Scene.ts         # Sahne yönetimi
│   │   │   ├── Camera.ts        # Kamera sistemi
│   │   │   ├── Input.ts         # Input yönetimi
│   │   │   ├── Physics.ts       # Rapier wrapper
│   │   │   └── AudioManager.ts  # Ses yönetimi
│   │   ├── entities/
│   │   │   ├── Player.ts        # Oyuncu
│   │   │   ├── Enemy.ts         # Düşman base class
│   │   │   ├── enemies/         # Düşman tipleri
│   │   │   ├── Boss.ts          # Boss base class
│   │   │   ├── Projectile.ts    # Mermi/projectile
│   │   │   └── XPGem.ts         # XP gem'leri
│   │   ├── systems/
│   │   │   ├── WaveSystem.ts    # Dalga yönetimi
│   │   │   ├── CombatSystem.ts  # Savaş & hasar
│   │   │   ├── WeaponSystem.ts  # Silah yönetimi
│   │   │   ├── UpgradeSystem.ts # Upgrade mantığı
│   │   │   ├── ComboSystem.ts   # Combo tracker
│   │   │   ├── ScoreSystem.ts   # Skor hesaplama
│   │   │   └── ParticleSystem.ts# Parçacık efektler
│   │   ├── world/
│   │   │   ├── MapGenerator.ts  # Prosedürel harita
│   │   │   ├── Chunk.ts         # Harita chunk'ları
│   │   │   └── Environment.ts   # Çevre dekor
│   │   ├── ui/
│   │   │   ├── HUD.ts           # Oyun içi HUD (HTML overlay)
│   │   │   ├── LevelUpUI.ts     # Level up seçim
│   │   │   └── GameOverUI.ts    # Oyun sonu
│   │   └── utils/
│   │       ├── ObjectPool.ts    # Object pooling
│   │       ├── MathUtils.ts     # Yardımcı fonksiyonlar
│   │       └── Constants.ts     # Sabitler
│   ├── components/          # React UI bileşenleri
│   │   ├── landing/
│   │   ├── leaderboard/
│   │   ├── character-select/
│   │   └── shared/
│   ├── lib/
│   │   ├── db.ts            # Veritabanı bağlantısı
│   │   ├── score-validator.ts# Skor doğrulama
│   │   └── utils.ts
│   ├── hooks/               # React hooks
│   └── types/               # TypeScript tipleri
├── prisma/                  # Prisma schema (opsiyonel)
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── package.json
└── GDD.md                   # Bu dosya
```

### 12.2 Tech Stack Detayları

| Katman | Teknoloji | Neden |
|--------|-----------|-------|
| Framework | Next.js 14 (App Router) | SSR, API routes, SEO, tek proje |
| 3D Engine | Three.js (vanilla, R3F değil) | Performans kontrolü, oyun loop'u özel |
| Fizik | Rapier WASM (@dimforge/rapier3d) | Hafif, hızlı, WASM tabanlı |
| UI | React + Tailwind CSS | Hızlı geliştirme |
| Animasyon | Framer Motion | UI geçişleri |
| Veritabanı | Supabase (PostgreSQL) | Ücretsiz tier, gerçek zamanlı, SQL |
| ORM | Prisma | Tip güvenli DB sorgular |
| Hosting | Vercel | Next.js native, ücretsiz tier |
| Ses | Howler.js | Web audio, cross-browser |
| Analitik | Vercel Analytics + PostHog | Kullanıcı davranışı |

### 12.3 Oyun Loop Mimarisi

```typescript
// Fixed timestep game loop
const TICK_RATE = 60;
const TICK_MS = 1000 / TICK_RATE;

class Engine {
  private accumulator = 0;

  update(deltaTime: number) {
    this.accumulator += deltaTime;

    // Fizik ve mantık: sabit timestep
    while (this.accumulator >= TICK_MS) {
      this.fixedUpdate(TICK_MS / 1000);
      this.accumulator -= TICK_MS;
    }

    // Render: her frame
    const alpha = this.accumulator / TICK_MS;
    this.render(alpha); // interpolasyon ile smooth render
  }

  private fixedUpdate(dt: number) {
    this.inputSystem.process();
    this.physicsWorld.step();
    this.waveSystem.update(dt);
    this.combatSystem.update(dt);
    this.weaponSystem.update(dt);
    this.comboSystem.update(dt);
    this.scoreSystem.update(dt);
    this.particleSystem.update(dt);
  }

  private render(alpha: number) {
    this.entityRenderer.render(alpha);
    this.particleRenderer.render();
    this.hudRenderer.update();
    this.renderer.render(this.scene, this.camera);
  }
}
```

### 12.4 State Yönetimi

```
Oyun State:
├── GameState (enum: MENU, PLAYING, PAUSED, LEVEL_UP, GAME_OVER)
├── PlayerState (hp, position, velocity, stats, weapons, items)
├── WaveState (currentWave, timer, spawnQueue)
├── ScoreState (score, kills, combo, survivalTime)
└── MetaState (gold, unlockedCharacters, permanentUpgrades)

Depolama:
├── Run içi state → Bellekte (class instances)
├── Meta state → localStorage
├── Leaderboard → Supabase (server)
└── Nickname → localStorage + Supabase
```

---

## 13. Performans Stratejisi

### 13.1 Render Optimizasyonları

| Teknik | Açıklama | Etki |
|--------|----------|------|
| **Instanced Rendering** | Aynı düşman tipi tek draw call | 10x draw call azaltma |
| **Object Pooling** | Düşman/mermi/gem yeniden kullanım | GC baskısı sıfır |
| **LOD (Level of Detail)** | Uzak düşmanlar basit geometri | %40 vertex azaltma |
| **Frustum Culling** | Kamera dışı objeleri çizme | %30-50 render tasarrufu |
| **Texture Atlas** | Tüm düşman texture'ları tek dosyada | Draw call azaltma |

### 13.2 Fizik Optimizasyonları
- Rapier broadphase ile ilk filtreleme
- Düşman-düşman çarpışması **kapalı** (sadece düşman-oyuncu ve düşman-silah)
- Uzak düşmanlar (>30 birim) basitleştirilmiş AI

### 13.3 Bellek Yönetimi
- **Object Pool boyutları:** Düşman: 300, Mermi: 200, Gem: 500, Parçacık: 1000
- Kullanılmayan pool objeleri görünmez (visible = false)
- Texture'lar lazy load, kullanılmayınca dispose

### 13.4 Mobil Optimizasyonlar
- Otomatik kalite algılama (GPU benchmark on load)
- Düşük kalite: Gölge kapalı, parçacık azaltma, düşük çözünürlük
- Touch input debounce

### 13.5 Hedef Metrikler

| Metrik | Desktop | Mobil |
|--------|---------|-------|
| FPS | 60 sabit | 30+ |
| Draw calls | <100 | <50 |
| Ekrandaki düşman | 200+ | 100+ |
| Yükleme süresi | <3sn | <5sn |
| Bundle boyutu | <2MB (initial) | <2MB |
| WASM (Rapier) | ~500KB | ~500KB |

---

## 14. Ses & Müzik

### 14.1 Müzik
- **Ana menü:** Ambient, gizemli (loop)
- **Oyun içi:** Enerjik, tempo oyun ilerledikçe artar
  - 0-10 dk: Orta tempo
  - 10-20 dk: Hızlı tempo
  - 20+ dk: İntens, bass ağırlıklı
- **Boss:** Ayrı boss müziği (epik)
- **Game Over:** Yavaş, melankolik (3sn)

### 14.2 Ses Efektleri
| Olay | Ses |
|------|-----|
| Silah ateşi | Silah bazlı (swoosh, bone crack, thunder) |
| Düşman ölümü | Tip bazlı + XP gem sesi |
| Hasar alma | Darbeli + kalp atışı (düşük HP'de) |
| Level up | Fanfare jingle |
| Combo artışı | Yükselen nota |
| Boss spawn | Borazan + yer sarsıntısı |
| XP gem toplama | Tatmin edici "pling" (pitch artar art arda toplamada) |

### 14.3 Kaynak
- Ücretsiz: freesound.org, kenney.nl
- Müzik: AI-generated veya royalty-free loop'lar

---

## 15. Monetizasyon

### 15.1 Model: Ücretsiz (F2P, reklamsız başla)

#### Faz 1 (Launch)
- Tamamen ücretsiz, reklamsız
- Odak: Oyuncu tabanı büyütme

#### Faz 2 (Eğer traction olursa)
- **Opsiyonel reklam:** "Reklam izle → 2x Gold bu run" butonu (zorunlu değil)
- **Kozmetik mağaza:** Karakter skin'leri (gameplay etkisi yok)
- **Battle Pass (haftalık):** Özel skin + badge + ekstra Gold

### 15.2 Asla Yapılmayacaklar
- ❌ Pay-to-win (parayla güç satma)
- ❌ Zorunlu reklam
- ❌ Oyun içi bekleme süreleri (energy system)

---

## 16. Analitik & Telemetri

### 16.1 Takip Edilecek Eventler

| Event | Veri |
|-------|------|
| game_start | karakter, harita, kalıcı upgrade'ler |
| game_end | skor, süre, ölüm sebebi, kill, seviye |
| level_up | seviye, seçilen upgrade, sunulan seçenekler |
| boss_encounter | boss tipi, sonuç (öldü/öldürdü), süre |
| character_unlock | karakter, harcanan gold |
| share_score | platform (twitter/whatsapp/link) |
| session_duration | toplam site süresi |

### 16.2 KPI Dashboard
- DAU / WAU / MAU
- Ortalama run süresi
- Karakter popülerlik dağılımı
- Level up seçim ısı haritası (hangi upgrade'ler popüler)
- Ölüm dakika dağılımı (zorluk dengesi için)
- Paylaşma → yeni oyuncu dönüşüm oranı

---

## 17. Deployment & DevOps

### 17.1 Ortamlar
| Ortam | URL | Kullanım |
|-------|-----|----------|
| Development | localhost:3000 | Geliştirme |
| Preview | *.vercel.app (PR bazlı) | PR review |
| Production | megabonk-web.vercel.app | Canlı |
| Custom Domain | megabonk.oyunadiburaya.com | İleri aşama |

### 17.2 CI/CD Pipeline
```
Push to main → Vercel auto-deploy → Build → Edge functions → CDN
Push to PR → Preview deployment → Test URL
```

### 17.3 Veritabanı
- Supabase free tier: 500MB, yeterli
- Tablo: scores, players, weekly_rankings
- Row Level Security: Herkes okuyabilir, sadece API yazabilir
- Index: score DESC, created_at DESC, map, character

---

## 18. Geliştirme Yol Haritası

### 🔴 Faz 1 — Foundation (Hafta 1-2)
**Hedef:** Oynanabilir prototip, temel hareket ve savaş

- [ ] Next.js projesi kurulumu (App Router, Tailwind, TypeScript)
- [ ] Three.js entegrasyonu (client-only sayfa)
- [ ] Rapier WASM fizik entegrasyonu
- [ ] Oyun loop (fixed timestep)
- [ ] 3. şahıs kamera sistemi
- [ ] Oyuncu hareketi (WASD + jump + slide)
- [ ] Basit arena (düz zemin + birkaç yükseklik)
- [ ] 1 silah (Orbit Blade) + otomatik saldırı
- [ ] 1 düşman tipi (Goblin) + chase AI
- [ ] XP gem sistemi (drop + toplama + mıknatıs)
- [ ] Temel HUD (HP, süre, kill sayacı)
- [ ] Hasar sistemi (oyuncu ↔ düşman)
- [ ] Ölüm ve restart

### 🟡 Faz 2 — Core Loop (Hafta 3-4)
**Hedef:** Tam oyun döngüsü, level up, çeşitlilik

- [ ] Level up sistemi (XP bar, level up modal)
- [ ] Upgrade sistemi (5 silah + 10 pasif item)
- [ ] Silah seviye sistemi (Lv1-5)
- [ ] 5 düşman tipi (tam katalog)
- [ ] Dalga sistemi (zorluk eğrisi)
- [ ] Boss sistemi (Stone Golem)
- [ ] Combo sistemi
- [ ] Skor hesaplama
- [ ] Object pooling (düşman, mermi, gem)
- [ ] Instanced rendering
- [ ] Game Over ekranı
- [ ] Ana menü (basit)

### 🟢 Faz 3 — Meta & Leaderboard (Hafta 5-6)
**Hedef:** Rekabet sistemi, kalıcılık, paylaşım

- [ ] Supabase entegrasyonu
- [ ] Skor API (POST/GET)
- [ ] Global leaderboard sayfası (SSR)
- [ ] Nickname sistemi
- [ ] Zaman/harita/karakter filtreleri
- [ ] Skor detay sayfası + Open Graph preview
- [ ] Paylaşım butonları
- [ ] Meta progression (Gold + kalıcı upgrade mağazası)
- [ ] 6 karakter (tam katalog)
- [ ] Karakter seçim ekranı
- [ ] localStorage persistence (meta state)
- [ ] Landing page (SSR, SEO)

### 🔵 Faz 4 — Content & Polish (Hafta 7-8)
**Hedef:** İçerik zenginliği, görsel/işitsel polish, mobil

- [ ] 3 harita (Forest, Desert, Volcano)
- [ ] Prosedürel harita oluşturma
- [ ] 2 ek boss (Shadow Dragon, Lich King)
- [ ] Silah evrim sistemi (6 evrim)
- [ ] Parçacık efektleri (hasar, ölüm, level up, combo)
- [ ] Ekran sarsıntısı (screen shake)
- [ ] Ses efektleri + müzik
- [ ] Mobil kontroller (sanal joystick)
- [ ] Responsive UI
- [ ] Performans optimizasyonu (mobil target)
- [ ] Anti-cheat (basit skor doğrulama)
- [ ] Analitik entegrasyonu
- [ ] Final test & bug fix
- [ ] Production deploy

### 🟣 Faz 5 — Post-Launch (Devam eden)
- [ ] Haftalık turnuva sistemi
- [ ] Yeni silahlar & düşmanlar
- [ ] 4. harita
- [ ] Kozmetik sistem
- [ ] Topluluk feedback'i ile balans ayarları
- [ ] itch.io yayını

---

## 19. Risk Analizi

| Risk | Olasılık | Etki | Azaltma |
|------|----------|------|---------|
| Three.js mobilde düşük performans | Orta | Yüksek | LOD, kalite seçenekleri, erken mobil test |
| Rapier WASM yükleme süresi | Düşük | Orta | Lazy load, loading ekranı, CDN cache |
| Leaderboard manipülasyonu | Yüksek | Orta | Server-side doğrulama, rate limiting, anomali tespiti |
| İçerik yetersizliği (2 harita az) | Orta | Orta | Prosedürel çeşitlilik, erken harita ekleme |
| Oyuncu tutma (retention) düşük | Orta | Yüksek | Meta progression derinliği, haftalık turnuvalar |
| Supabase free tier limitleri | Düşük | Düşük | Başlangıç için yeterli, gerekirse upgrade |
| 3D asset üretim zorluğu | Orta | Orta | Low-poly stil, kenney.nl, prosedürel geometri |

---

## 20. Referanslar

### Oyunlar
- **Megabonk** (vedinad) — Ana ilham, 3D VS-like, 1M+ satış
- **Vampire Survivors** (Poncle) — Tür'ün yaratıcısı
- **Survivors.io** — Web tabanlı VS-like referans
- **Brotato** — Karakter çeşitliliği ve build crafting referansı

### Teknik
- [Three.js Documentation](https://threejs.org/docs/)
- [Rapier Physics](https://rapier.rs/)
- [Next.js App Router](https://nextjs.org/docs/app)
- [Supabase](https://supabase.com/docs)
- [Vercel Deployment](https://vercel.com/docs)

### Kaynaklar
- [Kenney Assets](https://kenney.nl/) — Ücretsiz 3D modeller
- [Freesound](https://freesound.org/) — Ses efektleri
- [Mixkit](https://mixkit.co/) — Müzik

---

> **Doküman Versiyonu:** 2.0
> **Son Güncelleme:** 2026-02-07
> **Hazırlayan:** Bilge 🦉 & Alperen Yeşil
> **Durum:** ✅ Tasarım tamamlandı — geliştirmeye hazır

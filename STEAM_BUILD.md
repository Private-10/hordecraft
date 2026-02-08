# HordeCraft - Steam / Desktop Build

## Gereksinimler
- Node.js 18+
- npm

## Kurulum
```bash
npm install
```

## Development Mode
Next.js dev server + Electron penceresi birlikte açılır:
```bash
npm run electron:dev
```

## Production Build
Next.js static export + Electron paketleme:
```bash
npm run electron:build
```
Build çıktısı `dist/` klasöründe oluşur.

## Sadece Pack (test)
```bash
npm run electron:pack
```

## Steam Entegrasyonu
1. `steam_appid.txt` içindeki `480`'i gerçek App ID ile değiştir
2. `npm install steamworks.js` ile SDK'yı kur
3. `electron/steam.cjs` dosyasını güncelle
4. Steamworks partner portalından build yükle

## Steam'e Yükleme
1. Steamworks SDK'yı indir: https://partner.steamgames.com/
2. `SteamPipe` ile build depot oluştur
3. `dist/win-unpacked/` klasörünü depot content olarak ayarla
4. `steamcmd` ile build'i yükle

## Notlar
- Web deploy (`npm run build`) etkilenmez, ayrı çalışır
- `ELECTRON_BUILD=true` environment variable'ı static export'u aktifleştirir
- API routes static export'ta çalışmaz; Electron build'de doğrudan Firebase client SDK kullanılır

# Render Kurulum Rehberi (Kısa)

## 1) Gerekenler
- Repo GitHub'a push edilmiş olmalı.
- Render hesabında GitHub bağlantısı açık olmalı.

## 2) Blueprint ile kurulum
1. Render Dashboard > `New` > `Blueprint`.
2. Bu repoyu seç.
3. Render kökteki `render.yaml` dosyasını otomatik algılar.
4. Oluşacak servisler:
   - `ydownpremium-api` (Free web service, Docker)
   - `ydownpremium-web` (Free static site)

## 3) Zorunlu ortam değişkeni
- `ydownpremium-web` için `VITE_API_BASE_URL` değerini gir:
  - Örnek: `https://ydownpremium-api.onrender.com`
- Kaydet ve deploy et.

## 3.1) YouTube bot doğrulama hatası için zorunlu backend ayarı
Bazı videolarda Render IP'leri bot korumasına takılabilir. Bu durumda backend'e YouTube cookie ver:

- `ydownpremium-api` ortam değişkenleri:
  - `YTDLP_YOUTUBE_EXTRACTOR_ARGS=youtube:player_client=web_safari,android_vr`
  - `YTDLP_COOKIES_B64=<base64_netscape_cookie_txt>`

Notlar:
- `YTDLP_COOKIES_B64`, Netscape formatındaki cookie dosyasının base64 halidir.
- Alternatif olarak doğrudan dosya mount edebiliyorsan `YTDLP_COOKIES_FILE=/absolute/path/cookies.txt` kullanabilirsin.
- Cookie ekledikten sonra mutlaka yeniden deploy et.

## 4) Kontrol
- API sağlık kontrolü: `https://<api-servis-adı>.onrender.com/api/health`
- Frontend açılışı: `https://<web-servis-adı>.onrender.com`
- İndirme akışında metadata ve download endpoint'leri çalışıyorsa kurulum tamam.

## 5) Auto-ping (opsiyonel)
- Backend içinde auto-ping aktiftir (`AUTO_PING_ENABLED=false` yapılmazsa çalışır).
- Varsayılan mantık:
  - Idle timeout: `15 dk`
  - Ping lead: `2 dk`
  - Yani yaklaşık `13. dakikada` kendi `health` endpoint'ine ping atar.
- İsteğe bağlı env ayarları:
  - `AUTO_PING_ENABLED` (`true/false`)
  - `AUTO_PING_IDLE_TIMEOUT_MS`
  - `AUTO_PING_LEAD_MS`
  - `AUTO_PING_CHECK_INTERVAL_MS`
  - `SELF_PING_URL`

## Not
- Free web service 15 dakika boşta kalınca sleep'e geçer; ilk istekte tekrar ayağa kalkması ~1 dakika sürebilir.

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

# TacticalDark — Harita Üretim Notları

Haritaları Blender + yapay zeka ile yeniden üretirken uyulacak kuralların **gerekçeleri**, nokta yerleşiminin
doğrulama sonuçları ve GLB'yi oyuna ekleme adımları. Prompt'ların kendisi: [HARITA_PROMPTLARI.md](HARITA_PROMPTLARI.md).
Eski haritaların koordinat rehberi: [HARITALAR_TEKNIK_REHBERI_AI.md](HARITALAR_TEKNIK_REHBERI_AI.md).

> Kurallar `scenes/world/ImportedMap.gd`, `scenes/weapons/Bullet.gd`, `scenes/weapons/Weapon.gd`,
> `scenes/world/Card.tscn` ve `autoload/GameManager.gd` okunarak çıkarıldı (2026-11-07). Prompt'lar henüz
> Blender'da çalıştırılmadı; yükseklik kuralı koddan türetildi, oyun içinde ayrıca test edilmedi.

---

## 1. Oyunun haritadan beklediği yapı

| Konu | Kural | Kaynak |
|---|---|---|
| Spawn | `SpawnPoints` çocukları **sırasıyla** takım 0-3; her birinin altında 5 Empty. İsim değil sıra kullanılır. | `ImportedMap._snap_points` |
| Kart / kapı | `CardPoints` / `DoorPoints` altındaki Empty'ler aday. `find_child` ile bulunur (kökün altında herhangi bir derinlik). | `ImportedMap._snap_points` |
| Zemine oturtma | Spawn: noktanın 3 m üstünden aşağı ışın. Kart: 0.6 m üstünden. Kapı: 2 m üstünden. Bu yüksekliklerde çarpışmalı geometri (çatı, kiriş) varsa nokta **onun üstüne** oturur. | `_ray_down` |
| Kart alanı | `Card.tscn` Area3D kutusu 1×1×1 m. Kaide yarıçapı ≤ 0.4 m olmalı ki oyuncu karta değebilsin. | `Card.tscn` |
| Kapı | Model çizilmez; oyun kendi çember + ışık sütununu çizer. Kilit yarıçapı `DOOR_UNLOCK_RADIUS` = 3 m (XZ). | `GameManager`, `Door.gd` |
| Adil seçim | Spawn'a 25 m'den yakın kapı adayı, 15 m'den yakın kart adayı elenir (hiç kalmazsa en uzaklar). Çoklu kartta kartlar arası 15 m hedeflenir. | `_fair_points`, `CARD_MIN_SPACING` |
| Güç noktaları / lambalar | GLB'deki gruplar kullanılmaz; yükseklik taramasından otomatik üretilir. Lamba için duvar ≥ 2.4 m olmalı. | `_pick_powerup_points`, `_place_lamps` |
| Oyun alanı | **Tüm mesh'lerin sınır kutusu** (gizli olanlar dahil) = oyun alanı + mini harita + görünmez kenar duvarları. Uzak dekor alanı büyütür. | `_compute_bounds` |
| Zeminsiz hücre | Hiçbir şeye çarpmayan hücre otomatik görünmez duvar olur (sadece oyuncu çarpar, mermi geçer). | `_build_void_walls` |
| Mini harita | 1 m ızgara; komşusundan 1.2 m'den yüksek hücre duvar sayılır. Sabit 200×148 kutuda çizilir → en-boy oranı ~1.35 olan harita basık görünmez. | `_scan_heights`, `_build_minimap` |

### Mesh adına göre davranış (büyük/küçük harf duyarlı)

- **Çarpışmasız:** `Canopy, Needles, Frond, Neon, LED, Holo, CardVisual, Beacon, GlowRing, Water, Pool, Basin, Screen, Glass, Light, Lamp, Horn, Pad_Team`
  - Tuzak: `WaterTower`, `StreetLight_Pole`, `Glass_Wall`, `Lighthouse` gibi katı nesneler de çarpışmasız olur → içinden geçilir.
  - Duvardaki cam pencere `Glass` adıyla boşluk gibi davranır → pencere boşluğu yapılmamalı.
- **Gizlenir:** `CardVisual`, `Pad_Team` (takım bölgeleri işaretlenmesin — kullanıcı kararı).
- **Ağaç tepesi gibi davranır:** `Canopy, Needles, Frond` → çarpışmasız + oyuncuyu kapatınca saydamlaşır. Prompt'larda üstteki her şeye `_Canopy` eki bu yüzden.
- **Hiç saydamlaşmaz:** `Terrain, Floor, Ground, Deck, Plaza, Driveway, Bridge` → sadece zemin benzeri mesh'lerde kullanılmalı.
- **Su:** `Water, Basin` → `water_emission` ve `water_floor` ayarları bu adlara uygulanır.

### Görüş engeli saydamlaştırma
Kameradan yerel oyuncuya ışın atılır, araya giren mesh **bütünüyle** saydamlaşır (0.72). Bu yüzden duvarlar
tek mesh'te birleştirilmemeli: 6–15 m'lik ayrı parçalar. Birleştirilmiş tek bina oyuncu arkasına geçince komple kaybolur.

---

## 2. Yükseklik kuralı (en kritik madde)

`Bullet.initialize` mermi yönünün Y bileşenini sıfırlar → **mermi tam yatay** gider. Namlu ~1.55 m yükseklikte,
oyuncu kapsülü 0–1.8 m.

- Atan, hedeften **d** kadar yüksekteyse mermi hedefin zeminine göre 1.55 + d yüksekliğinde geçer → **d > 0.25 m ise ıskalar.**
- Atan aşağıdaysa mermi 1.55 m'de kalır, yukarıdaki kapsül d…d+1.8 aralığında → d ≤ 1.55 m'ye kadar **vurur.**

Sonuç: yüksekte duran taraf aşağıyı vuramaz ama vurulur; çukurdaki oyuncu yukarıdan vurulamaz ama yukarıyı vurur.
Bu yüzden yeni haritalarda yürünen zemin **Y = -0.25…+0.25** aralığında tutuldu.

Engel sınıfları:
- **0.5–0.95 m:** zıplanır (zıplama tepesi ~1.14 m, otomatik basamak 0.42 m), mermi üstünden geçer.
- **≥ 1.9 m:** mermiyi ve hareketi keser (tam siper).
- **1.0–1.8 m:** hareketi keser ama mermiyi durdurmaz → kafa karıştırıcı, kullanılmamalı.

Ek not: çömelmiş oyuncu normal mermilere zaten bağışık (`Bullet` içinden geçer), alçak siperin oyun değeri sadece rota/zıplamadır.

### Mevcut haritalarda olası sorun
- **Metro:** ray çukuru Y = -0.85 → çukurdaki oyuncu perondakilerden vurulamaz ama onları vurabilir.
- **Liman:** rıhtım 0.94 m → aynı tek yönlü avantaj.

Oyun içinde doğrulanmadı; yeni haritalar bu yüzden tek seviyeli tasarlandı.

---

## 3. Diğer tasarım kararları ve gerekçeleri

| Karar | Gerekçe |
|---|---|
| Üstü açık, çatı yok | Kamera üstten 50°; ayrıca spawn ışını 3 m yukarıdan atıldığı için çatı varsa oyuncu çatıya doğar. Üstteki çarpışmalı geometri yükseklik taramasında "duvar" sayılır, güç noktaları kirişin üstüne düşebilir. |
| En yüksek nesne Y ≤ 9 m | Kamera oyuncunun 14 m üstünde; daha yüksek nesne kameraya girer. |
| Hiçbir mesh alan dışına çıkmaz | Sınır kutusu tüm mesh'lerden hesaplanıyor; dağ/gökyüzü küresi oyun alanını ve mini haritayı büyütür, tarama süresini uzatır. |
| Duvar ≥ 0.4 m kapalı kutu | Trimesh çarpışma arkadan geçirgen olabilir; ince duvarlar mermi ışın taraması ve 1 m ızgara taramasıyla da sorun çıkarmıştı (bkz. PROJE_GECMISI.md madde 34). |
| Koridor ≥ 3.5 m, kapı ≥ 2.2 m | Kapsül çapı 0.7 m + 5v5 kalabalık + üstten nişan; labirent koridoru ~4 m. |
| Görüş hattı ≤ 45 m | Sniper duvardan geçiyor (`pierce_walls`), uzun açık hatlar tek karakteri baskın yapar. |
| Spawn ofseti (±1.7, ±1.7) | 5 nokta 2.4 m yarıçap içinde kalır; kapı 25 m kuralı spawn merkezine değil her noktaya uygulandığı için pay bırakıldı. |
| Kapı çevresi 3.5 m boş | Kilit yarıçapı 3 m + çember görseli. |
| Kaide 0.45 m, yarıçap ≤ 0.4 m | Kart alanı 1×1×1 m; daha geniş kaide oyuncunun karta değmesini engeller. |
| Prosedürel doku yok | Blender glTF dışa aktarıcısı prosedürel düğümleri aktarmaz; düz renk veya bake edilmiş doku. |
| Emission sadece küçük yüzeyde, ≤ 2 | Kuantum haritası "fenere ihtiyaç yok" denecek kadar parlaktı (iki kez kısıldı), Liman suyu tüm haritayı aydınlatıyordu. |
| Işık/kamera yok | Oyun ışığı kendi kurar (otomatik duvar lambaları + el feneri). |
| Takım platformu yok | Kullanıcı kararı: takım bölgeleri işaretli olmasın. Oyun `Pad_Team`'i zaten gizliyor. |
| Bütçe 40-120 bin üçgen, ~500 nesne | Eski haritalar 27-255 bin; menüde iGPU performansı sorun olmuştu. Her mesh ayrı trimesh çarpışma alıyor. |

---

## 4. Nokta yerleşimi doğrulaması

Koordinatlar script ile kontrol edildi (scratchpad, depoya eklenmedi). Ölçütler: kapı-spawn ≥ 27.5 m
(25 + spawn yayılımı 2.5), kart-spawn ≥ 17.5 m, kartlar arası ≥ 12 m, kart-kapı ≥ 8 m, tüm noktalar kenardan ≥ 5 m içeride.

| Harita | Ölçü (m) | Format | Kart / Kapı | Kapı-spawn min | Kart-spawn min | Kart-kart min | Kart-kapı min | Kapı-kapı min |
|---|---|---|---|---|---|---|---|---|
| Çöl Kargo Uçağı Enkazı | 124×92 | 5v5v5v5 | 12 / 12 | 30.1 | 25.6 | 16.1 | 12.8 | 22.0 |
| Karantina Hastanesi | 92×68 | 3v3v3v3 | 12 / 12 | 28.0 | 19.2 | 13.2 | 9.2 | 10.0 |
| Yeraltı Metro İstasyonu | 110×68 | 4v4v4v4 | 12 / 12 | 28.4 | 22.5 | 12.8 | 9.0 | 12.0 |
| Gece Orman Radar Üssü | 112×84 | 4v4v4v4 | 12 / 12 | 30.1 | 29.7 | 12.0 | 12.2 | 16.0 |
| Gece Konteyner Limanı | 124×92 | 5v5v5v5 | 12 / 12 | 28.1 | 19.8 | 14.4 | 8.0 | 17.0 |

**Takım adaleti (her spawn'ın en yakın karta mesafesi):** Çöl, Hastane, Metro, Orman simetrik (dört takım eşit).
Liman simetrik değil (güneyde havuz): kuzey takımları 22.6 m, güney takımları 19.8 m.

**Not:** Kod kart ile kapının birbirine uzaklığını zorlamıyor (rastgele seçiliyor); 8 m alt sınır sadece tasarımda
gözetildi. Kart kapının dibinde doğarsa maç kısa sürebilir — gerekirse `GameManager._spawn_card_and_door`'a kural eklenebilir.

---

## 5. Eski haritalara göre değişenler

- **Hastane:** 2v2 → 3v3, yeni ölçü 92×68 m (eski spawn'lar ±35 m köşelerdeydi). Daha küçük alanda spawn'a 25 m uzak yeterli kapı adayı sığmıyordu.
- **Metro:** 3v3 → 4v4, ray çukuru kaldırıldı (Y -0.85 → -0.2 basamak).
- **Liman:** rıhtım/güverte tek seviyeye indirildi; su yine zeminsiz (oyun görünmez duvarla kapatır).
- **Çöl, Orman:** yerleşim aynı tema, noktalar yeniden hesaplandı; hepsi tek seviye.
- Format düşürülmek istenirse `NetworkManager.MAPS` içinde `max_team` ile yapılır (spawn sayısı zaten 5).

---

## 6. GLB'yi oyuna ekleme

1. GLB'yi `asset model/haritalar/` içine koy. Çöl, Orman ve Liman mevcut dosya adlarını kullanır (eskisini istersen önce yedekle);
   Hastane ve Metro'nun adı değişir:
   - `Map5_Karantina_Hastanesi_3v3v3v3.glb`
   - `Map6_Yeralti_Metro_Istasyonu_4v4v4v4.glb`
2. `autoload/NetworkManager.gd` → `MAPS` satırları:
   - Hastane: `glb` yolu + `max_team: 3`
   - Metro: `glb` yolu + `max_team: 4`
   - Liman: `water_floor: true` olmalı; `water_emission` satırda duruyor (su artık emission'sız üretildiği için gereksiz olabilir).
3. Editörde içe aktarmayı bekle (`.import` oluşur).
4. Kontrol listesi (oyunda):
   - Spawn'lar zemine oturuyor mu, 4 takım doğru köşede mi (test tuşu 7 kart + kapıyı gösterir).
   - Mini harita duvarları doğru mu, harita basık mı.
   - Kenarlardan/sudan dışarı düşülüyor mu.
   - Saydamlaşma tek duvar parçası mı yoksa bütün bina mı.
   - El feneri olmadan harita fazla aydınlık mı (gerekirse `emission_scale` / `lamp_scale`).
   - Yükleme süresi (tarama alanla orantılı; eski haritalarda 1.2–3.6 s).

---

## 7. Açık işler

- Elçilik Kompleksi, Yeraltı Kuantum Labirenti ve Lojistik Depo Labirenti için aynı formatta prompt hazırlanmadı.
- Yükseklik kuralının (bölüm 2) eski Metro/Liman'da oyun içinde doğrulanması.
- Kart-kapı arası en az mesafe kodda yok (bölüm 4 notu).

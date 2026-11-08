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

- **Çarpışmasız:** `Canopy, Needles, Frond, Neon, LED, Holo, CardVisual, Beacon, GlowRing, Water, Pool, Basin, Screen, Glass, Light, Lamp, Horn, Pad_Team, Decal, Scatter, Grass`
  (`Decal, Scatter, Grass` v2 için 2026-11-08'de eklendi; eski 8 GLB'de bu adları taşıyan nesne yok — kontrol edildi.)
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
| Gerçek PBR doku veya bake (v2) | Blender glTF dışa aktarıcısı prosedürel düğümleri aktarmaz. v1 bu yüzden "düz renk" diyordu → sonuç dokusuz/oyuncak gibi çıktı. v2: CC0 fotogrametri dokular (ambientCG, Poly Haven), yoksa prosedürel shader → 2K bake; kahraman nesnelerde eskime katmanları bake. |
| Decal + serpiştirme (v2) | Yükseklik kuralı zemini düz tutuyor; gerçekçilik zemin dokusu, alfa maskeli decal (iz, leke, birikinti) ve küçük kırıntılarla verilir. Bunlar `Decal/Scatter/Grass` adıyla çarpışmasız. Alfa `MASK` (BLEND sıralama sorunu çıkarır). |
| Pürüzlü detay = ayrı nesne (v2) | Her görünür mesh trimesh çarpışma alıyor; gövdeden çıkıntılı kablo/anten görünmez takılma yaratır → `_Canopy`/`_Scatter` adlı ayrı nesne veya ≤ 5 cm. |
| GLTF_SEPARATE dışa aktarım (v2) | Dokulu tek GLB 100 MB'ı aşabilir (GitHub dosya sınırı). Ayrı `.gltf + .bin + textures/` her dosyayı küçük tutar. `ImportedMap` `load_threaded_request` ile `.gltf`'i de PackedScene olarak yükler. |
| Emission sadece küçük yüzeyde, ≤ 2 | Kuantum haritası "fenere ihtiyaç yok" denecek kadar parlaktı (iki kez kısıldı), Liman suyu tüm haritayı aydınlatıyordu. |
| Işık/kamera yok | Oyun ışığı kendi kurar (otomatik duvar lambaları + el feneri). |
| Takım platformu yok | Kullanıcı kararı: takım bölgeleri işaretli olmasın. Oyun `Pad_Team`'i zaten gizliyor. |
| Bütçe 350-700 bin üçgen, ≤ 900 nesne, ≤ 30 malzeme, 2K doku (v2) | v1'deki 40-120 bin aşırı low-poly sonuç verdi. Üstten kamerada ekranda ~25×15 m görünür, frustum culling mesh başına çalışır → 20×20 m parçalara bölmek önemli. iGPU'da menü performansı sorun olmuştu; ilk v2 haritasında FPS ölçülmeli, gerekirse bütçe düşürülür. Her mesh ayrı trimesh çarpışma alıyor (yükleme süresi artar). |

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

1. v2 çıktısı `.gltf + .bin + textures/` klasörüdür. Her haritayı kendi klasörüne koy (ör. `asset model/haritalar/Map3_Col/`),
   böylece doku adları çakışmaz. Eski `.glb` dosyaları silinmeden kalabilir. v2 dosya adları:
   - `Map3_Col_Kargo_Ucagi_Enkazi_5v5v5v5.gltf`, `Map4_Gece_Orman_Radar_Ussu_4v4v4v4.gltf`, `Map8_Gece_Konteyner_Limani_5v5v5v5.gltf`
   - `Map5_Karantina_Hastanesi_3v3v3v3.gltf`, `Map6_Yeralti_Metro_Istasyonu_4v4v4v4.gltf`
2. `autoload/NetworkManager.gd` → `MAPS` satırlarında `glb` yolu yeni `.gltf` dosyasını göstermeli (anahtar adı `glb` kalır). Ayrıca:
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
   - Yükleme süresi (tarama alanla orantılı; eski haritalarda 1.2–3.6 s; v2'de daha çok mesh → trimesh üretimi uzar).
   - FPS (özellikle iGPU) ve el fenerinde normal map'lerin okunması; decal'lerde z-fighting / alfa kenarları.
   - Dokulu çıktıyı commit etmeden önce toplam boyut (GitHub dosya başına 100 MB sınırı; tek dosya büyükse Git LFS).

---

## 7. Bpy ile gerçekçiliğin sınırı

Tamamen Python ile üretilen geometri, iyi dokularla bile el yapımı/fotogrametri asset'lerin seviyesine
tam ulaşmaz (özellikle kaya, ağaç, araç). Sonuç yetmezse önerilen yol **hibrit**: betik yerleşimi, duvarları,
zemini ve noktaları üretir; kahraman nesneler (uçak, araçlar, kayalar, ağaçlar) Poly Haven / Sketchfab CC0 /
satın alınmış asset paketlerinden içe aktarılıp betiğin bıraktığı yer tutuculara (`…_Placeholder` Empty) yerleştirilir.
Godot tarafında da ortam (sis, SSAO, renk düzenleme) ayarı gerçekçiliğe ciddi katkı verir; içe aktarılan haritalarda henüz haritaya özel ortam yok.

---

## 8. Açık işler

- Elçilik Kompleksi, Yeraltı Kuantum Labirenti ve Lojistik Depo Labirenti için aynı formatta prompt hazırlanmadı.
- Yükseklik kuralının (bölüm 2) eski Metro/Liman'da oyun içinde doğrulanması.
- Kart-kapı arası en az mesafe kodda yok (bölüm 4 notu).
- v2 prompt'larıyla ilk harita üretildikten sonra: FPS ölçümü, bütçenin teyidi, gerekirse haritaya özel Godot ortamı.

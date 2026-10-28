# TacticalDark — Proje Geçmişi ve Çalışma Notları (AI devir dosyası)

> **Yeni bir Claude/AI oturumu için:** Bu dosya, önceki sohbetlerde (Ekim 2026) alınan kararları, kullanıcının
> tercihlerini ve çalışma yöntemini taşır. Kod haritası → [../CLAUDE.md](../CLAUDE.md), teknik doküman →
> [../DOKUMANTASYON.md](../DOKUMANTASYON.md), oyun tasarımı → [../OYUN_TASARIM_DOKUMANI.md](../OYUN_TASARIM_DOKUMANI.md).
> Burada yazanlar o anki durumdur; koda dair iddiaları kullanmadan önce koddan doğrula.

---

## 1. Kullanıcı ve çalışma tercihleri

- Kullanıcı **Türkçe** yazar, cevaplar **Türkçe** olmalı.
- Oyunu Godot editöründe kendisi açıp test eder. Editör genelde **açıktır** (bkz. §4.1).
- İstekler genellikle oynanış hissi odaklıdır ("modern olsun", "gerçek hayattaki gibi"). Kullanıcı tasarım kararlarını
  bize bırakır ama sonucu görünce düzeltme ister. Belirsiz oynanış kararlarında (ör. uydunun neyi göstereceği)
  **önce sor**, sonra uygula.
- Geri dönüş örnekleri (kalıcı tercih olarak değerlendir):
  - Oda ayarları panel olarak değil, **sağ üstte ⚙ butonu → küçük modal, bulanık arka plan** olsun.
  - Ayar değişiklikleri **anında uygulanmasın**; taslak → **KAYDET / Kapat** düğmeleri.
  - Karakter seçiminde kamera **yakın** olsun (omuz/yüz görünsün).
  - Bacaklar hareket yönüne dönsün, nişan fareyi takip etsin (geri yürüyünce geri dönmesin).
  - Oyun içi sohbet sadece maç mesajlarını göstersin ve **~4.5 sn sonra sönsün**.
  - Uydu: tüm oyuncuları gösterir, kart/kapıyı GÖSTERMEZ; kart birinin üzerindeyse taşıyıcıyı işaretler.
- Lisansı belirsiz/ticari paketlerden (ör. Unreal "pak" build içinden) asset **çıkarmayı reddettik**. Kullanıcı bunun
  yerine kendi indirdiği Survivalist modelini ve Mixamo animasyonlarını ekledi.

## 2. Kronolojik özellik geçmişi (ne yapıldı)

1. **UI yenileme:** CharacterSelect → MainMenu (oda listesi, nick, oda kur, kodla katıl) → Lobby → HUD. Ortak tema `UITheme`
   (el feneri sarısı vurgu, koyu lacivert yüzeyler).
2. **Kodla katılırken çökme:** Geçersiz oda kodu ENet'e adres olarak gidiyordu → `NetworkManager.is_valid_address` kontrolü.
3. **Sohbet:** lobi + oyun içi, HERKES/TAKIM kanalları, sistem mesajları. **Crosshair** eklendi.
4. **Harita:** `asset model/Maze.obj` labirent olarak entegre edildi (`tools/maze_*.py`). Kart/kapı yalnızca yakına gelince görünür (`ProximityReveal`).
5. **Karakter modeli:** "Military Survivalist" FBX + doku paketi, karaktere göre kıyafet (`SurvivalistModel.OUTFITS`).
   Önceki "skinli karakterler" denemesi kullanıcı isteğiyle geri alındı.
6. **Animasyonlar:** UE Basic Demo Animations (Idle/Walk/Run/CrouchWalk/Death) + Mixamo tüfek klipleri, UE iskeletine bake
   (`tools/build_anim_library.gd`, `tools/retarget_lib.gd`). Üst gövde katmanı, omurga dönüşü, eldeki tüfek.
   Tüfek gövdenin solunda duruyordu (Mixamo AimIdle pozu) → namlu sapmasını ölçüp omurgaya geri besleyen düzeltme.
7. **Hareket:** varsayılan yürüyüş, Shift koşu (dayanıklılık), Ctrl çömelme (en fazla 3 sn, mermiler üstünden geçer).
   Dururken çömelme animasyonu için ayrı `CrouchIdle` klibi.
8. **Özel güçler:** labirent köşelerinde 5–10 sn ömürlü; Bomba, Sağlık, Uydu, Takım uydusu; tek slot, Q ile kullanma.
   Test modu F1–F5.
9. **Duvar lambaları:** sabit / titreyen / ölmekte olan lambalar, ışık huzmesi shader'ı.
10. **Oda sistemi:** host migration (host çıksa da oyun sürer), oda ayarları (harita, 2v2v2v2–5v5v5v5, şifre ekle/kaldır),
    kompakt takım kartları, ana menüde oda durumu/format/harita çipleri, ⚙ modal + taslak mantığı.
11. **Menü/lobi 3D arka planı:** ızgara zemin, fener ve tüfekle devriye gezen 5 asker, fareyi takip eden fener (`MenuBackground3D`).
12. **Dokümanlar:** `DOKUMANTASYON.md` (eski 2D sürümden baştan yazıldı) + `OYUN_TASARIM_DOKUMANI.md` (karakter/harita tasarımcıları için brif).
13. **Efektler + flaş bombası:** sağlıkta yeşil vinyet ve yeşil karakter parıltısı; hasarda miktara göre kırmızı vinyet ve
    herkesin gördüğü kırmızı parıltı; bombada yakınlığa göre kamera sarsıntısı; yeni **Flaş bombası** (hasarsız, görüş
    hattı ve bakış yönüne göre beyaz ekran, atanı ve takımını da etkiler). Test tuşu F6.
    *Not: derleme ve flaş sinyali headless test edildi; oyun içi görsel testi kullanıcı yapacak.*

14. **Host çıkınca hata:** migration sırasında peer null iken `is_host()` → "No multiplayer peer" hatası; `is_host()` artık peer yoksa false.
15. **Başlangıç gücü:** maç başında bir kez karaktere göre güç (Tank/Runner Bomba, Visioner Uydu, Sniper Flaş, Medic Sağlık).
    Medic sağlığı nişan aldığı yaralı takım arkadaşına da verebilir (diğerleri sadece kendine).
16. **XP / yükseltme sistemi (kalıcı profil):** Kullanıcı kararı: **kalıcı** (oyun Steam'de yayınlanacak, oyuncu profili olacak),
    yükseltmeler **karakter başına** (Sniper'ın hızı ≠ Tank'ın hızı), **ölünce korunur**. Uygulama: `scenes/profile/PlayerProfile.gd`
    (yerel `user://profile.cfg`), XP maç içinde yerel kazanılır (`GameManager.gain_xp`), ana menüde sol alttaki operatör kartında
    **PROFİL** butonu → bulanık arka planlı pencere (`UpgradePage.gd`). İlk sürümde oda sekmelerinin yanında "GELİŞTİR" sekmesiydi;
    kullanıcı: "orası oda arayıp oyun oynadığımız yer" → sekmelerden çıkarıldı, adı PROFİL oldu. karakter seçimi yükseltilmiş değerleri gösterir, oyun sonu ekranı kazanılan XP'yi gösterir.
    Ayrıntı ve bekleyen fikirler → §5.

17. **Profil konumu:** sekmeden çıkarıldı → sol alttaki operatör kartında PROFİL butonu + modal. Karakter seçiminde seviye rozeti (SV n, n/25).
18. **UI görsel kimlik yenilemesi "Sodyum & Gece Operasyonu"** ([SANAT_KITABI.md](SANAT_KITABI.md)): soğuk lacivert → grafit zemin,
    sodyum kehribarı vurgu, fosfor bilgi rengi, pah kırılmış köşeler, köşe braketleri, mono sayılar, takım sembolleri (●▲■◆),
    menü katmanına tarama çizgisi + gren. Kullanıcı `.claude/` içine bir "Claude Code Game Studios" şablonundan agent/rule/skill
    indirdi (İngilizce); Türkçe okuma kopyaları `docs/claude_turkce/` altında. Bu şablonun pek çok dosyası projede olmayan
    yapılara (`design/gdd/`, `production/`, `project.yaml`, diğer agent'lar) bağlı — bkz. `docs/claude_turkce/README.md`.

19. **Tam ekran ölçekleme:** project.godot'da stretch kapalıydı → UI tam ekranda küçük kalıp aralar açılıyordu. `UITheme._apply_scaling`
    kodla canvas_items + expand, taban 1152×648 (editör açık olduğundan project.godot yerine kod).
    Kullanıcı: **asıl hedef ekran 1920×1080.** 3D kısımlar (menü arka planı, karakter önizlemeleri) mantıksal boyutta çizilip
    büyütüldüğü için bulanıktı → `SharpViewport.gd` ile gerçek pikselde. Karakter seçimi 648 yüksekliğe sığmıyordu (690) → sıkılaştırıldı.
    Hâlâ "bulanık" denince: kesirli ölçek (×1.67) → root `snap_2d_transforms/vertices_to_pixel`, font `HINTING_NORMAL` +
    `SUBPIXEL_POSITIONING_DISABLED` (UITheme._make_crisp), SharpViewport `TEXTURE_FILTER_NEAREST` (3D önizleme bilinear
    yeniden örnekleniyordu — en belirgin iyileşme bu). Kullanıcının ekranı 1920×1200, Windows ölçeği %100.
    Sonraki iyileştirme önerisi: sentetik kalın (embolden) yerine gerçek kalın font dosyaları (OFL lisanslı, ör. Barlow/Rajdhani).

20. **Başlangıç gücü anında + bildirimsiz:** 2 sn bekleme kaldırıldı — her peer `players` listesinden yerel hesaplar (RPC yok),
    "alındı" bandı gösterilmez ("direkt onlarda doğsun").
21. **Kapı kilidi:** kartı kapıya getirmek artık anında kazandırmaz. Kapı etrafında 3 m çember; taşıyıcı içinde 5 sn kalmalı,
    çıkarsa/ölürse sıfırlanır. Herkesin HUD'ında ilerleme çubuğu (rakiplere DURDUR uyarısı). Test: sahte taşıyıcıyla
    dışarı 0 / içeri 2 sn %40 / çıkınca 0 / toplam 5 sn → oyun biter.
    Fikir (uygulanmadı): rakip çemberdeyse kilit durur ("kontestli bölge"); ilerleme sıfırlanmak yerine yavaşça geri azalır.

22. **Test F7:** kart + kapı konumunu göster (minimap + 3D, sadece yerel, test modunda).
23. **"Yenile" odaları göstermiyordu:** aynı PC'de iki pencere → UDP 7778'i ilk pencere tutuyordu, diğerinin bind'ı sessizce
    başarısızdı; Yenile sadece listeyi yeniden çiziyordu. Çözüm: 7778-7781 port havuzu (host hepsine yayın yapar), başarısız
    bind tekrar denenir, Yenile dinlemeyi baştan kurar + görsel geri bildirim. Test: 2 dinleyici 7778/7779, ikisi de odayı gördü.

24. **UI v2 "Sis & Cam" (BF1 referansı):** kullanıcı kararları — vurgu "beyaz ana, kehribar az"; tüm ekranlar; **font şimdilik
    aynı, sonra düşünülecek (NOT ET)**. Saydam cam paneller, beyaz kenar/braket, beyaz sekmeler, cam düğmeler, küçük pah.
    Sis: ana menü/lobi (hacimsel sis + süzülen duman katmanı) + karakter seçimi duman katmanı; oyun içi **SİS BOMBASI** gücü
    (kullanıcı: "oyun içerisinde sis özel güç olarak alabilelim"). SANAT_KITABI.md v2'ye güncellendi.

25. **Sis bombası oyunu kasıp oyuncuyu attı:** aşırı overdraw (110 piksel-başı-ışıklı yarı saydam puf + proximity fade) +
    ilk kullanımda doku üretimi. Düzeltme: 34 büyük puf, köşe başı ışık, fade yok, doku önceden; ENet timeout 15-30 s.
    Ölçüm (1920×1080, 4 fener + 6 lamba): dumansız 178, 1 bulut 160, 2 bulut 141 FPS. Yeni görsel efektlerde iGPU'yu düşün,
    FPS'i `scratchpad` benzeri bir ölçüm betiğiyle doğrula.

26. **"F8'e basınca oyun kapandı":** çökme değil — Godot 4.4+ oyunu editörün içinde (Game sekmesi) çalıştırıyor ve **F8 = editörün
    "projeyi durdur" kısayolu**. Önceki "sis atınca oyundan attı" da büyük ihtimalle buydu. Test tuşları rakamlara taşındı
    (1-8). KURAL: oyun içi tuşlara F1/F5/F6/F7/F8 (ve F9-F12 debugger) atama.

27. **Sis bombası CS:GO tarzı:** kullanıcı "kare kare görünüyor, daha gerçekçi ve şiddetli olsun" → parçacıklar yerine hacimsel
    sis (FogVolume): opak, kenarsız, fener içinde saçılır; yarıçap 6 m, 15 sn. Hacimsel sis sadece duman varken açık.
    Detay sınırı: Godot froxel çözünürlüğü (project setting `rendering/environment/volumetric_fog/volume_size`, varsayılan 64) —
    artırılırsa daha kabarık kenar ama daha pahalı.

28. **İki pencereyle ana menüde ~1 dk sonra donma:** menü 3D arka planı pahalıydı (1080p iGPU tek pencere 73 FPS; arka plan
    kapalı 589). İki pencere = GPU tam yük + ısınma (ölçümler de ısındıkça düşüyor). Düzeltme: arka plan `RENDER_SCALE` 0.6
    (bilinear; FSR/FXAA bu GPU'da daha pahalı çıktı), MSAA kapalı, menüde hacimsel sis kapalı (`FOG_DENSITY` 0), asker fener
    gölgeleri kapalı, MenuOverlay fbm 4→3 oktav + 2. katman tek oktav, **odakta olmayan pencere 30 FPS** (NetworkManager
    `_notification`). Sonuç: tam menü ~73 → ~160 FPS (soğukken). Not: FPS ölçümlerini GPU soğukken ve art arda karşılaştırarak yap.

29. **Ayarlar ekranı:** GRAFİK (kalite profili, ekran modu, çözünürlük, VSync, FPS sınırı, 3D çözünürlük ölçeği, kenar
    yumuşatma, gölgeler, menü 3D arka planı, arayüz ölçeği), KONTROLLER (fare hassasiyeti — sanal nişangahla gerçekten
    çalışır, ekran sarsıntısı, tuş listesi), SES (4 kanal; oyunda henüz ses yok), OYUN (FPS göster). Ana menü + ESC menüsü.
    Bekleyen: tuş atama, renk körü modu, ses dosyaları.

30. **4 yeni harita** (Elçilik Kompleksi 3v3, Yeraltı Kuantum Labirenti 5v5, Çöl Kargo Uçağı Enkazı 5v5, Gece Orman Radar Üssü 4v4)
    — `ImportedMap.gd`. Kullanıcı kararları: takım boyutu haritanın ÜST SINIRI; otomatik duvar lambaları; yakındaki ağaç
    saydamlaşır; kapı tabelaları hepsi aynı (ipucu vermez). Rehberle farklar: WallLamps/PowerupPoints boş (üretiliyor),
    Harita 1/3'te kart kaidesi/kapı tabelası YOK (rehber var diyor), Pad_Team çarpışma almalı, 12 örnek kart modeli gizlenmeli.
    Bekleyen: haritalara özel ortam (glow ile neon parlaması, renk tonu), minimap kare haritalarda hafif basık (200×148 sabit).

## 3. Açık işler / fikirler (kullanıcı henüz istemedi, önerildi)

- Flaşın sadece düşmanları etkilemesi istenirse: `PowerupManager._on_bomb_exploded` içine takım kontrolü (tek satır).
- Lobide paneller arka planı çoğunlukla kapatıyor; istenirse paneller daha saydam yapılabilir.
- `scenes/ui/MenuBackdrop.gdshader` artık kullanılmıyor, silinebilir.
- Tasarım dokümanındaki **[ÖNERİ]**ler kesin değil: poligon limitleri, Medic iyileştirme yeteneği, takım şeridinin parlaması, yeni haritalar.
- Henüz yok: ses, karaktere özel modeller/silahlar, ikinci harita, internet üzerinden oyun (NAT/relay).

## 4. Çalışma yöntemi ve tuzaklar

### 4.1 `project.godot`'yu elle düzenleme
Editör açıkken `project.godot`'ya autoload eklemek işe yaramadı: editör dosyayı sadece açılışta okuyor ve kaydederken
kendi kopyasını geri yazıyor. Sonuç "Identifier UITheme not declared" hatası oldu.
→ Yeni autoload yerine **`class_name` + statik fonksiyon** ya da `preload` kullan. Şart ise kullanıcıdan editörü
kapatmasını veya Project Settings'ten kendisinin eklemesini iste.

### 4.2 Komut satırından test (Windows)
- Eski makinede Godot 4.7: `C:\Users\Emre Erkan\Downloads\Godot\Godot.exe` (PATH'te değil). **Yeni sistemde yol farklı olabilir.**
- Gerçek projede SceneTree test betiği çalıştırma: `Godot.exe --headless --path . --script <mutlak yol>.gd`
  - Bu betiklerde autoload adları derleme anında yok → `get_root().get_node("NetworkManager")` kullan. `multiplayer` yerine
    `get_multiplayer()`; kurulumu `call_deferred` ile ertele; `_process` içinde `await` yok.
  - `--check-only` autoload'lu betiklerde yanlış hata verir; derleme kontrolü için betik içinden `load(path).can_instantiate()`.
  - Headless'te kareler çok hızlı akar; zamana bağlı testlerde `await create_timer(t).timeout` kullan.
- Ekran görüntüsü için `--headless`'ı kaldır, birkaç kare sonra `get_root().get_texture().get_image().save_png(...)`.
- Yeni `class_name` betikleri editör yeniden tarayana kadar global cache'te yok → `preload` et.
- Ağ / host migration testi: 3 süreç (host + 2 client, 127.0.0.1), çıktılar `-RedirectStandardOutput` ile.
  Aynı makinedeki süreçler arasında UDP yayın keşfi çalışmıyor; migration bu yüzden doğrudan peer IP'si kullanıyor.
- Asset denemelerini kullanıcının açık editörünü bozmamak için ayrı bir geçici projede yap.

### 4.3 Godot tuzakları (bu projede yaşandı)
`CLAUDE.md` sonundaki listeye ek olarak:
- `set_anchors_preset` ofsetleri koruyabilir, Control boyutu 0 kalır → `set_anchors_and_offsets_preset`.
- Birden fazla SubViewport önizlemesinde `own_world_3d = true`, yoksa hepsi aynı dünyayı paylaşır.
- Container'lar çocukların scale'ini sıfırlar.
- `AnimationPlayer.speed_scale = 0` geçişi de dondurur.
- Kamera physics interpolation açık: dönüşü `_physics_process`'te değiştir.
- `Button.set_pressed_no_signal` ButtonGroup'taki diğer butonları kapatmıyor — sekmeleri kodla değiştirirken hepsini elle ayarla.

## 5. XP / profil sistemi — kurallar ve FİKİR HAVUZU (kullanıcı: "bu fikirleri daima not et")

### 5.1 Şu an uygulanan (Ekim 2026)
- **Tek XP havuzu**, oyuncu hangi karaktere harcayacağını seçer. **Yükseltmeler karakter başına.**
- 5 stat × en fazla 5 seviye (karakter başı 25 yükseltme): Can +%5, Hız +%3, Hasar +%4, Silah (şarjör %4 hızlı, atış aralığı %3 kısa),
  Dayanıklılık (koşu/çömelme süresi) +%10 — seviye başına.
- **Fiyat:** `150 × 1.18 ^ (o karakterin aldığı yükseltme sayısı)`, 5'e yuvarlı → 150, 175, 210, 245, … 785 (11.), 7965 (25.).
  Bir karakteri fullemek ~51.400 XP. (İlk önerideki 1.45 büyüme kalıcı sistem için fazla sertti; kalıcıya göre 1.18'e çekildi.)
- **XP kazanımı:** kill 100, kart taşıyıcısı kill +150, kart alma 150, kart taşırken 10 sn'de 25, hayatta 15 sn'de 10,
  Medic takım arkadaşı iyileştirme 75, güç toplama 25, maç bitirme 100, zafer +300. Ölünce XP/yükseltme kaybı YOK.
- **Senkron:** karakter seçilince seviyeler `NetworkManager.players[peer]["upgrades"]` ile herkese gider (host `sanitize` ile 0–5'e kırpar),
  `Player.initialize` çarpanları uygular → can/hasar her peer'da aynı. Host migration'da da taşınır.

### 5.2 Bekleyen fikirler (henüz uygulanmadı)
- **Ölüm cezası seçeneği:** ölünce maç içi kazanılan XP'nin bir kısmı gider ya da seri (streak) bonusu sıfırlanır. (Kullanıcı: "şu anlık ölünce korunsun".)
- **Maç içi geçici yükseltmeler:** kalıcı sistemin üstüne, maç içinde B tuşuyla açılan küçük bir yükseltme paneli (o maça özel, maç bitince sıfırlanır).
  Önerilen formül: toplam yükseltme sayısıyla `150 × 1.45^n`.
- **Ek yükseltme türleri:** güç slotu +1, fener menzili/açısı, başlangıç gücü süresi, respawn süresi kısalması, ayak sesi azaltma (ses gelince).
- **Karaktere özel yükseltmeler / yetenek ağacı:** Medic iyileştirme miktarı/menzili, Sniper dürbün, Tank zırh, Runner dash, Visioner uydu süresi.
- **Profil seviyesi ödülleri:** rozet, isim rengi, karakter kıyafet renkleri (kozmetik, denge bozmaz).
- **Dengeleme:** maks yükseltilmiş oyuncu yeni oyuncuya karşı ~+%25 can / +%20 hasar avantajlı → eşleştirme (matchmaking) ya da odada
  "yükseltmesiz mod" ayarı düşünülmeli.
- **Steam'e geçiş (ÖNEMLİ):** profil şu an yerel dosya → elle değiştirilebilir (hile). Steam sürümünde Steam Cloud / Steam Stats veya
  sunucu tarafı doğrulama; XP kazanımı da host/sunucu onaylı olmalı. Depolama kodu tek yerde (`PlayerProfile.load_profile/save`).

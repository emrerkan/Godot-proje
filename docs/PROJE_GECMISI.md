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

31. **Yerden hafif yüksek zemine çıkamama** (Elçilik, Yeraltı, Orman): oyuncu çarpışması kutuydu → kapsül + basamak çıkma
    (0.42 m'ye kadar; 0.75 m kütük engel kalır). Test: 0.15/0.30/0.40 geçti, 0.75 durdu. **Çöl'de kapı sarı spawn dibinde**:
    spawn'a 25 m'den yakın kapı adayları elenir → Çöl'de kenar ortaları (0,±50) (±58,0).

32. **Kart/kapı görünürlüğü:** daha yakında belirir — kart 8→3 m (eski 12→5), kapı 10→4 m (eski 16→7); **kapıyı SADECE kart
    taşıyan görür** (`Door.DOOR_CARRIER_ONLY` — kullanıcı: "not et, sonra değiştirebiliriz"; false = herkes yaklaşınca görür).
    Test 7 yine gösterir. Sağlık efekti belirginleşti (yeşil vinyet 0.7, ~1.5 sn + yükselen yeşil ✚ işaretleri).
    Yeraltı Kuantum: haritanın kendi neon/plazma malzemeleri `emission_scale` 0.35, otomatik lamba `lamp_scale` 0.4
    (bloom/glow değildi — ortamda glow kapalı; parlaklık emissive malzemelerden geliyordu).

33. Kuantum ışıkları ikinci kez kısıldı (emission 0.18, lamba sayısı 0.2, lamba gücü 0.6 — "fenere ihtiyaç yok gibi").
    **Mermiler duvardan geçiyordu** (tunneling: karede 0.5–1.3 m, duvar 0.2–0.3 m) → ışın taraması; **Sniper duvar deler**
    (kullanıcı: "sniper dışında"). **Görüş engeli:** karakteri kameradan saklayan duvar/bina/ağaç saydamlaşır — sadece
    saklarken (kullanıcı: "karakter gözükmüyorsa olsun, ağaçta da aynı mantık"). Labirent'te yok (tek mesh).

34. **4 yeni harita daha** (rehber güncellendi): Karantina Hastanesi 2v2, Yeraltı Metro İstasyonu 3v3, Lojistik Depo Labirenti 4v4,
    Gece Konteyner Limanı 5v5 — yapı rehberle aynı, genel ImportedMap kurulumu yetti. Kullanıcı kararları: **Metro ray çukuruna
    (0.85 m) inilebilir, tırmanılabilir** (`pit_climb`); **Liman suyuna girilmez** (rıhtım kenarı görünmez duvar, mermi geçer).
    Bulunan hata: yükseklik taraması hücre merkezine tek ışın atıyordu → ince duvarlar (tam sayı koordinatta) minimapte/lamba
    yerleşiminde YOKTU → kutu süpürme (kurulum ~2× uzadı, 1.2-3.6 s). Liman suyunun emission'ı gece haritasını aydınlatıyordu → 0.15.
    Rehberin "kart noktalarına ışık ekle" önerisi UYGULANMADI (kartın yerini ele verir, yakınlıkla görünme kuralına aykırı).
    Spawn platformları (`Pad_Team*`, parlak takım rengi disk) tüm yeni haritalarda var, dokunulmadı.

35. **Liman suyundan dünyanın dışına düşme** (kullanıcı oyunda yaşadı): bordalama rampalarının yanındaki kısmi hücreler "zemin var"
    sayılıyordu → 0.5 m alt hücre kapatma + su güvenlik zemini + düşen oyuncu spawn'a ışınlanır (504 kenar testinde 50 → 0 sızıntı).
    **Zıplama** (kullanıcı `anims/Jump.fbx` ekledi, "normal özelliklerden biri olsun, yüksek yerlerde kullanırız"): Space, tüm
    karakterler, ~1.15 m + kenara tutunma, koşu dayanıklılığından %20. Kararlar benim (sorulmadı): tepe yüksekliği, dayanıklılık
    bedeli, havadan ateş serbest (namlu yükseldiği için alçak hedefin üstünden geçebilir), havada çömelme bağışıklığı yok.
    Duran oyuncu da koşarak-zıplama klibini oynatır (UE kütüphanesindeki yerinde "Jump" kalkış öncesi çömelmeli, fiziğe uymuyordu).

36. Zıplama "çok yavaş yükselip alçalıyor" → havada yerçekimi 24 (eskiden 9.8), aynı yükseklik ~0.6 sn. **Yüksek kenarlara zıplamadan
    çıkılamaz** (kullanıcı): Metro/Liman `pit_climb` kaldırıldı, otomatik basamak 0.42 m. Kapı kilidi: yerdeki dolan yay kaldırıldı,
    taşıyıcının ekranında karakterin üstünde dolan bar (takım/rakip üst paneli görmeye devam eder).
37. Kapı görseli: "kalın dikdörtgenler yerine ince yuvarlak çizgi, O gibi" → çember kesintisiz ve ince (~4 cm), iç dolgu yok,
    gri kapı kutusu çizilmiyor. Yerde sadece çember + üstte "KAPI" yazısı ve ışık kaldı.
38. Kullanıcı: "çıkış noktası olduğunu anlayabilmem lazım, kapı mantıksızsa başka bir şey koy" → kapı yerine **tahliye noktası**:
    çember + yukarı akan 3 ok + 7 m ışık sütunu + "▲ ÇIKIŞ" etiketi (eskisi 32 px'te okunmuyordu); yeşil → kilitte kehribar.
    Görünürlük kuralı aynı (sadece taşıyıcı, 10 m'den belirir).
39. **Takım bölgesi işaretleri kaldırıldı** (kullanıcı: "oyuncular öğrenince taktiksel olarak durabilir"): `Pad_Team*` gizli +
    çarpışmasız (Elçilik/Çöl'de zaten yoktu). **Yükleme ekranları:** açılış, karakter seçimi, harita (+migration) — LoadingScreen.gd;
    açılış donması ana menünün ana iş parçacığında yüklenmesiydi → iş parçacığı; harita GLB'si + tarama da artık kareler arasında.
    **Dil:** Türkçe + İngilizce, varsayılan sistem dili, Ayarlar → OYUN → Dil (~340 anahtar; anlık değişir). Bilerek Türkçe kalanlar:
    rastgele çağrı adları (oyuncu adı), "Türkçe" seçeneği; varsayılan oda adı kuranın dilinde oluşur. Ses yok → çevrilecek ses de yok.
40. Yükleme ekranı görselleştirildi (kullanıcı: "TACTICAL DARK yazısı da olsun, düz yükleniyor olmasın; ipucu mantığı güzel"):
    logo + karanlıkta tarayan fener konisi (ızgara/toz açığa çıkar) + ince duman + yüzde + dönen ipucu paneli.
41. **Yükleme bekleme (CS tarzı)** (kullanıcı: "kimisinin cihazı hızlı kimisinin yavaş; herkes girince başlasın, en fazla 2 dk,
    girmeyenleri atalım"): maç herkes haritayı yükleyince AYNI ANDA başlar, perdede "n/N oyuncu hazır · en fazla m:ss";
    120 s dolunca yüklenemeyen menüye atılır (sebep ana menüde yazar, sohbete sistem mesajı), maç kalanlarla başlar.
    Kararlar: host bağlantıyı kendisi kesmez (Godot ENet: kibar kesme donmuş peer'da paket hatası spamı, zorla kesme
    SceneMultiplayer'ı habersiz bırakıp "Invalid target peer" hatası) — atılan client kendisi çıkar, donmuşu ENet zaman aşımı düşürür.
    Host migration'daki yeniden yüklemede bekleme yok. 2 süreçle doğrulandı (client 8 s donma → bekledi; elle zaman aşımı → atıldı).
    **Isınma** (kullanıcı: "yüklenenler gelene kadar haritada oynayabilsin"): perde yüklenince kalkar, oyuncu dolaşır/zıplar/ateş eder,
    HASAR YOK (seçilen varsayılan — istenirse hasarlı ısınma + anında respawn eklenebilir), kart/kapı/güç yok, hedef çipinde
    "ISINMA · n/N OYUNCU HAZIR · süre". Herkes gelince herkes kendi spawn'ına ışınlanır (can/mermi dolu) ve maç başlar.

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

### 5.3 Profil: KARAKTER GELİŞİMİ + GÜÇ GELİŞİMİ sekmeleri, ağaç görünümü (Ekim 2026 — UYGULANDI, kod: `scenes/profile/PowerTrees.gd`)
**Son kararlar (kullanıcı, 31 Ekim):** hesap geneli · her ağaçta B3 TEK düğüm (seçim mekaniği yok) · Bomba B3 = Anlık Fitil ·
Sağlık temel 60→**35**, kök 40, A: Yenilenme (+10 can/4 s) → Güçlü Sargı 45, B: Uzak Tedavi (Medic 8 m) → Acil Müdahale (<%30 canda ×1.5)
→ Grup Şifası (2.5 m'deki takıma iyileştirmenin %20'si) · Uydu: tek uydu (tüm takımların oyuncuları), ağaç sadece süre 8→9.5→11→12.5 ·
Flaş B3 = takıma körlük ×0.5 · Sis temel 15→**10**, kök 11, A geniş 6.8 m → 13 s, B hızlı duman → atış 14.5 → Radar Örtüsü ·
Tuzak B dalı tetik alanı: Geniş Çene 1.1 → Kamuflaj → Dev Çene 1.3. Kesin değerler PowerTrees.TREES'te (aşağıdaki liste ilk taslaktır).
- Profil penceresi iki sekme: **KARAKTER GELİŞİMİ** (mevcut 5 stat × 5 seviye, 5 yatay zincir olarak çizilir — veri/fiyat değişmez)
  ve **GÜÇ GELİŞİMİ**. Ağaç soldan sağa büyür (pencere 1000×640, yükseklik kısıtlı), sağda sabit detay paneli (eski→yeni değer, fiyat, AÇ).
- Güç yükseltmeleri **HESAP GENELİ** (kullanıcı kararı — güçler karaktere ait değil, herkes toplayabiliyor).
- **Her güç kendi ağacında ilerler** (kullanıcı: "bütün özel güçler kendi hedefinde ilerlesin") — fiyat sayacı ağaç başına.
  Öneri formül `300 × 1.4^(o ağaçta alınan düğüm)` → 300/420/590/825/1155/1615, ağaç ~4.900 XP. XP havuzu tek (karakterle ortak).
- İskelet: Kök → A dalı (A1, A2) + B dalı (B1, B2, B3). Kullanıcı her ağaç için B3'ü tek seçenekle belirledi:
  - **Bomba:** kök kısa fitil 1.2→1.0, A yarıçap 4→4.6 / kenar hasarı %35→%45, B atış 12→14.5 / hızlı uçuş. B3: (açık soru, bkz aşağı).
    Merkez hasarı bilerek ARTMIYOR (karakter HASAR stat'ıyla üst üste biner).
  - **Sağlık:** başlangıç iyileştirmesi (60) çok yüksek bulundu → düşürülecek, A/B yeniden düzenlenecek; **B3 = yakındaki takım arkadaşlarına %20**.
  - **Uydu:** oyunda TEK uydu kalacak (UYDU + TAKIM UYDUSU birleşir), takımlardaki oyuncuları gösterir. Ağaç sadece SÜRE artırır.
  - **Flaş:** kök fitil 0.8→0.65, A yarıçap 11→12.5 / körlük ×1.15, B kendine körlük ×0.6 / atış 14.5. **B3 = takım arkadaşlarına körlük ×0.5.**
    Flaş atanı ASLA tamamen bağışık olmaz (bedel tasarımın parçası).
  - **Sis:** 15-17 s çok uzun bulundu → kısaltılacak. **B3 = sis içindekiler uydu haritasında görünmez.**
  - **Tuzak:** kök hasar 12→14/sn, A 16/sn / kurtarma 4→5 s, **B dalı = tetik alanı geniş** (0.9→1.1) + zor fark edilir (5→4 / 2→1.5 m).
- Senkron: `players[peer]["powers"]` (register_player ile), host `sanitize_powers` (ön koşul zinciri, bilinmeyen anahtar). Host etkileri
  atanın verisinden; yerel görseller (flaş körlüğü, sis boyutu) için değerler `_bomb_rpc`'ye `mods` olarak eklenir (her peer aynı sayı).
- "Yükseltmesiz mod" oda ayarı eklenirse güç ağaçlarını da kapatmalı.

#### 5.3.1 Not edilen YENİ MEKANİK fikirleri (⚠ — yeni ağ alanı/mekanik ister, şimdilik YAPILMADI)
- **Çift şarj (Bomba "Çift Bomba", Tuzak "İkinci Tuzak"):** envanter tek slot → slota şarj sayısı alanı (`inventory[peer] = {type, charges}`),
  `_set_item_rpc` şarj parametresi, HUD slotunda "×2". Kullanınca şarj düşer, 0'da slot boşalır. İkisi aynı altyapıyı paylaşır.
- **Bomba "Anlık Fitil":** fitil toplam 0.7 s — yere düşer düşmez patlar, kaçma payı neredeyse yok (sert; dikkatli dengelenmeli).
- **Sağlık "Taşma Kalkanı":** maksimum canı aşan iyileştirme geçici kalkana (en fazla 20) dönüşür → Player'a `shield` değeri + senkron,
  `take_damage` önce kalkandan düşer, HUD can çubuğunda ayrı renk. Süreyle erir (ör. 8 s).
- **Sağlık "Adrenalin":** iyileştirilen 3 s +%15 hız → Player'a süreli hız çarpanı (buff) + uzak peer'lara senkron (hareket zaten konumla gelir,
  sadece animasyon hızı için gerekli). Genel bir "buff" sistemi ileride başka güçlere de yarar.
- **Sis "Çift Bulut":** 4.5 m'lik 2 bulut — FogVolume maliyeti nedeniyle performans testi şart (1 bulut ~-%15 FPS ölçüldü).
- **Uydu ek fikirleri (tek uydu kararından önce önerilmişti):** kart izi (taşıyıcı işareti +3 s), sessiz tarama (rakip uyarısı 2 s gecikir),
  düşük canlı düşman kırmızı, kapı YÖN oku (konum değil), son konumların soluk kalması. Kullanıcı şimdilik sadece süreyi seçti.
- **Flaş "Sessiz Flaş":** uçuş görseli rakiplere gizli (Bomb.gd yerel). **Tuzak "Alarm":** yakalananın konumu 4 s kendi takımının haritasında.
- **Runner "Dash":** kısa atılma (yeni hareket mekaniği, bıçak hamlesi altyapısı benzer).

#### 5.3.2 KARAKTER UZMANLIĞI (kullanıcı: "pek anlamadım, yapma ama detaylı not et")
**Ne:** Karakter ağacının en sağındaki özel düğüm. 5 stat zinciri "her karakterde aynı" sayısal artışlar; uzmanlık ise o karaktere
ÖZEL bir davranış ekler — karakterin rolünü belirginleştirir (Medic daha iyi destek, Sniper daha iyi keşif...).
**Nasıl açılır:** o karakterde toplam **10 stat yükseltmesi** alındıktan sonra açılabilir hale gelir (önce temel gelişim, sonra uzmanlaşma).
**Seçim:** her karakterde **2 seçenek, sadece BİRİ** alınır (oyun tarzı kararı). Değiştirmek ucuz (ör. 100 XP) — deneme cezalandırılmasın.
**Fiyat:** sabit **2.000 XP**; stat fiyatının üstel sayacına GİRMEZ (yoksa sonraki stat yükseltmeleri pahalanırdı, mevcut oyuncuların fiyatı kayardı).
**Seçenekler (öneri):**
| Karakter | Seçenek 1 | Seçenek 2 |
|---|---|---|
| Medic | Sağlık gücünün takım arkadaşı menzili 6→8 m | Takım arkadaşını iyileştirince ek +15 can |
| Sniper | Dürbün: kamera fareye doğru kayar (uzağı görür) | (belirlenecek — "duvar delmede hasar kaybı" önerisi geçersiz: kodda kayıp yok) |
| Tank | Patlama (bomba/tuzak) hasarı −%15 | Önden bıçak hasarı −%20 (arkadan bıçak yine öldürür) |
| Runner | Dash ⚠ (yeni mekanik) | Koşu dayanıklılığı %30 daha hızlı dolar |
| Visioner | Uydu süresi +2 s | Ölünce katilin konumu 3 s takımın haritasında |
**Veri/geçiş:** profil dosyasına `specialization[karakter] = "1"/"2"/""` anahtarı eklenir; mevcut `upgrades` ve fiyatlar değişmez, iade gerekmez.
Ağda `players[peer]["spec"]` ile gider, host doğrular (10 yükseltme şartı + geçerli seçenek).
**Durum:** YAPILMADI — kullanıcı onayı bekliyor.

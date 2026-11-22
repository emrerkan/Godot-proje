# Ses kaynakları

## Kullanıcının eklediği kayıtlar
| Dosya | Kullanım |
|---|---|
| `fener-acma-kapama.mp3` | Menü düğme tıkı (`ui_click`) |

Menü hover (`ui_hover`) ve yükseltme satın alma (`upgrade_buy`) ayrı dosya değil — kullanıcı isteğiyle oyundaki ateş sesleri (`shot_smg_*`, `shot_rifle_*`).
| `yurume-ses.mp3` → `walk_1..4.mp3` | Yürüme/koşma adımları (kayıttaki 4 adım çerçeve sınırından ayrıldı) |
| `ziplama-ses.mp3` | Zıplama |
| `crouch_1.wav` (crouching.wav, baştaki sessizlik kesildi) | Çömelmeye geçiş (AI ile üretildi) |
| `flip_1.mp3`, `flip_2.mp3` (takla-sesi*.mp3) | Takla başı (AI ile üretildi) |

## CC0 (kamu malı; ticari kullanım serbest, atıf gerekmez)
| Dosyalar | Kaynak |
|---|---|
| `shot_*.wav` (AK-47 → rifle, AR-15 → carbine, Carl Gustav M45 → smg, SKS → marksman, Mosin Nagant → sniper) | The Free Firearm Sound Library — https://opengameart.org/content/the-free-firearm-sound-library |
| `breath_hard_*.wav`, `breath_soft_*.wav` (breath-male.wav'dan), `crouch_step_*.wav` (Footsteps/step1-4) | Owlish Media Sound Effects — https://opengameart.org/content/sound-effects-pack |
| `explosion_1.mp3` | "Chunky Explosion" — https://opengameart.org/content/chunky-explosion |
| `explosion_2.wav` | "Explosion" — https://opengameart.org/content/explosion-0 |
| `flash_bang_*.ogg` | "25 CC0 bang / firework SFX" — https://opengameart.org/content/25-cc0-bang-firework-sfx |
| `mag_in.ogg` | Kenney "Impact Sounds" — https://kenney.nl/assets/impact-sounds |
| `flesh_hit_1..3.ogg` (impactPunch_medium_000/001/003), `flesh_hit_4.ogg` (impactSoft_medium_001), `shell_casing_1..4.ogg` (impactTin_medium_000/001/002/004), `shell_casing_5.ogg` (impactMetal_light_004) | Kenney "Impact Sounds" — https://kenney.nl/assets/impact-sounds |
| `card_*.ogg` | Kenney "Interface Sounds" — https://kenney.nl/assets/interface-sounds |
| `hit_marker_1..3.ogg` (tick_001/002/004), `kill_confirm_bong.ogg` (bong_001) | Kenney "Interface Sounds" — https://kenney.nl/assets/interface-sounds |
| `mag_out.ogg`, `bolt.ogg`, `stab.ogg`, `throw.ogg` | Kenney "RPG Audio" — https://kenney.nl/assets/rpg-audio |
| `lunge_whoosh_1.ogg` (cloth4), `lunge_whoosh_2.ogg` (cloth2) | Kenney "RPG Audio" — https://kenney.nl/assets/rpg-audio |

İşleme (wav'lar): 96 kHz → 48 kHz, mono, kesim (atışta ilk geçişe hizalı, nefeste ~90 ms yumuşak giriş), sonda doğrusal sönüm, tepe normalizasyonu.
Kalan sesler (kulak çınlaması, sis, kilit bipleri, maç sonu akoru) `scenes/audio/Sfx.gd` içinde kodla sentezlenir.

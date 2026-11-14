@echo off
REM TacticalDark sistem testi — bu dosyayi TacticalDark.exe ile AYNI klasore koyup cift tiklayin.
REM ~3 dakika surer (botlu mac, 4 kalite profili). Bitince sonuc ekranda gorunur;
REM "KLASORU AC" ile acilan klasordeki benchmark.csv dosyasini geri gonderin.
start "" "%~dp0TacticalDark.exe" --sysbench

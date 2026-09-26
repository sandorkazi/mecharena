# Game Mechanics

MVP: 3D third-person mech arena, 4v4 játékos + AI botok ellen. Böngészőben, telepítés nélkül. Később multiplayerre bővíthető, de MVP csak kliens-oldali szimuláció.

Elfogadási cél: lobbyból indított 5 körös meccs 720p 60 FPS-sel integrált GPU-n, 3 s alatti load-dal.

## World Base

- Zárt arena: 100x100 m, 8 m magas fal. 1 pálya MVP-ben (`arena1`).
- Layout: szimmetrikus, csapat-spawnok É/D oldalon, középen 4 fix fedezék-blokk (4x2x3 m) + 6 rombolható hordó + 8 pickup-pont (2 HP, 2 lőszer, 3 szuper, 1 Overdrive ritka).
- Körös meccs: default 5 kör (lobbyban 1/3/5/7), körönként 2 respawn / fő (lobbyban 0/1/2). Respawn 3 s, saját spawn-ponton, 2 s spawn-védelemmel.
- Körgyőzelem: ellenfél csapat összes élete elfogy. Meccsgyőzelem: több kör (döntetlenre sudden death: nincs respawn, első kill nyer).

### Physics

Arcade kinematikus modell, fix timestep: 60 Hz logika, render független, max 3 substep / frame, delta clamp 100 ms (tab-switch védelem).

Konstansok (MVP végleges):
- Gravitáció: 20 m/s² lefelé. Földi súrlódás: 10 /s exponenciális csillapítás.
- Mozgási sebesség (földön): Tank 6.0 m/s, Striker 8.5 m/s, Support 7.5 m/s. Levegőben kontroll 60%.
- Ugrás: 7 m/s kezdeti sebesség (~1.2 m magas). Jetpack: tartott Space, 12 m/s² tolóerő, max emelkedési sebesség 6 m/s, üzemanyag 3.0 s, földön tölt 4.0 s alatt (levegőben nem tölt).
- Dash: Shift, 14 m-es lökés 0.18 s alatt adott irányba (célkereszt síkjában), cooldown: Striker 2.0 s, mások 3.0 s. Dash alatt 50% sebzés-csökkenés, de nem iframe.
- EMP/gátlás: jetpack + dash tiltva 3.0 s-re (Support EMP-je 4.0 s). Aktív jetpack megszakad, esés marad.
- Collision: mech = kapszula r=1.0 m, h=2.5 m. Fal/fedezék = AABB. Mech-mech = puha szétlökés (nincs átjárás). Lövedék: hitscan raycast vs AABB+kapszula; projectile gömb r=0.3 m, sebesség 25 m/s, max 32 egyidejű.
- Költségvetés: fizika <1.5 ms / tick i5-8250U-n 8 mech + 32 projectile mellett.

## Game Modes

- MVP egyetlen mód: 4v4 Team Battle vs AI (játékos + 3 társ bot vs 4 ellenséges bot).
- Multiplayer-készen: `src/sim/` nem importálhat DOM-ot vagy WebGL-t; `src/net.js` stub (`connect()`, `snapshot()`, `apply()`). Entitás-snapshot JSON: `{id,pos,vel,hp,ammo,class,weapon,cooldowns}` 10 Hz-cel sorosítható.
- Feladás/kilépés: szünetből, ellenfél nyeri a kört. Eredmény: körök, K/D, pontosság, legtöbb sebzés.
- Determinisztikus kör-seed: `seed = hash(meccsId + körSzám)`, bot-döntések és pickup-respawn ebből.

## Fighting

- Third-person kamera: 4.5 m mögött, 1.8 m magasan, FOV 70. Pointer Lock célzás, kamera-collision (falhoz közelít).
- HP: nincs auto-regen. Halál = respawn-számláló -1, 3 s respawn ha maradt élet.
- TTK cél: fókuszált géppuskatűzzel 2-4 s azonos kasztra (lásd sebzés-táblát).
- Friendly fire: KI. Saját splash sebez (rakéta, hordó) 50%-kal.
- Találat-visszajelzés: hitmarker + irányjelző sebzésre + killfeed. Kötelező MVP-ben.

### Weapons

Loadout: 1 primary (géppuska / rakéta / railgun) + lánckard mindig másodlagos (2-es vagy jobb klikk).

| Fegyver | Sebzés | Tűzütem | Tár / Tartalék | Újratöltés | Hatótáv / Lövedék | Megjegyzés |
|---|---|---|---|---|---|---|
| Géppuska | 8 / lövés | 10 /s | 40 / 160 | 1.5 s | 60 m hitscan, szórás 1.5° | DPS 80, TTK Tankra 2.5 s |
| Rakéta | 45 direkt + 30 splash 4 m-ben | 0.8 /s | 4 / 12 | 2.5 s (egész tár) | 25 m/s projectile, 0.3 m sugár | Önsplash 50% |
| Railgun | 80, 1 célponton áthatol 50%-kal | 0.8 /s (1.25 s) | 5 / 15 | 2.0 s | 100 m hitscan, szórás 0° | Töltés-hang 0.4 s |
| Lánckard | 60 / csapás | 1.2 /s | végtelen | — | 3.0 m ív, 90° | Dash-ból +25% sebzés |

Lőszer-pickup: +1 tárnyi primary + kardhoz nem kell. Üres tár = auto-újratöltés, R-rel kézi.

Szuperfegyver / eszköz (pályán felvehető, 1 töltet, E-vel vagy auto-felvétellel, 3-as slot, 1 aktív vihető):

1. EMP gránát (gyakori, 30 s respawn, 3 spawn-pont): dobás 20 m, robbanás 8 m sugárban. 10 sebzés + dash/jetpack tiltás 3.0 s (Support dobva 4.0 s). Saját csapatra is hat (counter-play).
2. Energia-pajzs (közepes, 45 s respawn, 2 pont): aktiválásra 5.0 s, 100 sebzés elnyelés, alatta -20% mozgás, nem lőhet railgunnal.
3. Overdrive (ritka, 60 s respawn, 1 középső pont, HUD időzítő jelzi): 8.0 s dupla sebzés (2x) + végtelen jetpack-fuel. Halálkor elvész, nem dobható el.
- Max 1 szuper / mech. Felvétel érintésre (1.5 m). HUD-ikon + hang kötelező.

### Objects

- Fix fedezék: 4 db 4x2x3 m blokk + 4 db 2x2x2 m kocka. Nem rombolható, blokkol mozgást és hitscant, projectile-t felrobbantja.
- Rombolható hordó: 6 db, 50 HP, felrobbanva 40 sebzés 5 m-ben (sajátot is, 50%). Respawn körönként, nem meccs közben. Loot: 50% lőszer, 25% semmi, 25% kis HP (+25).
- Pickup-pontok (8 db, fix): HP (+50, 20 s respawn), Lőszer (+1 tár, 15 s), Szuper (fent). Lebegő ikon + pulzáló fény + 1.5 m felvételi sugár. Minden pooled, nincs futásidejű `new` a game loopban.
- Perf: összes statikus <10 draw call (instancing vagy merged), dinamikus pickup <10 draw call.

### Vehicles

Mech = karakter+jármű egyben. 3 kaszt, azonos modell, eltérő színcsík (kék/piros csapat + kaszt-jel):

| Kaszt | HP | Sebesség | Dash CD | Passzív |
|---|---|---|---|---|
| Tank | 200 | 6.0 m/s | 3.0 s | -15% elszenvedett sebzés, pajzs +50 elnyelés (150) |
| Striker | 120 | 8.5 m/s | 2.0 s | Dash-ból kard +25%, railgun/rakéta újratöltés -20% |
| Support | 140 | 7.5 m/s | 3.0 s | Közelben (10 m) társ +10 HP/s (harcon kívül), saját EMP +1.0 s |

- MVP-ben nincs eltérő modell (1 mech-mesh, ~800 tris, 3 színvariáns). Kaszt = stat + 1 passzív, lobbyban választható, bot-mix fix (lásd Characters).
- Hitbox egységes minden kasztra (balance egyszerűség).

# Implementation

## Platform

- Cél: azonnal játszható statikus oldal, telepítés és szerver nélkül.
- Stack: Vanilla JS (ES2020) + WebGL1, saját minimal render (~300 sor) vagy max 100 KB lib. Nincs Three.js / Phaser / WASM / bundler-kötelezettség MVP-ben. `index.html` relatív pathokkal, `file://` + `https://` alatt is indul (modulok helyett sima `<script>` vagy `type=module` relatívval — file-tesztelt).
- Nincs backend, nincs fetch-kötelezettség. Minden kliensben fut.
- Méret-költség: első load <5 MB (cél <2 MB), gzip-pel. Asset: vertex-color, nincs textúra, nincs audio-fájl (WebAudio-szintézis).
- Repo layout:
  - `/index.html` — belépő, canvas + HUD + menü mount.
  - `/src/main.js`, `/src/sim/` (physics, weapons, bots), `/src/render.js`, `/src/audio.js`, `/src/ui.js`, `/src/net.js` (stub).
  - `/assets/` — opcionális (max pár KB JSON pálya + ikon SVG).
  - `/README.md` — futtatás + kontrollok. `/QA.md` — checklist.
  - `/.github/workflows/pages.yml` — Pages deploy.
- Kód-szabály: `sim/` nem nyúl DOM-hoz; kör-seeddel determinisztikus; pooled tömbök.

## World Model

- Kliens-authoritative: 1 szimuláció, 8 mech + max 32 projectile + 10 pickup + 6 hordó.
- Snapshot: minden entitás `{id,class,team,pos,vel,yaw,hp,ammo,cd,effects}`; `sim.snapshot()` / `sim.restore()` a későbbi netcode-hoz és replay-hez.
- Bot AI FSM 10 Hz-en (nem frame-enként): állapotok `spawn / seek-pickup / engage / cover-reload / retreat / support-follow`. Látótáv 50 m + 90° FOV + raycast (fedezék-ellenőrzés). Útkeresés: nincs navmesh, greedy steer + fal-csúszás (arena egyszerűsége miatt elég).
- Nehézség: `easy`: reakció 500 ms, célzási hiba 4°, DPS-skála 0.7. `normal`: 250 ms, 2°, 1.0. Lobbyban állítható, default normal.
- RNG: mulberry32 seed-elt körönként. Bot-döntés + pickup-időzítés ebből, nem `Math.random`-ból.

## Controls

Fix binding MVP-ben (remap később). Kötelező billentyűzet + egér + Pointer Lock.

| Akció | Input | Megjegyzés |
|---|---|---|
| Mozgás | WASD | Kamera-relatív |
| Célzás | Egér | Pointer Lock, érzékenység 0.5-3.0 (default 1.2) |
| Tűz primary | Bal klikk | Tartva automata (géppuska) |
| Kard / secondary | Jobb klikk vagy 2 | — |
| Ugrás / Jetpack | Space (tartva) | Dupla-nyomásra is jetpack |
| Dash | Shift | Mozgásirányba |
| Pickup / Szuper használat | E / 3 vagy Q | E felvesz, Q aktivál (konfig: E mindkettő ha 1 slot) |
| Újratöltés | R | — |
| Szünet | Esc / P | Pointer unlock + menü |
| Fegyverváltás | 1 / 2 | 1 primary, 2 kard |

- Help-overlay (H vagy szünetből) kötelező. Egér-érzékenység + invert-Y menüben.
- Touch/gamepad: kívül MVP-n, kódban `input.js` absztrakcióval előkészítve.

## Menu

Flow: Boot → Főmenü (Start Lobby / Help / Minőség) → Lobby → Meccs (HUD) → Kör-vége banner → Meccs-vége eredmény → Vissza lobbyba.

- Lobby (kötelező MVP):
  1. Csapatlista: kék (játékos + 3 bot) / piros (4 bot), kaszt-dropdown per slot, bot-nehézség (könnyű/normál).
  2. Loadout: kaszt (Tank/Striker/Support) + primary (géppuska/rakéta/railgun).
  3. Meccs-beállítás: körszám (1/3/5/7, default 5), élet/kör (0/1/2, default 2), seed (auto/fix).
  4. Start gomb + validáció (mindig 4v4).
- HUD: HP-bar, fuel-bar, dash-cooldown ikon, lőszer, szuper-slot, killfeed (5 sor), kör/élet számláló, középső pickup-riasztás, csapattárs-iránytű, FPS-mérő (debug `?fps=1`-re vagy auto módban).
- Szünet: folytatás / feladás / help / minőség (Auto/Low/High) / érzékenység.
- Eredmény: körök listája, K/D/pontosság/sebzés tábla, MVP-bot kiemelés.

## Characters

1 játékos + 7 bot, azonos kaszt-statokkal. Csapat-szín: kék vs piros derék-sáv + név-tag. Bot-név generált (`R-01`…).

### Enemies

- Összetétel: 1 Tank, 2 Striker, 1 Support (fix MVP-ben).
- Taktika: Striker flankel + fókuszálja a legalacsonyabb HP-st, Tank zónáz középen, Support hátrébb marad és gyógyít + EMP-zi a jetpackelő játékost.
- Retreat: HP <30% → legközelebbi HP-pickup vagy fedezék, 5 s-re nem engage-el.
- Korlát: max 1 EMP / 10 s / csapat (spam ellen), max 2 bot fókuszál 1 célpontot.

### Allies

- Összetétel: játékos kasztjától független 1 Tank, 1 Striker, 1 Support.
- Követés: Support a játékost követi 12 m-en, Striker előremegy, Tank fedez.
- Fókusz-segítség: játékos által sebzett célpontot preferálják 5 s-ig ha látják.
- Kommunikáció: nincs ping MVP-ben; csapattárs-HUD (élő/halott + távolság + irány) kötelező.

# Visuals

## Graphics

- Stílus: low-poly flat-shaded, vertex-color, textúra nélkül. 1 mech-mesh (~800 tris) + arena-dobozok + hordó (cylinder 12 szegmens) + pickup-ikon (billboard).
- Fény: 1 directional + ambient, nincs shadow-map; blob-shadow (sötét kör-sprite) mecheken.
- Effektek: muzzle-flash (quad 0.1 s), találat-szikra (pooled particle max 100), robbanás (skálozódó gömb + flash 0.4 s). Nincs post-process, nincs bloom MVP-ben.
- Költségvetés: teljes scene <50k tris, <60 draw call, <100 aktív particle. Mech LOD nincs (1 szint elég).
- Minőség-szintek:
  - High: render-scale 1.0, particle 100%, 60 m látótáv-köd nélkül.
  - Low: render-scale 0.5, particle 30%, effekt-félbevágás.
  - Auto (default): indul High-on; ha FPS <45 2 s-ig → 0.66 → 0.5 → particle ki; ha >58 5 s-ig → visszalép. Váltáskor HUD-toast.

## Browser Capabilities

Kötelező minimum (acceptance tesztek ezekre):

- Böngészők: evergreen Chrome / Edge / Firefox / Safari, WebGL1, ES2020, Pointer Lock. Nincs plugin, nincs WASM.
- Gép: Intel UHD / Vega 3 szintű integrált GPU, 4 GB RAM, 720p. Cél: 60 FPS ±5 High-on üres jelenetben, ≥45 FPS Auto-val 8 mech + effektek mellett.
- Load: <3 s 4G-n (throttled 4x CPU + Fast 3G lab-teszten <5 s), első letöltés <5 MB (cél <2 MB), RAM <200 MB (Chrome Task Manager).
- Input: billentyűzet + egér kötelező; touch / gamepad nem támogatott MVP-ben (üzenettel jelezni).
- Stabilitás: 60 Hz `requestAnimationFrame`, delta clamp, tab-switch után nincs fizika-robbanás; WebGL-context elvesztéskor overlay + Reload gomb.
- Offline: Pages-ről betöltve, majd hálózat nélkül is játszható kör végéig (nincs runtime fetch).

# Publication

## GitHub

- Publikus repo, `main` = mindig játszható. Branch-stratégia: `main` + rövid feature-branch-ek, PR nélkül is mehet MVP-ben, de törött `main` tilos.
- Pages: root `index.html`-ből (`Settings → Pages → Deploy from branch → main / root`). Alternatíva `/docs/` csak ha a root-ban build lenne — MVP-ben root. `.github/workflows/pages.yml` nem kötelező, elég a branch-deploy; workflow csak ha egyéni domain vagy check kell.
- Fájlok:
  - `README.md`: 1-képernyős: link a Pages-re, kontroll-tábla, QA-rövid.
  - `QA.md`: 5 perces kézi checklist (elfogadás = mind zöld):
    1. Load: inkognitó Pages-URL <3 s, console error nélkül.
    2. Lobby: 4v4 start, kaszt+primary választható, 5 kör / 2 élet default.
    3. 1 kör: végigjátszható ≥45 FPS Auto-val, botok mozognak + lőnek.
    4. EMP: találat után 3 s-ig nincs dash/jetpack (HUD-debuff ikonnal).
    5. Minőség: Auto vált 0.66/0.5-re terhelésre + toast; Low/High kézzel kényszeríthető.
    6. Respawn + kör/meccs-vége + eredmény + vissza lobbyba.
- Verziózás: `v0.1-mvp` tag = lobby + 4v4 + 4+3 fegyver + 1 arena + QA zöld. Következő: `v0.2-netstub` (snapshot/replay).
- Elfogadás-URL forma: `https://<user>.github.io/<repo>/` — ezt README tetejére.

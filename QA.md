# QA — 5 perces kézi checklist

Forrás: `specs.md` → Publication.

## Stabil (main)

URL: https://sandorkazi.github.io/mecharena/

- [ ] 1. Load: inkognitó ablakban <3 s, console error nélkül, badge: `main`.
- [ ] 2. Lobby: (ha kész) 4v4 start, kaszt + primary választható, default 5 kör / 2 élet.
- [ ] 3. 1 kör: végigjátszható ≥45 FPS Auto-val, botok mozognak + lőnek.
- [ ] 4. EMP: találat után 3 s-ig nincs dash/jetpack (HUD-debuff ikon).
- [ ] 5. Minőség: Auto vált 0.66/0.5-re terhelésre + toast; Low/High kézzel kényszeríthető.
- [ ] 6. Respawn + kör/meccs-vége + eredmény + vissza lobbyba.

## Fejlesztői (develop)

URL: https://sandorkazi.github.io/mecharena/develop/

- [ ] 1. Load: badge: `develop`, console error nélkül.
- [ ] 2. Tartalom eltérhet main-től (új feature itt tesztelendő).
- [ ] 3. Ha zöld: merge `develop` → `main`.

# Mech Arena

Böngészős 3D third-person mech arena (MVP: 4v4 vs AI). Spec: [`specs.md`](specs.md).

## Játék

- Stabil (main): https://sandorkazi.github.io/mecharena/
- Fejlesztői (develop): https://sandorkazi.github.io/mecharena/develop/

Desktop, billentyűzet + egér kell. Touch MVP-n kívül.

| Akció | Input |
|---|---|
| Mozgás | WASD |
| Célzás | Egér (Pointer Lock) |
| Tűz | Bal klikk |
| Kard | Jobb klikk / 2 |
| Ugrás / Jetpack (tartva) | Space |
| Dash | Shift |
| Pickup / Szuper | E / Q |
| Újratöltés | R |
| Szünet | Esc / P |

## Fejlesztés

```sh
# lokális próba (statikus szerver KELL a three.js-modulok miatt)
python3 -m http.server -d . 8000
# -> http://localhost:8000/
# (file:// megnyitva csak a box-fallback grafika indul)
```

Grafika: three.js + CC0 robot-modell (`assets/robot.glb`, Quaternius).
Kredit: mech-modell — Tomás Laulhé (Quaternius), CC0.

Struktúra: `/index.html`, `/src/`, `/assets/`, `/specs.md`, `/QA.md`.

- `main` = mindig játszható stabil.
- `develop` = fejlesztői, `/develop/` alatt publikálva.

## Deploy (Pages, két endpoint)

GitHub Actions rakja össze: `main` -> `/`, `develop` -> `/develop/`.
Beállítás 1x (lásd lent, neked kell kattintani): Settings → Pages → Source: **GitHub Actions**.

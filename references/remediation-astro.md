# Remediation — Astro (statische sites / islands)

Astro rendert standaard statische HTML; veel a11y-fixes zijn dus "gewoon" goede HTML.
Let extra op island-hydratie voor interactieve onderdelen.

## Statische HTML eerst
- Gebruik semantische elementen rechtstreeks: `<nav>`, `<main>`, `<button>`, `<a href>`.
- Eén `<h1>` per pagina-`.astro`; headings in volgorde.
- `lang` op de root: `<html lang="nl">` in je layout.

## `image-alt` (Astro `<Image />`)
```astro
---
import { Image } from 'astro:assets'
import foto from '../assets/foto.jpg'
---
<Image src={foto} alt="Beschrijvende tekst" />
<Image src={deco} alt="" />   <!-- decoratief -->
```

## Islands & timing (axe ziet alleen de DOM ná hydratie)
- Interactieve componenten (`client:load`, `client:visible`) bouwen pas in de browser hun DOM.
- De scanner wacht op `networkidle` + `--settle-ms`; gebruik `--wait-selector` voor trage islands.
- Zorg dat ARIA-staten (`aria-expanded`, `aria-controls`) in het component-framework gezet worden,
  niet alleen via los script.

## Consent-/inline scripts
- `is:inline` scripts voor cookie-banners: zorg dat de accept-knop een echte `<button>` met
  toegankelijke naam is; test met `--dismiss-consent`.

## Contrast
- Definieer kleuren als tokens en controleer tegen achtergrond ≥ 4.5:1 (tekst) / ≥ 3:1 (UI).

## Formulieren
- Native `<label for>` + `<input id>`; foutmeldingen via `aria-describedby`.
- Bij client-side validatie: kondig fouten aan met een `aria-live="polite"` regio.

## Skip-link (2.4.1)
```astro
<a href="#main" class="skip-link">Naar inhoud</a>
...
<main id="main" tabindex="-1"> … </main>
```

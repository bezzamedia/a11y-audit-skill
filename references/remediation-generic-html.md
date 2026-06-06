# Remediation — generieke HTML (WordPress, .NET / Smartstore, overig)

Framework-onafhankelijke fixes. Toepasbaar op server-rendered HTML, thema's en CMS-output.

## Semantiek & landmarks (1.3.1, 2.4.1)
- Gebruik `<header>`, `<nav>`, `<main>`, `<footer>`, `<button>`, `<a href>` i.p.v. `<div>`/`<span>`
  met click-handlers.
- Eén `<main>` en één `<h1>` per pagina; headings in logische volgorde.

## Afbeeldingen (1.1.1)
- `<img src alt="beschrijving">`; decoratief → `alt=""`. Vermijd "image"/"foto" als alt-tekst.
- CMS: train redacteuren om alt in de media-bibliotheek in te vullen.

## Knoppen & links (4.1.2, 2.4.4)
- Icon-only knoppen: `aria-label`. Links: beschrijvende tekst, niet "lees meer" × 10.
```html
<button aria-label="Zoeken"><svg aria-hidden="true">…</svg></button>
<a href="/aanmelden">Meld je aan voor de nieuwsbrief</a>
```

## Formulieren (1.3.1, 3.3.1, 3.3.2)
```html
<label for="naam">Naam</label>
<input id="naam" name="naam" required aria-describedby="naam-help">
<span id="naam-help">Voor- en achternaam</span>
```
- Foutmeldingen: koppel met `aria-describedby`, kondig aan via `role="alert"`/`aria-live`.
- Radio/checkbox: `<fieldset><legend>…</legend>…</fieldset>`.

## Contrast (1.4.3, 1.4.11)
- Pas thema-/tokenkleuren aan tot ≥ 4.5:1 (tekst), ≥ 3:1 (UI-randen, focus).

## Taal & titel (3.1.1, 2.4.2)
- `<html lang="nl">`, unieke beschrijvende `<title>` per pagina.

## ARIA — spaarzaam (4.1.2)
- "No ARIA is better than bad ARIA." Gebruik eerst native HTML; voeg ARIA alleen toe waar nodig
  en zet states (`aria-expanded`, `aria-current`, `aria-selected`) ook daadwerkelijk dynamisch.

## CMS-specifiek
- **WordPress**: kies een toegankelijk thema; controleer plugin-output (sliders, popups, forms)
  apart — die zijn vaak de bron van fouten. Veel page-builders genereren `div`-soup.
- **.NET / Smartstore**: controleer Razor-partials en widget-zones; let op gegenereerde
  formulieren en modals. Schema/markup-plugins raken a11y niet — die los je in de templates op.

## Skip-link (2.4.1)
```html
<a href="#main" class="visually-hidden-focusable">Naar inhoud</a>
```

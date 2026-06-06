# Handmatige Accessibility Checklist (WCAG 2.2 AA)

Geautomatiseerde scans (axe, Lighthouse) vangen ~30–50% van WCAG. Deze checklist dekt
de rest: wat alleen met toetsenbord, screenreader en menselijke beoordeling te testen is.
**Verplicht** onderdeel van elke audit. Loop dit per site door en noteer per item: ✅ pass / ⚠️ deels / ❌ fail.

Severity-codes: **P0** kritiek · **P1** ernstig · **P2** matig · **P3** klein.

---

## 1. Toetsenbordnavigatie & tab-volgorde  (vervangt Taba11y)
> WCAG 2.1.1 Keyboard, 2.4.3 Focus Order, 2.4.7 Focus Visible

- [ ] **[P0]** Tab door de volledige pagina zonder muis — alle links, knoppen en velden bereikbaar (2.1.1)
- [ ] **[P0]** Geen keyboard-trap: je kunt overal weer uit tabben (2.1.2)
- [ ] **[P1]** Tab-volgorde volgt de visuele/logische leesvolgorde (2.4.3)
- [ ] **[P1]** Focus-indicator is op élk interactief element duidelijk zichtbaar (2.4.7)
- [ ] **[P2]** Focus-indicator wordt niet afgedekt door sticky headers/footers (2.4.11 Focus Not Obscured — nieuw in 2.2)
- [ ] **[P1]** Dropdown-/menu's openen met Enter/Space/Pijltjes; Escape sluit
- [ ] **[P1]** Skip-link ("naar inhoud") is de eerste tab-stop en werkt (2.4.1)
- [ ] **[P2]** Custom widgets (sliders, tabs, accordions) volgen het APG keyboard-patroon

## 2. Focusbeheer in dynamische UI
> WCAG 2.4.3, 4.1.2 Name Role Value

- [ ] **[P0]** Modal/dialog: focus verspringt naar de dialog, is daarin getrapt, en keert bij sluiten terug naar de trigger
- [ ] **[P1]** Bij sluiten van menu's/overlays gaat focus terug naar een logische plek
- [ ] **[P2]** Route-/paginawissel (SPA): focus en/of een live-aankondiging verplaatst naar de nieuwe content
- [ ] **[P2]** Geen autofocus die de gebruiker desoriënteert

## 3. Screenreader (VoiceOver ⌘F5 / NVDA)
> WCAG 1.1.1, 1.3.1, 4.1.2, 4.1.3

- [ ] **[P1]** Koppen, links en content worden in zinvolle volgorde aangekondigd (1.3.2)
- [ ] **[P1]** Actieve navigatie-item kondigt zich aan via `aria-current="page"`
- [ ] **[P0]** Afbeeldingen met informatie hebben beschrijvende alt-tekst; decoratieve niet aangekondigd (1.1.1)
- [ ] **[P1]** Formuliervelden kondigen hun label, type en status aan (4.1.2)
- [ ] **[P1]** Foutmeldingen en status-updates worden via live regions aangekondigd (4.1.3)
- [ ] **[P2]** Iconen-als-knop hebben een toegankelijke naam (aria-label)
- [ ] **[P2]** Landmarks (header/nav/main/footer) zijn aanwezig en navigeerbaar

## 4. Kleurcontrast (handmatig waar scanner faalt)
> WCAG 1.4.3 Contrast (Minimum), 1.4.11 Non-text Contrast

- [ ] **[P1]** Tekst over afbeeldingen/gradients: minimaal 4.5:1 (axe meet dit níét betrouwbaar)
- [ ] **[P1]** Normale tekst ≥ 4.5:1, grote tekst (≥24px / ≥19px bold) ≥ 3:1 (1.4.3)
- [ ] **[P2]** UI-componenten en focus-/statusgrenzen ≥ 3:1 (1.4.11)
- [ ] **[P2]** Informatie niet alleen via kleur overgebracht (1.4.1) — bv. links onderstreept of anderszins gemarkeerd

## 5. Reflow, zoom & afstand
> WCAG 1.4.4 Resize Text, 1.4.10 Reflow, 1.4.12 Text Spacing

- [ ] **[P1]** Bij 200% browser-zoom blijft alle content/functie bruikbaar (1.4.4)
- [ ] **[P1]** Bij 400% zoom (≈320px breed) geen horizontaal scrollen of overlap (1.4.10 Reflow)
- [ ] **[P2]** Tekstafstand vergroten breekt de lay-out niet (1.4.12)

## 6. Doelgrootte & pointer
> WCAG 2.5.8 Target Size (Minimum — nieuw in 2.2)

- [ ] **[P2]** Klikbare doelen zijn minimaal 24×24px (of hebben voldoende tussenruimte) (2.5.8)
- [ ] **[P2]** Geen functie die alléén met sleep/multi-touch kan (2.5.7)

## 7. Beweging & motion
> WCAG 2.3.3 Animation from Interactions, 2.2.2 Pause Stop Hide

- [ ] **[P2]** `prefers-reduced-motion: reduce` stopt animaties, transities en smooth-scroll (2.3.3)
- [ ] **[P2]** Auto-bewegende content (carrousels) kan gepauzeerd worden (2.2.2)
- [ ] **[P0]** Niets knippert > 3× per seconde (2.3.1)

## 8. Formulieren (handmatige flow)
> WCAG 1.3.1, 2.4.6, 3.3.1, 3.3.2, 3.3.7, 3.3.8

- [ ] **[P0]** Elk veld heeft een zichtbaar, gekoppeld `<label>` (1.3.1, 3.3.2)
- [ ] **[P1]** Foutmeldingen identificeren het veld én beschrijven de oplossing (3.3.1, 3.3.3)
- [ ] **[P2]** Radio/checkbox-groepen in `fieldset` met `legend`
- [ ] **[P2]** Eerder ingevoerde info wordt niet onnodig opnieuw gevraagd (3.3.7 Redundant Entry — nieuw in 2.2)
- [ ] **[P2]** Geen cognitieve test (puzzel) als enige authenticatie-stap (3.3.8 Accessible Authentication — nieuw in 2.2)

## 9. Structuur & semantiek (steekproef)
> WCAG 1.3.1, 2.4.2, 2.4.6, 2.4.10

- [ ] **[P1]** Precies één `<h1>` per pagina; headings slaan geen niveaus over (1.3.1)
- [ ] **[P1]** Paginatitel is uniek en beschrijvend (2.4.2)
- [ ] **[P2]** Koppen en labels zijn beschrijvend (2.4.6)
- [ ] **[P2]** `lang`-attribuut op `<html>` klopt (3.1.1)

---

## Resultaat noteren

Tel per severity de ❌-fails. Manual-score = `passes / (passes + fails) × 100`.
Vul die in de Health Score-tabel van het rapport in onder "Handmatige checklist" en
herbereken de composite met weging **Lighthouse 40% / axe 40% / manual 20%**.

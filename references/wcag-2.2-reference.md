# WCAG 2.2 — beknopte criteria-referentie (A/AA)

Voor het correct citeren van success criteria (SC) in bevindingen. Volledige tekst:
https://www.w3.org/TR/WCAG22/ · Begrijpelijke uitleg: https://www.w3.org/WAI/WCAG22/Understanding/

## Nieuw in WCAG 2.2 (let hier extra op — scanners dekken ze nauwelijks)

| SC | Niveau | Naam | Kern |
|---|---|---|---|
| 2.4.11 | AA | Focus Not Obscured (Minimum) | Het gefocuste element mag niet (volledig) verborgen zijn achter sticky headers/footers |
| 2.4.12 | AAA | Focus Not Obscured (Enhanced) | Idem, volledig zichtbaar |
| 2.4.13 | AAA | Focus Appearance | Focus-indicator min. grootte/contrast |
| 2.5.7 | AA | Dragging Movements | Sleep-acties hebben een single-pointer alternatief |
| 2.5.8 | AA | Target Size (Minimum) | Klikdoelen ≥ 24×24px of voldoende spacing |
| 3.2.6 | A | Consistent Help | Hulp-mechanismen op consistente plek |
| 3.3.7 | A | Redundant Entry | Vraag eerder ingevoerde info niet opnieuw |
| 3.3.8 | AA | Accessible Authentication (Min.) | Geen cognitieve puzzel als enige login-stap |

> SC 4.1.1 (Parsing) is in 2.2 **verwijderd** — negeer verouderde meldingen daarover.

## Veelvoorkomende criteria (mapping naar axe-regels)

| SC | Naam | Typische axe-regel(s) |
|---|---|---|
| 1.1.1 | Non-text Content | `image-alt`, `input-image-alt`, `area-alt`, `object-alt` |
| 1.3.1 | Info and Relationships | `label`, `list`, `definition-list`, `th-has-data-cells`, `aria-required-children` |
| 1.3.5 | Identify Input Purpose | `autocomplete-valid` |
| 1.4.1 | Use of Color | _(handmatig)_ |
| 1.4.3 | Contrast (Minimum) | `color-contrast` |
| 1.4.4 | Resize Text | _(handmatig — zoom)_ |
| 1.4.10 | Reflow | _(handmatig — 400% zoom)_ |
| 1.4.11 | Non-text Contrast | _(deels handmatig)_ |
| 1.4.12 | Text Spacing | _(handmatig)_ |
| 2.1.1 | Keyboard | _(handmatig)_ |
| 2.4.1 | Bypass Blocks | `bypass`, `skip-link`, `region` |
| 2.4.2 | Page Titled | `document-title` |
| 2.4.3 | Focus Order | _(handmatig)_ |
| 2.4.4 | Link Purpose | `link-name` |
| 2.4.6 | Headings and Labels | `empty-heading`, `heading-order` (deels) |
| 2.4.7 | Focus Visible | _(handmatig)_ |
| 3.1.1 | Language of Page | `html-has-lang`, `html-lang-valid` |
| 3.3.2 | Labels or Instructions | `label`, `form-field-multiple-labels` |
| 4.1.2 | Name, Role, Value | `button-name`, `aria-*`, `link-name`, `select-name` |
| 4.1.3 | Status Messages | `aria-live` _(deels handmatig)_ |

_(handmatig)_ = niet betrouwbaar te scannen → zie `manual-checklist.md`.

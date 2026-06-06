# Severity-mapping & scoreberekening (single source of truth)

De scanner en SKILL.md gebruiken deze definities consistent. Wijzig hier als je wilt
afwijken; `lib/util.mjs` (`AXE_IMPACT_TO_SEVERITY`) en `lib/merge.mjs` implementeren ze.

## axe impact → P-severity

| axe impact | Severity | Betekenis |
|---|---|---|
| `critical` | **P0** | Blokkeert taakvoltooiing voor gebruikers van hulptechnologie |
| `serious`  | **P1** | WCAG AA-overtreding; fix vóór release |
| `moderate` | **P2** | Echt probleem, maar er is een workaround |
| `minor`    | **P3** | Afwerking |
| _(geen impact / onbekend)_ | **P2** | Veilige default |

Lighthouse geeft geen impact-niveau. Lighthouse-only bevindingen (audits die axe niet
rapporteerde) krijgen default **P2** en worden gemarkeerd `bron: lighthouse`.

**HTMLCS (HTML_CodeSniffer — tweede engine).** Geeft ook geen impact-niveau; alleen
**Errors** (type 1) worden als bevinding gerapporteerd (Warnings/Notices zijn te ruis-gevoelig
en worden overgeslagen). Een Error = een definitieve overtreding → default **P1**. HTMLCS draait
geïnjecteerd in dezelfde Playwright-pagina als axe, dus op identieke DOM.

## Cross-engine bevestiging

axe en HTMLCS emitteren beide een WCAG success criterion per bevinding. Een issue heet
**bevestigd (✓)** wanneer ≥2 engines dezelfde **(WCAG-SC, pagina)** vlaggen — dat zijn de
high-confidence issues. Een issue dat maar door één engine wordt gezien krijgt **⚠ — handmatig
verifiëren** (elke engine heeft eigen false positives én blinde vlekken; bv. HTMLCS traverseert
geen same-origin iframes, axe wél). Het rapport toont per bevinding welke engines hem bevestigden
en een telling bovenaan. Zet HTMLCS uit met `--no-htmlcs`.

## De-duplicatie

axe- en Lighthouse-bevindingen worden samengevoegd op sleutel `(ruleId, page)`. Omdat
Lighthouse axe-regels intern hergebruikt, hebben overlappende issues dezelfde `ruleId`
(bv. `color-contrast`, `image-alt`) en tellen ze één keer.

## Composite Health Score

```
composite = 0.40 × Lighthouse-a11y-score
          + 0.40 × axe-pass-rate
          + 0.20 × handmatige-checklist-score
```

- **Lighthouse-a11y-score**: gemiddelde van de per-pagina 0–100 scores.
- **axe-pass-rate**: gemiddeld over pagina's van `passes / (passes + violations) × 100`.
- **handmatige-checklist-score**: `passes / (passes + fails) × 100` uit `manual-checklist.md`.

Ontbreekt een component (bv. `--no-lighthouse`, of de standalone-scan zonder handmatige
invoer), dan wordt **gehernormaliseerd over de aanwezige componenten**. De standalone CLI
laat `manual` dus leeg; de skill-flow vult die in en herberekent.

> ⚠️ Een hoge automatische composite zónder ingevulde handmatige checklist is misleidend —
> rapporteer dat expliciet, vier het niet.

## Bands

| Composite | Band |
|---|---|
| 90–100 | Uitstekend |
| 75–89  | Goed |
| 60–74  | Acceptabel |
| 40–59  | Matig |
| 0–39   | Kritiek |

## CI / quality-gate

`--fail-on <P0|P1|P2|P3>` (default **P1**): de scanner exit met code 1 zodra er een issue is
met severity ≤ de drempel. Zo blokkeer je een deploy bij P0/P1-overtredingen.

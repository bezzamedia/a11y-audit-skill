# Remediation — Next.js (App Router / React)

Concrete fixes voor de meestvoorkomende axe-bevindingen in Next.js-projecten.

## `image-alt` / `input-image-alt`
- `next/image` vereist `alt`. Informatief → beschrijvend; decoratief → `alt=""`.
```tsx
<Image src={src} alt="Fysiotherapeut begeleidt oefening" width={640} height={420} />
<Image src={deco} alt="" aria-hidden />        // decoratief
```

## `link-name` / `button-name`
- Icon-only links/knoppen hebben geen tekst → geef een toegankelijke naam.
```tsx
<Link href="/contact" aria-label="Contact"><PhoneIcon aria-hidden /></Link>
<button aria-label="Menu sluiten"><XIcon aria-hidden /></button>
```
- Gebruik géén `<div onClick>`; gebruik `<button>` of `<Link>` (lost ook `jsx-a11y` warnings op).

## `color-contrast`
- Tailwind: vermijd `text-gray-400` voor informatieve tekst; gebruik `text-gray-600`/`-700`.
- Controleer je merk-/themakleuren tegen de achtergrond op ≥ 4.5:1 (normale tekst) / ≥ 3:1 (grote tekst en UI-randen).

## `heading-order` / `empty-heading`
- Eén `<h1>` per page (meestal in de page-component, niet in een gedeelde layout).
- Sla geen niveaus over; gebruik styling i.p.v. een verkeerd heading-niveau te kiezen.

## `label` (formuliervelden)
```tsx
<label htmlFor="email">E-mail</label>
<input id="email" name="email" type="email" required aria-describedby="email-err" />
<p id="email-err" role="alert">Vul een geldig e-mailadres in.</p>
```

## Focus bij route-wissel (SPA — 2.4.3 / 4.1.3)
App Router herlaadt de pagina niet; verplaats focus/aankondiging bij navigatie.
```tsx
'use client'
// in een client component die op pathname luistert:
const pathname = usePathname()
useEffect(() => { document.getElementById('main')?.focus() }, [pathname])
// <main id="main" tabIndex={-1}> in de layout
```

## Focus-trap in modals (2.4.3 / 2.4.11)
- Trap focus binnen de dialog, Escape sluit, focus keert terug naar de trigger.
- Overweeg een geteste primitive (Radix `Dialog`, React-Aria) i.p.v. zelfbouw.
- Let op 2.4.11: zorg dat sticky headers de gefocuste elementen niet afdekken.

## Live regions (4.1.3)
```tsx
<div aria-live="polite" className="sr-only">{statusMessage}</div>
```

## `html-has-lang`
```tsx
// app/layout.tsx
<html lang="nl"> … </html>
```

## `eslint-plugin-jsx-a11y`
Zet bestaande `warn`-regels stapsgewijs op `error` zodra de backlog leeg is, zodat
regressies de build breken.

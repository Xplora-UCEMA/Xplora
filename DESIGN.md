---
name: Xplora — Startup Day recap
description: Post-event page inside the shared Xplora shell.
colors:
  purple: "#603ef9"
  lilac: "#c4b5ff"
  paper: "#faf8f5"
  ink: "#1a1028"
  night: "#0b0712"
  muted-ink: "#685d74"
typography:
  display:
    fontFamily: "Glacial Indifference, sans-serif"
    fontWeight: 700
  headline:
    fontFamily: "Glacial Indifference, sans-serif"
    fontSize: "clamp(36px, 4.6vw, 64px)"
    fontWeight: 400
    lineHeight: 1.18
    letterSpacing: "-0.015em"
  subheading:
    fontFamily: "Glacial Indifference, sans-serif"
    fontWeight: 400
    lineHeight: 1.24
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Poppins, sans-serif"
    fontSize: "14px"
    lineHeight: 1.65
rounded:
  control: "10px"
  play: "50%"
spacing:
  minimum-gutter: "clamp(20px, 4vw, 72px)"
  section-mobile: "84px"
  section-tablet: "96px"
  section-desktop: "120px"
  rail-mobile: "18px"
  rail-desktop: "24px"
components:
  watch-primary:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "14px 22px"
  text-link:
    padding: "13px 0"
  rail-control:
    rounded: "{rounded.control}"
    width: "46px"
    height: "46px"
  preview-toggle:
    textColor: "{colors.paper}"
    rounded: "{rounded.control}"
    width: "44px"
    height: "44px"
---

# Design System: Xplora — Startup Day recap

## Overview

**Creative North Star: "El registro de un encuentro"**

The Startup Day recap is part of Xplora. It reuses `SdShell` for the same club header and footer, with Startup Day active and the “Sumarme” community action. This document covers the recap content and its integration with that shell; it does not redesign the main site, admin, APIs, or archived floor experience.

Real event media, regular headings, and open layouts form a photographic journal. Shared Glacial/Poppins typography, ink, cream, purple wash, and softly rounded controls keep the journal recognizably Xplora. The route strategy lives in its surface brief.

**Key Characteristics:**

- Shared Xplora navigation, footer, tokens, and hero grid; a wider recap body.
- Bold Glacial hero, regular section headings, and Poppins reading text.
- Mobile-first photographs and native horizontal rails.
- Silent previews that play only while relevant and visible.
- Content and manual controls available with reduced motion.

Evidence: `SdShell.tsx`, `startupDay.css`, `StartupDay.tsx`, `startupDayRecap.css`, `useRecapMotion.ts`, `RecapVideoPreview.tsx`, and `RecapMediaDialog.tsx`.

## Colors

### Primary

The recap inherits `--sd-purple` and `--sd-purple-lift`. Purple supplies accents and the soft radial wash over ink in the film and community sections. This wash is an intentional part of Xplora's existing identity. Use the shared RGB variables for translucent purple instead of introducing another hue.

### Neutral

Cream and ink form the reading pair; the deeper void supports media and the viewer. The hero uses an image overlay to keep its title, metadata, and action readable. Keep photographs in their original colors.

**The Contrast Rule.** A token does not approve every pairing. Preserve readable text over photos and washes; never promote an animation's faint starting opacity into a resting text style. Sidecar tonal ramps are swatch previews, not approved text/background pairs.

## Typography

Use `--sd-font-display` and `--sd-font-body`; do not register a recap-only replacement family. Only the hero `#sr-title` uses weight 700 from the existing `GlacialIndifference-Bold.otf`; other headings retain Glacial Indifference Regular at 400, and body/control text is Poppins. Section headings use the smaller fluid ramp recorded above, with local editorial exceptions in the stylesheet. The unchanged Glacial asset contains the required accented glyphs; the h2 and h3 line heights and tracking give them room to read clearly.

The hero always reads “Startup Day.” across two lines in a left-aligned content area capped at 720px. Preserve its original photograph, Glacial font, and title sizes: `clamp(88px, 23vw, 172px)`, then `clamp(128px, 12vw, 172px)` from 1000px. Line height is 0.74 and the second line has a −0.11em top margin. The supporting line and white viewing CTA follow the shared grid. Body copy remains specific Argentine Spanish.

**The Regular Type Rule.** Preserve Glacial headings at 400, except the hero `#sr-title` at 700, with normal style and the shared typography. Do not add italic flourishes, arbitrary bold emphasis, or oversized all-caps titles to restyle the recap.

## Layout

Mobile is the starting layout. The shell owns its responsive navigation. The approved hero retains the shared 1320px grid through `--sr-hero-gutter`. Body sections use `--sr-gutter`: `clamp(20px, 4vw, 72px)` plus half the viewport width beyond 1920px. This yields 1776px of content at 1920px and caps further expansion.

The film title is “Así se vivió Startup Day.” above a centered 9:16 video capped at 380px. From 1000px two photographs flank the video. Its single viewing CTA overlays the preview. Gallery photos occupy 92% of the native mobile rail, then two equal columns from 600px. Voices form four equal columns from 1000px. Preserve normal scrolling and touch gestures, the portrait mobile hero, and uncropped original media in the full-screen viewer.

## Elevation & Depth

Hierarchy comes from dark/cream sections, the inherited purple wash, photos, spacing, and thin dividers. Use the existing shell treatment for navigation; do not restore a second recap header, menu, or footer.

One `IntersectionObserver` owns the section entrances and stops observing each revealed element. GSAP handles their animation; ScrollTrigger remains for continuous hero, reading, and film-frame motion. Each video preview has its own visibility observer, accounting for clipped horizontal rails. Fine-pointer hovers provide small transforms.

**The Available Without Motion Rule.** Reduced motion leaves content and controls available, disables reveal effects, and retains video posters until manual play. Keep native scrolling and the visible playback controls; do not add scroll hijacking or mobile pinning.

## Shapes

Photo frames, video previews, event thumbnails, rail controls, and the primary watch action inherit the shared 10px radius. Circular play marks remain a local media affordance where the source uses them; they are not the shape for every control. Text filters use an active underline rather than decorative badges.

## Components

### Shared shell and actions

Render the recap inside `SdShell`, with the common header/footer and “Sumarme” CTA. Preserve active-site state, club links, social links, newsletter, and cross-host URL helpers. Changes to these shared components must continue to work on the main site.

The primary viewing action is a cream/white rounded rectangle with an inline play icon. Text links use an underline and SVG arrow. Keep clear labels, visible keyboard focus, and at least 44px targets for controls.

### Photos and video previews

Edit photo categories, captions, speakers, and press records in `src/data/startupDayRecap.ts`. Supply accurate alts, responsive 640/1280/1920 photos, matching posters, photographer credits, and source URLs/IDs in `src/public/recap/media-manifest.json`.

`RecapVideoPreview` plays silent loops when at least 30% visible. The four talks and two press pieces use separate 8-second optimized files; the film uses its existing 10-second loop. Off-screen previews, previews in a hidden tab, and previews behind an open modal pause and detach their source. Retain the independent pause/play and open controls.

Reduced motion, data saving, and 2G connections keep posters until explicit manual play. Browser autoplay rejection must retain a usable manual control. Full recordings are not preview sources.

### Full-screen viewer

A full recording loads only after its dialog is opened and starts muted, with native controls for sound and playback. The native dialog contains focus, restores the opener, locks/restores scrolling, pauses video on close, and supports Escape. Photos support previous/next arrows. Preserve original proportions and readable media-error recovery.

### Content integrity and archive

The voices rail contains talk excerpts, not attendee testimonials. Add genuine testimonials only with a verified original recording or attributable statement; preserve identity and wording and never invent opinions.

Keep section copy brief and use the exact centered press heading “Xplora en los medios”. Photo source credit stays a short caption. Press items retain links to original coverage. Other events use short display titles while accessible links retain original CMS titles; preserve CMS ownership and loading/error/empty states. Attendance is a sourced aggregate; the accreditation workbook and personal attendee data stay outside public content and the repository.

Keep the gallery inside the site, without an external album CTA or Drive/Docs links. Exclude Drive/Docs recording links when selecting other events from the CMS; preserve their images and other valid recording URLs.

## Do's and Don'ts

### Do:

- Do reuse the shared Xplora shell, tokens, fonts, and approved hero grid, with the wider recap body.
- Do keep mobile browsing, keyboard access, and manual playback usable.
- Do use real event media with source provenance and optimized previews.
- Do keep the existing purple wash and text contrast working together.

### Don't:

- Don't restore a separate recap header/footer or introduce a competing identity.
- Don't autoplay full recordings in cards or let hidden previews keep decoding.
- Don't fabricate testimonials, coverage, attendance, or future event dates.
- Don't canonize faint animation states or tiny metadata as reusable reading defaults.

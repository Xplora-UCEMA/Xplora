---
version: 1
slug: "src-pages-xplorasite-tsx"
primary_target: "src/pages/XploraSite.tsx"
related_targets: ["src/styles/xploraSite.css","src/components/xplora/XploraInteract.tsx","src/components/xplora/XploraNewsletterForm.tsx","src/components/startup-day/SdShell.tsx","src/public/images/home/media-manifest.json"]
---

# Xplora main landing refinement

## Scope and mode

Refinement of the main Xplora landing, explicitly authorized in the latest user request. Preserve its shared `SdShell` header/footer, club navigation, community links, Glacial/Poppins typography, cream/ink/purple palette, and existing section structure. This surface brief supplements the recap-specific `DESIGN.md`; it does not replace that document or extend the work to admin or APIs.

## Audience and job

Mobile visitors discover the club, see real activity, revisit Startup Day, recognize participating companies, and join the newsletter or community.

## Media and hierarchy

The hero uses the original CMS-managed photograph (`heroUrl`, with the existing carousel/local fallback). The user authorized restoring it when the supplied 960 × 1280 portrait did not retain sufficient quality as a wide background. Keep the full-bleed photograph with text above it, as on Startup Day and Sponsors; do not split the hero into columns. Use proportional cover framing at `center 35%` and maintain text contrast. The supplied team portrait remains in the media assets but is not the active hero.

The Startup Day recap section uses the separate photographs numbered 8 and 33: `/images/home/startupday-charla-*` and `/images/home/startupday-encuentros-*`. These show an audience and a conversation at a stand and are distinct from the recap page's imagery. Retain responsive sources, descriptive alts, and the provenance recorded in the home media manifest. Its action opens the existing Startup Day recap through the shared host helper.

## Companies, FAQ, and newsletter

Keep the existing company catalog in a restrained logo grid: five columns on desktop and two on mobile. The user explicitly approved monochrome logos through a grayscale filter, returning to their original color on hover. Globant uses `/logos/startup-day/globant.webp`; do not replace the catalog with the full event sponsor list or add decorative cards around every logo. The participation action belongs below the logos, alongside “¿Tu empresa en Xplora?”, as a quiet purple text button with an arrow. Preserve its existing sponsor inquiry dialog; do not place a filled CTA in the section heading.

The FAQ places its title bar above a centered list capped at 1120px. Keep one answer open at a time, a lilac background on the active question, and animated expansion with a reduced-motion alternative. Preserve button semantics, expanded state, question/answer associations, keyboard access, and the community link for other questions.

The newsletter uses photograph 91, `/images/home/startupday-proyectos-*`, as its background with an overlay and text above it. Its inline signup has two steps: email first, then the remaining fields. Send the POST only after all five fields are valid: email, name, surname, university, and degree. Preserve the existing subscription endpoint and success/error handling. Retain `#newsletter` and the arrival behavior that resolves cross-page hash links after loading without repeating the jump on later renders.

## Motion and shared identity

Keep the shared loader and pixel-wave entrance, restrained reveals, and reduced-motion alternatives. Header/footer remain the same shared components used by Startup Day. Responsive imagery and clear reading order take precedence over additional animation.

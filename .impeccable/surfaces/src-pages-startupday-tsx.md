---
version: 1
slug: "src-pages-startupday-tsx"
primary_target: "src/pages/StartupDay.tsx"
related_targets: ["src/styles/startupDayRecap.css","src/components/startup-day/recap","src/data/startupDayRecap.ts"]
---

# Startup Day post-event recap

## Scope and mode

Experience. The recap lives inside the same Xplora `SdShell` header/footer, with Startup Day active and “Sumarme” linking to the community. Preserve the main site and its shared navigation, footer, and working cross-host links.

## Audience and job

Mobile visitors revisit or discover the event through real photographs, talk excerpts, the recap film, and external coverage. The main action opens the full recap; other actions browse media, explore the event archive, and reconnect with Xplora.

## Direction

A photographic journal aligned with the current main-site identity: Glacial/Poppins type, left-aligned “Startup Day.” hero, white viewing CTA, ink/cream sections, the shared purple wash, and 10px corners. Only the hero `#sr-title` uses weight 700 from the existing `GlacialIndifference-Bold.otf`; all other headings remain 400. Within the shared 1320px hero grid, cap the content at 720px and keep the title always on two lines. Preserve the original photograph, Glacial font, and title sizes: `clamp(88px, 23vw, 172px)`, then `clamp(128px, 12vw, 172px)` from 1000px; use line height 0.74 and a −0.11em second-line top margin. The unchanged Glacial font has valid accented glyphs; h2 uses line height 1.18/tracking −0.015em and h3 uses 1.24/−0.01em for readability.

Body gutters are `clamp(20px, 4vw, 72px)`, adding half the excess viewport beyond 1920px: 1776px of content at that width. The film heading is “Así se vivió Startup Day.” above a centered native 9:16 video capped at 380px, with a single overlay viewing CTA. Two photographs flank it from 1000px. The gallery retains its 92% mobile rail and uses two equal columns from 600px; voices use four equal desktop columns. Silent videos add movement without starting sound or hijacking navigation.

## Interaction contract

The recap uses the shared `StartupDayLoader` and `SdPixelWave` entrance. Start reveal animations and visibility-based video previews only after the pixel wave has actually completed; retain the bounded recovery path if the transition is interrupted. Reduced motion skips this entrance and makes content available immediately, while video previews retain their manual-play behavior.

One IntersectionObserver triggers section reveals; GSAP/ScrollTrigger handles their animation and continuous scroll progress. Per-preview observers start optimized loops when visible and pause/unload them off-screen, in a hidden tab, or behind an open modal. Talk/press loops are 8 seconds; the film loop is 10 seconds.

Keep posters until manual playback with reduced motion, data saving, or a slow connection. Keep pause/play controls available. Opening the native dialog loads the full recording and starts it muted; native controls allow sound. Preserve focus, keyboard navigation, original proportions, and failure states.

## Content maintenance

The closing community section invites newsletter signup with “En el próximo, enterate antes.” and the host-confirmed fact that the first 150 attendees received a complimentary credential at this edition. Its primary CTA opens the existing Xplora newsletter form through `mainSiteUrl()#newsletter`; preserve the social links. This is a past-event fact, not a promise of gifts at future events.

Edit photo and video records in `src/data/startupDayRecap.ts`. Keep responsive media, previews, posters, and source provenance in the public recap folder and manifest. Preserve CMS ownership of the other-event archive.

Other events prioritize the published upcoming/new catalog; show the archive only when no upcoming event remains, never alongside upcoming cards or as an API-error fallback. Exclude completed events and the concluded Startup Day 2026 edition by its ID. Dates without a year use the current year without rolling past dates forward; published announcements without a concrete date remain eligible. Use valid registration links for upcoming events, or the existing newsletter when no link is available.

The gallery stays inside the site with no external album CTA or Drive/Docs links. Filter Drive/Docs registration and recording URLs out of public actions without changing CMS data, images, or valid YouTube links.

Keep section copy brief, the prominent centered title exactly “Xplora en los medios”, and photo source credit in a short caption. Archive cards may show short display titles; accessible links retain original CMS titles. These layout and copy refinements leave the shared header/footer, reveal observer, and autoplay contract unchanged.

Talk excerpts are not testimonials. A future testimonial requires real media or an attributable statement with verified identity and exact wording. Do not invent opinions or copy personal accreditation data into the site.

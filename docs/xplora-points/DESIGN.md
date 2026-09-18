---
name: Xplora Points — Member account
description: Implemented member access, compact Points account, shared account states, access email, and Points admin extension.
colors:
  purple: "#603ef9"
  lilac: "#c4b5ff"
  paper: "#faf8f5"
  ink: "#1a1028"
  muted-ink: "#685d74"
  line: "#e4dfea"
  white: "#ffffff"
  notice: "#eee8ff"
typography:
  display:
    fontFamily: "Glacial Indifference, sans-serif"
    fontSize: "clamp(46px, 5.5vw, 72px)"
    fontWeight: 400
    lineHeight: 1.15
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Glacial Indifference, sans-serif"
    fontSize: "32px"
    fontWeight: 400
    lineHeight: 1.15
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Glacial Indifference, sans-serif"
    fontSize: "25px"
    fontWeight: 400
    lineHeight: 1.15
    letterSpacing: "-0.025em"
  body:
    fontFamily: "Poppins, sans-serif"
    fontSize: "14px"
    lineHeight: 1.65
  label:
    fontFamily: "Poppins, sans-serif"
    fontSize: "14px"
  empty-title:
    fontFamily: "Glacial Indifference, sans-serif"
    fontSize: "22px"
    fontWeight: 400
    lineHeight: 1.25
    letterSpacing: "-0.02em"
rounded:
  control: "10px"
  reward: "12px"
  panel: "16px"
spacing:
  mobile-gutter: "20px"
  access-gutter: "24px"
  section: "32px"
  rules: "48px"
  section-mobile: "38px"
  grid: "24px"
components:
  button-primary:
    backgroundColor: "{colors.purple}"
    textColor: "{colors.white}"
    rounded: "{rounded.control}"
    padding: "13px 21px"
  button-light:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "13px 21px"
  button-text:
    textColor: "#4a3196"
    padding: "8px 0"
  input:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "14px 15px"
  access-panel:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
    padding: "42px 36px"
  reward:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.reward}"
  notice:
    backgroundColor: "{colors.notice}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "20px"
  empty-state:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "0"
    padding: "24px 0"
---

# Design System: Xplora Points — Member account

## Overview

**Creative North Star: "Experiencias que suman."**

Xplora Points extends the existing cream, ink, purple, Glacial, and Poppins identity into four focused member views: Tasks, Recompensas, Rachas, and Movimientos. Tasks pairs the actual balance with available tasks; the other views retain a quiet text balance. Plain, left-aligned empty states use concise copy and a relevant action when one exists. The original Xplora compass artwork remains unchanged, with CSS 3D depth and randomized infinite floating motion; inside Points it appears only beside the Tasks balance.

This document records the implemented Points boundary: member access and confirmation, account overview and shell, the shared open account panels and empty states used by profile, events, proposals, and jobs, access email, and the Points section inside the existing admin. This is a narrow refinement grounded in the existing code and reviewed local captures, without an approved visual comp. The root Startup Day document is not the visual authority for member composition; unrelated page content and administrative surfaces retain their existing direction.

**Key Characteristics:**

- Regular Glacial headings and Poppins interface text.
- Cream reading surfaces, dark balance/access areas, and purple actions.
- Open lists and dividers around a small number of rounded panels.
- Four query-linked views, a compact Tasks balance, and native disclosures for secondary detail.
- Plain left-aligned empty states with concise copy, contextual actions, and no icons.
- The original compass face, a shaded 3D edge, and a smooth infinite floating motion.
- Explicit loading, eligibility, confirmation, delivery, and failure states.

Evidence: `src/styles/points.css` (loaded after `memberAccount.css`), `src/components/member/{MemberPoints,MemberTasks,MemberAccess,MemberArrow,PointMark,MemberOverview,MemberShell,MemberEmptyState,MemberEventsPanel,MemberProposalsPanel,MemberProfileForm}.tsx`, `src/pages/{MemberAccount,MemberConfirm,MemberJobs}.tsx`, `src/components/admin/PointsPanel.tsx`, and `server/src/services/member-access-email.ts`. Local review captures are `.impeccable/review/{tasks-1440,tasks-390,rewards-1440,rewards-390,streaks-1440,streaks-390,movements-1440,movements-390,empty-desktop,empty-mobile,user-1906,narrow-320,task-survey-mobile}.png`. These are test fixtures, not real account data. The actual user account had 20 points and no available tasks at handoff; do not infer published tasks from fixtures.

## Colors

### Primary

Purple identifies enabled actions, earned streak steps, the current multiplier, selected Points navigation, and positive ledger amounts. The Tasks wallet uses solid ink; access retains a softer purple wash over its deeper background (`#0b0712`).

### Secondary

Lilac marks the active account-navigation underline. Pale lilac groups notices and action forms. Empty states are transparent on the account canvas, and reward cards have no decorative ticket strip.

### Neutral

Paper is the account canvas and access-form surface. Ink carries headings and reading text; muted ink carries secondary explanations and dates. White distinguishes inputs and reward bodies; thin pale lines separate records. Error text uses `#a1273e`; success feedback uses `#215539` on `#e4f0e8`. Preserve written feedback alongside these colors.

The sidecar's synthesized tonal ramps are swatch previews, not additional implemented tokens or approved contrast pairings.

**The State Label Rule.** Explain unavailable actions in their labels; color alone does not communicate eligibility.

## Typography

Glacial Indifference Regular provides the access statement, greeting, section titles, reward names, balance, and multiplier. Poppins provides controls, explanations, dates, and lists. The account stylesheet overrides the older member font variables; preserve that import order.

The frontmatter display role describes the access statement, headline the greeting, and title the section headings. At the mobile breakpoint these become 42px, 28px, and 27px respectively. Shared account page titles are 32px, then 28px on mobile, with their inherited 1.1 line-height. The Tasks balance uses tabular numbers at 56px, then 48px on mobile, with 1.1 line-height. Tasks uses a 26px heading, while reward titles use 25px. These are observed roles, not a mathematical scale.

Shared empty-state headings use the frontmatter empty-title role at both sizes. Their Poppins copy stays 14px with 1.7 line-height and a maximum width of 62ch. Choose h2 for a page-level state and h3 inside an already labelled section; preserve visual consistency without skipping the semantic hierarchy.

Metadata varies from 11px to 13px in existing components; do not promote those sizes into the body default. The access code is 28px with 0.25em tracking and tabular numbers. Web headings remain regular; inherited account navigation is Poppins 600.

Email deliberately uses Arial/Helvetica/sans-serif throughout: a regular 36px heading, 16px body, bold 16px link action, and bold 32px code with 8px tracking. Its HTML must remain legible without web fonts or scripts.

## Layout

The account container is capped at 1152px including 24px side padding, with 32px top and 48px bottom padding. The sticky ink header retains the original brand image, account navigation, and sign-out action, a 72px minimum height, and 12px vertical padding. At 900px and below, the desktop links give way to a native details menu whose links open vertically below the header. At 360px and below only the brand wordmark hides; the original image and accessible Xplora link remain. At 640px and below, account gutters become 20px and main top/bottom padding becomes 16px/40px; the header uses 12px/20px padding. The greeting has 24px bottom spacing on desktop and 20px on mobile.

The Tasks wallet is a single flex row, with the balance on the left and original compass on the right. It uses 24px/30px padding, a 24px gap, and a 104px compass with 22px depth. At 640px it uses 20px padding, a 12px gap, and an 80px compass with 18px depth. No main reward, progress bar, or forced points target shares this panel.

Points navigation uses real links: Tasks at `/cuenta`, Recompensas at `/cuenta?vista=recompensas`, Rachas at `/cuenta?vista=rachas`, and Movimientos at `/cuenta?vista=movimientos`. Unknown view values fall back to Tasks. Navigation has a bottom divider, 48px targets, and a purple selected underline. Desktop gaps are 30px; mobile distributes the four links across the available width. Tasks rows separate title/date, points, and action into three columns; at 640px the action moves below the first two columns. Completed tasks remain under a native disclosure. Recompensas contains rewards and Mis canjes; Rachas contains the two streak explanations; Movimientos contains the ledger and older-record disclosure. Streaks stack at 640px. Reward cards use a simple white body with no ticket strip or coin. There is no generic registration iframe on the overview.

Profile, events, proposals, and jobs use open account panels: transparent background, no outer border or shadow, and no extra panel padding. Preserve the existing forms and populated item layouts within them. Proposals places the form and submission history in two columns (1.15:1), separated by a 40px gap and a thin line with 32px left padding on the history. At 640px this becomes a single column with a 28px gap and a top divider with 24px padding.

Shared empty states use one flexible text column, transparent background, no radius or icon, and 24px/0 padding, reduced to 20px/0 on mobile. Copy and optional action remain left aligned; the action has 12px top spacing and a 44px minimum target height.

Access is capped at 1120px with 24px page gutters and a two-column story/form composition (1.15:1). It stacks at 640px; the compass sits beside the introductory heading. The confirmation view centers a content block capped at 460px.

The shared public header exposes one account entry styled as a prominent button: “Iniciar sesión” when signed out, “Mi cuenta” when signed in. It replaces “Sumarme” on Xplora and Startup Day, leaving the three site links separate. It navigates in the current tab to the same account flow for registration and sign-in. On mobile the button remains visible, the site links occupy their own row, and the target is at least 44px tall. The existing sponsor action is preserved on the Sponsors page.

The Points admin panel belongs inside the existing admin shell. Its three-column field groups become one column at 640px; list actions then span the available width and section controls wrap. Email is a fluid presentation table capped at 560px with 16px outer side gutters and inline padding.

## Elevation & Depth

Surfaces use tone, spacing, borders, and the dark/purple wash rather than card shadows. Open account panels remove the inherited card shadow, and the header brand image has no glow filter. The compass preserves the original transparent WebP as its unfiltered front face. Eighteen cached copies form a shaded, bevelled edge under 560px perspective. Depth scales with the mark: 28px on the large access mark, 17px on mobile, and the wallet depths recorded in Layout. Static edge filters never alter the front artwork.

The compass is the shared Points coin icon. It moves continuously through randomized 3.2–5.2-second ease-in-out segments, each starting exactly where the previous one ended. Vertical-axis tilts alternate sides with 18–38 degrees of amplitude; the other axes vary within ±20 and ±12 degrees, and lift varies from 1–8%. Web Animations API animates only the body's transform, retiring each completed effect before advancing. IntersectionObserver and page visibility pause offscreen or hidden icons; reduced motion retains a static 3D pose. Primary and light buttons transition for 180ms, lift 2px on hover, and scale to 0.98 on press. Reduced motion disables button transitions and hover transform. No animation dependency, timers or frame-by-frame JavaScript is needed.

## Shapes

Main controls use the established control radius. Access and balance panels use the larger panel radius; rewards, action blocks, and the admin panel use the reward radius. Empty states have square, transparent boundaries. The account sign-out control retains its inherited 6px radius. Greeting profile pictures and initials are circular; the profile form retains its existing rounded avatar. Navigation selection is an underline; streak steps are straight top rules. Preserve each shape's existing role.

## Components

### Access, confirmation, and fields

One access form serves both account creation and sign-in. After sending, it shows the destination email, focuses the six-digit code field, exposes resend countdown and change-email actions, and keeps errors next to the form. Fields have a 48px minimum height, a pale border (`#cfc6dc`), white fill, and purple caret. Busy forms declare `aria-busy`; errors use alerts.

The separate link-confirmation screen requires an explicit button press. Its missing-token and busy states disable the action; errors preserve the option to request another link. Session failures provide retry and another-account actions.

### Buttons and navigation

Primary actions are purple. The wallet has no reward action. Text actions are underlined. Filled controls have a 48px minimum height; text actions, disclosure summaries, sign-out, and navigation targets preserve their implemented touch spacing. Keyboard focus uses a 3px `#9075ff` outline with a 4px offset. Disabled filled buttons use `#e5e0eb` with `#675b76` text.

Account navigation marks the current page with `aria-current` and a lilac bottom border; its mobile native details menu preserves keyboard operation. Points navigation separately uses `aria-current` and a purple underline for the selected view. Points admin section buttons use `aria-pressed`. Member arrows are decorative 18px inline SVGs, with straight and northeast paths; preserve their hidden accessibility semantics.

### Balance, streaks, and rewards

The Tasks balance pairs the exact formatted amount with the original compass, without reward progress or a prescribed goal. Rachas shows each streak's meaning and event count first: “Tus inscripciones” counts registered events attended, while “Eventos seguidos” requires successive Points calendar events. Five-step multipliers live inside “Ver multiplicadores” disclosures; “Cómo se calculan” explains the five-event cap, attendance-only application, non-additive multipliers, and confirmed absences.

Reward cards show title, conditions, cost, stock, and a contextual button label. Unavailable labels distinguish insufficient points, unconfirmed stock, exhausted stock, prior redemption, and program closure. Redemption opens an inline confirmation group explaining the debit and final delivery; busy state prevents a second confirmation. Success is announced, and the delivered code or instructions appear in Mis canjes.

A closed program shows “El programa finalizó. Los canjes están cerrados.” above the view navigation and disables rewards with “Programa finalizado”. A future closure shows the deadline. Preserve both notice and action state.

Before Points is installed, the account uses the shared plain empty state: “Tu cuenta ya está lista.”, “Xplora Points todavía no está habilitado.”, and a “Completar mi perfil” action. Never substitute a fictional zero balance or rewards for an unavailable program. The access page qualifies the welcome bonus as dependent on Points being enabled; access-only emails omit the bonus promise.

### Shared empty states and account panels

Use `MemberEmptyState` for a regular heading, concise explanatory copy, and optional action. It is a plain left-aligned block with no illustration, coin, or nested outer card. Explain what will appear and the next useful step; omit the action where no immediate action is available.

| Area | Heading | Next action |
| --- | --- | --- |
| Movements | “Todavía no hay movimientos” | “Ver Tasks” links to `/cuenta`. |
| Rewards | “Estamos preparando las recompensas” | No action; “Todavía no hay beneficios publicados.” |
| Redemptions | “Todavía no hiciste canjes” | No action; “Tus beneficios canjeados van a quedar acá.” |
| Events | “Nos vemos en el próximo encuentro” | “Explorar eventos” opens the public event section; copy explains matching the account email and recording attendance. |
| Proposals | “La próxima idea puede ser tuya” | “Escribir una propuesta” links to the existing title field. |
| Jobs | “Todavía no hay ofertas” | “Completar perfil” retains the existing profile action. |

Proposals keeps fetching, failure, and a successful empty result distinct: loading announces “Buscando tus propuestas…”, failure exposes an alert and “Reintentar propuestas”, and only a successful empty response shows the shared empty state. Existing submitted ideas remain visible after a refresh failure. Do not communicate a request failure as an empty history.

### Records, actions, and admin

Movements and redemptions are plain separated lists, with dates, signed amounts, and wrapping delivery text. The Movimientos view shows the first three returned records immediately and puts the remainder behind “Ver N movimientos anteriores”. Load failure offers retry. Tasks has separate loading, failure/retry, closed-program, and successful-empty states; an empty result says “No hay tareas disponibles por ahora.” Available event rows link to real future Points-event registration. Event-bound internal surveys require verified attendance and open an inline rating/feedback form with busy, error, success, and cancellation states; opening focuses its heading. Eligible Google Forms tasks open their connected responder link in a new tab with “Completar formulario” and the help “Usá el mismo correo de tu cuenta de Xplora.” The form must collect verified email matching the Xplora account. Returning focus or visibility reloads the account balance and task state; opening the link alone does not award points. Tasks does not publish QR, award, or private unscoped actions. The existing token-based claim flow remains separate from the task listing.

Admin forms retain labelled fields, local date/time inputs, inline feedback, real-stock instructions, and the existing confirmation dialog for closing attendance. Closed event policy fields and completed actions visibly disable. QR output wraps long URLs and constrains the image to the panel width. Documentation snippets show representative controls, not live administrative operations.

Inside Ops, Points opens on Tasks, followed by Eventos y rachas and Recompensas. “Crear tarea” is an initially open native disclosure that closes after successful creation. Google Forms is the default type; its edit-link field appears only for that type, and the explanation changes for internal surveys, QR, and verified awards. New Google Forms tasks remain paused. The list keeps connection and enabled/paused states explicit, disables “Habilitar” until connected, and labels expired actions “Vencida”.

Google Forms connection setup is an open, divider-bounded section while setup is needed. Its status distinguishes paused/unconnected, connected but awaiting enablement, and connected/enabled; after enablement it collapses into the native “Conexión habilitada · recuperar configuración” disclosure. “Pasos de conexión” is a secondary native disclosure. The visibly labelled “URL pública del backend” field accepts a public HTTPS origin without paths, credentials, query, or fragment; associated help explains the backend requirement, and validation uses an inline alert. “Descargar script privado” downloads the connector configuration, with a visible warning to keep its private key only in Apps Script. Recovery uses the existing confirmation dialog before replacing a connection, explains that replacement pauses the task and invalidates the old key, and requires installing the new script. This extends the existing Points controls and identity.

### Email and compass asset

The email repeats the ink header, purple access action, pale code field, and welcome-points band with presentation tables and inline styles. Keep the link and six-digit code as two access options with the single-use/expiry explanation. The email arrow is its existing text entity for client compatibility; the web uses SVG.

PointMark reuses `DEFAULT_LOGO_URL` for its unchanged front and eighteen decorative depth layers. All images have empty alt text and the wrapper is hidden from assistive technology. The sidecar documents its motion but does not redraw the raster as an invented SVG. Render the source component when the actual mark is needed.

## Do's and Don'ts

### Do:

- Do preserve regular Glacial headings, Poppins UI text, and the shared compass asset.
- Do retain mobile stacking, the native account menu, query-linked Points views, and visible keyboard focus.
- Do show eligibility, closure, confirmation, and delivery in readable text.
- Do keep the balance and available tasks in Tasks, and older movements and multiplier details behind native disclosures in their own views.
- Do distinguish Google Forms connection from task enablement, keep private setup behind native disclosures once active, and explain the matching account email beside the member task link.
- Do use the shared compact empty state with meaningful copy and a next action where one exists.
- Do keep the email usable with inline styles, presentation tables, and system fonts.

### Don't:

- Don't turn this account's composition into rules for the Startup Day recap or unrelated admin screens.
- Don't invent stock, balances, rewards, or decorative status badges.
- Don't add a main reward, forced points goal, progress bar, generic registration iframe, or repeated coins to the Points views.
- Don't redraw the logo or add cardinal lines; preserve the original artwork, 3D depth, infinite float, and reduced-motion support.
- Don't rely on motion, color, or remote fonts to explain an account state.
- Don't show a failed proposal request as an empty history or wrap open account panels in extra cards.

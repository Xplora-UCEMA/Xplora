---
name: Xplora signed-in member area
description: Scoped dark member interface for completing actions and managing Points.
colors:
  canvas: "#111015"
  surface: "#1c1a23"
  ink: "#f6f3fc"
  ink-soft: "#d7d1e3"
  muted: "#aba4ba"
  line: "#36313f"
  violet: "#c4b5ff"
  action: "#7048eb"
  action-hover: "#8057f1"
  action-text: "#fff"
  selected-filter: "#30263f"
  selected-text: "#ddd0ff"
  disabled: "#302b3b"
  disabled-text: "#b2a9c1"
typography:
  headline:
    fontFamily: "Glacial Indifference, sans-serif"
    fontSize: "42px"
    fontWeight: 400
    lineHeight: 1.15
    letterSpacing: "-.025em"
  title:
    fontFamily: "Glacial Indifference, sans-serif"
    fontSize: "36px"
    fontWeight: 400
    lineHeight: 1.2
    letterSpacing: "-.025em"
  task-title:
    fontFamily: "Poppins, sans-serif"
    fontSize: "16px"
    fontWeight: 500
    lineHeight: 1.4
  body:
    fontFamily: "Poppins, sans-serif"
    fontSize: "14px"
    lineHeight: 1.65
  button:
    fontFamily: "Poppins, sans-serif"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: 1.5
rounded:
  field: "10px"
  control: "12px"
  card: "16px"
  filter: "24px"
spacing:
  small: "8px"
  control: "12px"
  row: "16px"
  section: "24px"
  group: "32px"
components:
  button-primary:
    backgroundColor: "{colors.action}"
    textColor: "{colors.action-text}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "12px 18px"
  button-primary-hover:
    backgroundColor: "{colors.action-hover}"
    textColor: "{colors.action-text}"
  button-disabled:
    backgroundColor: "{colors.disabled}"
    textColor: "{colors.disabled-text}"
  task-card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.card}"
    padding: "22px"
---

# Design System: Xplora member area

## Overview

This document applies only to signed-in `/cuenta` routes and `/empleo`. Its surface mode is **Operate**, as recorded in `.impeccable/member-direction.md`. The approved world is dark and actions-first: matte violet-black ground, restrained violet controls, concise content, and real member data. It does not replace the root `DESIGN.md`, which describes Startup Day, or the public site, login, and Ops themes.

Authority: the user-approved member-actions direction, with the later explicit correction to **top website navigation**. The reference image's bottom app bar is superseded. Implementation evidence: `src/styles/memberPremium.css`, `src/styles/points.css`, and the MemberShell, MemberTasks, MemberPoints and PointMark components. Work remains local; this document does not authorize deployment.

## Colors

The frontmatter records implemented color values. Action violet marks primary buttons; pale violet identifies links, Points, and keyboard focus. Off-white is primary text, soft ink labels forms, and muted lavender supports dates and descriptions. Dark surfaces sit slightly above the canvas with quiet line borders. Apply the same treatment across profile, events, proposals, employment, rewards, streaks, and movements.

Errors use pink text on a dark rose surface; successful actions use mint text on dark green. Preserve visible text explaining each state rather than relying on color alone.

## Typography

Glacial Indifference supplies regular-weight display text; Poppins supplies body, controls, and task titles. The task heading steps from its desktop token to 38px below the 900px breakpoint. Page titles become 34px there. The greeting is deliberately smaller: 24px desktop, 23px on mobile, 20px at narrow widths. Task titles become 15px on mobile; descriptions use 12px with 1.6 line height. Form inputs remain at least 16px. Keep copy concrete and in Argentine Spanish.

## Layout

The website header contains the original logo, wordmark, and account menu. A separate, static top text navigation row contains Inicio, Eventos, and Beneficios. It remains above content on mobile. The account menu contains Mis Points, Mi perfil, Bolsa de empleo, Eventos, Propuestas, and Cerrar sesión.

Desktop content is centered at a 960px maximum width with 40px 32px 64px padding. At 900px and below, it uses a 640px maximum width, 28px top padding, 20px horizontal padding, and bottom safe-area allowance. At 360px and below, horizontal padding drops to 16px. The account menu scrolls within the viewport.

On Inicio, the compact greeting and balance precede the task list. Disponibles and Completadas filters precede cards with icon, title/date, Points, and a full-width action underneath. Rewards, streaks, and movement links follow the tasks in normal document flow; they are not a fixed bottom navigation bar. Mobile task cards use 18px 16px padding and a flexible middle column.

Verification baseline: Chrome-emulated widths 320, 375, 390, 430, 844 and 1440px; height 844px except landscape 844×390. The five-route matrix covers `/cuenta`, `/cuenta/perfil`, `/cuenta/eventos`, `/cuenta/propuestas` and `/empleo`, asserting no horizontal overflow, inputs at least 16px, and static primary navigation. These are emulated viewport checks, not physical-device certification. At handoff, all 20 Playwright tests, 51 unit/service tests, test typechecking, and production build passed. Browser coverage also exercises tasks, surveys, redemption, Google Forms links, rewards, streaks, and movements.

## Elevation & Depth

Cards and primary buttons are flat, distinguished by tone and a one-pixel border. The account dropdown alone uses an overlay shadow (`0 18px 40px #0006`). Keep the original 3D compass once in the Inicio balance: 42px desktop with 8px depth, 34px mobile with 6px depth. It is decorative and hidden from assistive technology. Motion pauses outside the viewport or when the document is hidden and becomes a static pose with reduced motion; do not multiply this animation across cards.

## Shapes

Use softly rounded cards, compact rounded controls, pill filters, and a circular account initial. Radius roles are defined in the frontmatter. Inputs have a one-pixel border; primary buttons have a minimum height of 48px. Navigation, filters, and secondary actions provide at least 44px targets. Preserve wrapping for long names, labels, and task titles.

## Components

- **Primary actions:** full-width within task cards; hover changes color without movement; disabled states remain legible. Preserve real eligibility and busy states.
- **Task filters:** text buttons with `aria-pressed`, a quiet filled selected pill, and a completed count only when nonzero. Available, registered, pending, and completed task states retain their actual meaning.
- **Forms:** dark fields, visible labels, 16px text, and 48px minimum field height. Keyboard focus uses a two-pixel pale-violet outline with four-pixel offset; file controls expose a focus-within outline.
- **Navigation:** real links with current-page semantics, an accessible native account disclosure, a skip link, and a focusable main region. No fixed bottom app bar.
- **Feedback:** concise loading, error/retry, success, unavailable, closed-program, and empty states. Empty panels are left aligned; do not populate them with invented activity.
- **Points and redemption:** retain actual balance, task claims, reward eligibility, explicit redemption confirmation, and delivery history. Selecting a survey focuses its heading; cancellation returns focus to the task heading.

## Do's and Don'ts

- Do preserve the original logo and single compass balance treatment.
- Do keep real tasks prominent and preserve existing task, Points, and redemption behavior.
- Do verify keyboard use, reduced motion, long content, and the responsive matrix after relevant changes.
- Don't introduce a principal reward, goals, invented activity, or promotional filler into this member world.
- Don't replace the top website navigation with a mobile app bar.
- Don't apply these dark scoped rules to Startup Day, the public site, login, or Ops, and don't deploy without a separate instruction.

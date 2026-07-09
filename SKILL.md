---
name: motomaniafrontend
description: Audit, measure, plan, implement, and validate professional Motomania Web frontend/UI work. Use when Codex is asked to review, polish, modernize, align, fix, or build Motomania Web screens, precise grid/layout alignment, sidebars, cards, product grids, tables, buttons, visible copy, colors, light/dark mode, responsive behavior, screenshots, legacy CSS cleanup, or frontend documentation updates.
---

# Motomania Frontend

## Purpose

Use this skill as the senior UI workflow for Motomania Web. Work from
measurements, not taste: audit the current UI against a durable grid contract,
explain the plan, execute the smallest useful alignment change, then validate in
browser and docs when repo behavior changes.

The skill applies to the whole app. No current screen is a permanent source of
truth. The source of truth is the measured contract: rails, stable controls,
bounded grids, realistic input sizing, and repeatable behavior after clicks.

The user's expectation is strict: frontend should not accumulate visual drift.
Moving between modules in the same family should feel like only the information
changed. Sidebars, title origins, cards, controls, and product grids must land
on coherent rails.

## Operating Modes

Decide the mode from the user's wording:

- If the user says "hablemos", "revisemos", "no edites", "solo consulta",
  "solo audita", "que opinas", or "vale la pena", stay read-only. Inspect
  enough code/UI to give a grounded opinion, then stop before edits.
- If the user says "hazlo", "corrigelo", "actualiza", "pulir", or gives a
  concrete UI defect, audit first, then implement within scope.
- If the user says "microfix", edit only after concrete runtime or rendered UI
  evidence. Weak grep hits become "observacion no corregida".
- If the task is to update this skill itself, read `skill-creator`, edit only
  the skill files, and validate the skill folder. Motomania repo docs are not
  required unless the repo's frontend contract also changes.
- If the user says "Listo guarda esto en skill frontend motomania" or similar,
  extract the reusable placement rule from the approved work and store it in
  `references/owner-placement-preferences.md` using
  `scripts/remember_frontend_preference.py`.

## Required Entry

Before proposing or writing MotomaniaWeb repo changes, verify the original
workspace:

```powershell
powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -File .\ejecutar_local\verificar_workspace_original.ps1
```

If that fails, stop. Do not edit a dated Codex copy, extracted ZIP, or temporary
clone.

For functional or technical repo changes, read proportionally:

- `AGENTS.md`
- `.github/copilot-instructions.md`
- applicable `.github/instructions/*.instructions.md`
- `docs/README.md`
- `docs/07_FRONTEND.md`
- `docs/12_GOTCHAS.md`
- the docs file for the module being touched
- `docs/10_FLUJOS.md` when the change affects an end-to-end flow

## Workflow

1. Establish scope:
   - identify route, template, permission, module group, data source, docs, and
     whether the data path is local JSON, SQL read-only, or writable
   - keep RMS, SQL writes, permissions, CSRF, and business contracts out of
     visual polish unless the user explicitly asks and the repo rules allow it
2. Audit before planning:
   - inspect shared shell/CSS before inventing a layout
   - render the route when possible
   - capture desktop/mobile and light/dark evidence for visual changes
   - use the static and grid-audit tools for alignment-sensitive work
   - when there are tabs, filters, segmented controls, accordions, or state
     buttons, run the interaction audit; the initial screenshot is not enough
3. Plan from evidence:
   - list findings by severity and visible impact
   - separate layout, typography, color, responsive, scroll, controls, states,
     implementation, docs, and validation
   - name what should stay unchanged because it is intentional
4. Execute conservatively:
   - reuse Motomania patterns first
   - organize existing pieces before adding containers
   - avoid nested cards, decorative effects, and per-module color themes
   - do not create a custom sidebar, color theme, button system, card system, or
     product grid when an existing Motomania pattern fits
   - keep routes, form fields, endpoint contracts, permissions, and data shape
     stable for UI-only work
5. Validate like a release:
   - run browser/render checks for affected routes
   - click the relevant states, tabs, filters, and action modes
   - test desktop/mobile and light/dark when styling changed
   - check overflow, contrast, button heights, text fit, and scroll ownership
   - run syntax/tests that reasonably cover the change
6. Update docs when repo behavior changes:
   - update the relevant module doc
   - update `docs/07_FRONTEND.md` for reusable frontend rules
   - add a new top entry in `docs/HISTORIAL_CAMBIOS.md`
   - update `ejecutar_local/empaquetar_update.bat` when top-level folders or
     deploy-relevant paths change

## Resource Routing

Read only what is needed:

- For the full workflow and documentation rules, read
  `references/workflow.md`.
- For shell, sidebars, cards, typography, buttons, tables, colors, and visible
  copy, read `references/ui-contract.md`.
- For strict alignment, dead-space control, anti-scroll rules, stable tabs,
  product grids, and measured tolerances, read `references/grid-contract.md`.
- For validation commands, screenshots, signed sessions, and script usage, read
  `references/validation.md`.
- For risky visual patterns to avoid, read `references/anti-patterns.md`.
- For owner-approved placement memory, read
  `references/owner-placement-preferences.md` before frontend layout work and
  before storing a new preference.

## Visual Principles

- Treat Motomania as an operational business tool: compact, legible, aligned,
  and efficient.
- Do not make marketing layouts, decorative heroes, or card-heavy decoration.
- Cards are not the task. Do not add cards just because a screen feels empty.
  First align existing titles, controls, rows, tabs, inputs, and grids.
- Do not put cards inside cards.
- Do not create new visual effects to solve organization problems.
- Prefer shared tokens and selectors in `base.html` or module CSS over one-off
  inline styles.
- Keep the Motomania red as the primary accent. Avoid per-module color themes
  unless the existing app already has a clear semantic reason.
- Keep visible text operational and human. Avoid exposing terms like RMS, SQL,
  JSON, API, logs, Batch, or ITL unless the operator truly needs them.
- In any sibling route family, navigation should keep title, cards, controls,
  and content origin aligned. The user should feel that only the data changed.
- Inputs must fit the realistic data size. Do not create 400 px textboxes for
  money, percentages, dates, counts, short statuses, or filters that rarely need
  that width.
- Avoid "stupid scroll": no horizontal scroll caused only by oversized inputs,
  long button labels, unnecessary columns, or empty spacing.
- If a grid/table scrolls horizontally because it is trapped in a narrow column,
  prefer giving the grid a full row and stacking secondary panels below.
- Long grids/lists should use internal scroll with about 10 visible rows unless
  the workflow truly requires full-page scanning.
- Tabs and segmented controls must have stable dimensions. Changing from one
  state to another must not move neighboring tabs, counters, or filters.
- Buttons inside cards are suspect: if the action belongs to the card, place it
  in a consistent header/footer/action rail; do not float it in the middle of
  the content.
- Light mode must be comfortable: no yellow on white, no pale green text on
  pale green backgrounds, and no low-contrast helper text.
- Buttons and inputs must keep stable dimensions so hover, labels, icons, and
  dynamic text do not shift layout.
- Long lists and matrices should scroll inside their working area when that is
  the natural workflow; do not let them grow the entire page endlessly.

## Known Traps

- `UI bugs/` is historical evidence, not a live work queue. Confirm against the
  current route/template/rendered UI before editing.
- A filename containing `legacy` is not proof it is dead. Prove active template
  references and packager inputs before deleting CSS or assets.
- Broad searches for technical terms often hit comments, logs, or internal
  strings. Separate operator-visible copy from implementation text.
- `docs/03_BACKEND_RUTAS.md` placeholders and old route counts are not UI bugs
  by themselves. Compare the semantic contract and current `url_map`.
- SQL timeouts during `create_app()` can be environment noise after routes are
  registered. Do not convert that into a frontend finding without a visible
  regression.
- Do not store a route or current module as a permanent comparison target. When
  the owner approves a UI result, store only the reusable rule.

## Skill Memory

The skill has memory for owner-approved placement behavior. This memory is not
for copying designs. It is for durable rules about alignment, sizing, tabs,
buttons, inputs, grids, scroll ownership, and hierarchy.

When the owner explicitly says to save a frontend lesson:

1. Identify the reusable rule behind the approved result.
2. Reject route-specific wording and decorative taste unless it is a real
   system constraint.
3. Add an anti-pattern if it prevents a repeated failure.
4. Add a validation sentence if the rule can be measured.
5. Run `remember_frontend_preference.py`.

```powershell
$skillRoot = 'C:\Users\luis1\.agents\skills\motomaniafrontend'
python "$skillRoot\scripts\remember_frontend_preference.py" `
  --category tabs `
  --title "Tabs estaticos por estado" `
  --rule "Tabs and segmented controls must keep the same width, height, and position when active state changes; only color or emphasis may change." `
  --avoid "Selected tabs that push counters or neighboring filters." `
  --validation "Run audit_layout_grid.mjs and confirm no tab-row-width-drift finding."
```

## Audit Checklist

For every affected view, collect:

- route, template, permission, module group, and relevant docs
- shell: top header, sidebar, main content width and padding
- title: origin, font size, line-height, subtitle, context mark
- KPI/cards: count, dimensions, alignment, rail, surfaces, shadows, gradients
- controls: button/select/input heights, widths by context, icon alignment
- text: card title, body, helper, table, chip, mobile row, mono data
- color: dark/light contrast, semantic tones, active states, warnings
- responsive: desktop, mobile, narrow breakpoint if applicable
- scroll: body overflow, inner scroll, sticky headers/columns
- states: empty, loading, error, success, disabled, dirty/unsaved, modal open
- implementation: inline styles, duplicated CSS, dead selectors, local JS
- docs: docs to update and validation evidence to record

## Script

Use the bundled tools; do not rely only on visual judgment.

### Static Contract Audit

Run before or during edits when templates/CSS/JS changed. It finds shell drift,
custom sidebars, inline styles, local gradients, nonstandard button heights,
hardcoded colors, and possible operator-visible technical terms.

```powershell
$skillRoot = 'C:\Users\luis1\.agents\skills\motomaniafrontend'
python "$skillRoot\scripts\static_ui_contract.py" `
  --root C:\Users\luis1\Documents\MotomaniaWeb `
  --changed-only `
  --fail-on none
```

### Store Approved Placement Preference

Use only after an explicit owner request to save the lesson:

```powershell
$skillRoot = 'C:\Users\luis1\.agents\skills\motomaniafrontend'
python "$skillRoot\scripts\remember_frontend_preference.py" `
  --category grids `
  --title "Grid operativo con scroll interno" `
  --rule "Operational grids should show a bounded work area of about 10 visible rows, then scroll internally instead of making the whole page endless." `
  --avoid "Page-length grids or horizontal scroll caused by avoidable spacing." `
  --validation "Grid audit should not report long-grid-without-internal-scroll."
```

### Layout Grid Audit

Run after the route can render. It checks button rows, tab stability, card rows,
input sizing, product/table columns, sidebars, title origins, horizontal
overflow, long-grid scroll ownership, narrow grids trapped in columns, dead
space, and produces clean/grid screenshots, visual red-box overlays, plus
JSON/HTML/MD evidence.

```powershell
$skillRoot = 'C:\Users\luis1\.agents\skills\motomaniafrontend'
node "$skillRoot\scripts\audit_layout_grid.mjs" `
  --base-url http://127.0.0.1:5059 `
  --cookie "<signed Flask session cookie>" `
  --route pantalla=/ruta-a-auditar `
  --out instance\validation\ui-grid `
  --fail-on P1
```

For sibling routes, pass all affected routes in one command so the audit catches
cross-route drift. Use `--compare` only when the user explicitly chooses a
comparison route for that single task.

### Interaction Audit

Run when filters, tabs, segmented controls, accordions, or state buttons change
visible layout. This clicks safe state controls one by one and catches controls
that resize the row, move neighboring buttons, move counters, introduce
overflow, or make a grid worse after click.

```powershell
$skillRoot = 'C:\Users\luis1\.agents\skills\motomaniafrontend'
node "$skillRoot\scripts\audit_interactions.mjs" `
  --base-url http://127.0.0.1:5059 `
  --cookie "<signed Flask session cookie>" `
  --route pantalla=/ruta-a-auditar `
  --click-text "ESTADO A,ESTADO B" `
  --out instance\validation\ui-interactions `
  --fail-on P1
```

### Broad Admin Audit

Use `scripts/audit_admin_ui.mjs` when a wider browser inventory helps. It can
measure routes, capture screenshots, detect horizontal overflow, list gradients,
sample contrast, and write JSON evidence.

```powershell
$skillRoot = 'C:\Users\luis1\.agents\skills\motomaniafrontend'
node "$skillRoot\scripts\audit_admin_ui.mjs" `
  --base-url http://127.0.0.1:5059 `
  --cookie "<signed Flask session cookie>" `
  --route pantalla=/ruta-a-auditar `
  --out instance\validation\ui-audit
```

The script is optional. If Playwright or Chrome are unavailable, validate with
Flask render checks, direct HTML inspection, and the available browser tools.

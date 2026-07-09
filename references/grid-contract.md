# Motomania Grid Contract

Use this contract when the user asks for polish, alignment, layout cleanup,
buttons, tabs, product grids, filters, calculators, sidebars,
or any new module UI.

This contract is independent from any single screen. The truth is the measured
grid: aligned rails, stable dimensions, compact information, and no avoidable
scroll.

## Mission

Frontend work is not "make a pretty card". The task is to align what already
exists:

- same-type controls have the same height inside the same container
- same-row buttons share one rhythm and do not jump by state
- tab/segmented controls keep static widths and positions
- clicking a state control must not move the control row, resize peer buttons,
  or push counters/filters beside it
- text fields fit realistic content size instead of consuming arbitrary space
- grids use columns intentionally and scroll internally when long
- titles, subtitles, filters, counters, and action rails stay on predictable
  rails
- changing filters or tabs changes information, not layout

## Hard Rules

- Do not add cards unless the workflow needs a container. The skill is for
  alignment, sizing, density, and scroll ownership.
- Do not invent a new sidebar when a shared sidebar or module-group sidebar
  exists. Same width, color, active state, and placement within a family.
- Do not introduce local color themes for ordinary modules.
- Do not let buttons in the same row use different heights.
- Do not let peer action buttons in the same row alternate randomly between
  narrow, medium, and wide sizes.
- Do not use long visible button labels when an icon plus tooltip or shorter
  label would keep the rail stable.
- Do not place buttons floating in the middle of cards. Use a header rail,
  footer rail, or consistent action column.
- Do not let tab labels or selected states resize the tab group.
- Do not accept horizontal scroll caused by oversized inputs, empty gaps, long
  labels, or unnecessary columns.
- Do not trap a wide operational grid in a narrow column while side panels sit
  beside it. Let the grid span the full row and stack secondary containers below
  when that removes avoidable horizontal scroll.
- Do not create page-length infinite grids. A normal operational preview should
  show about 10 rows and then scroll internally.
- Do not oversize inputs for money, dates, percentages, counts, statuses, or
  short codes. Width should follow realistic values, not worst-imaginable text.
- Do not let table/grid headers and rows drift off their vertical rails.
- Do not accept global horizontal overflow.
- Do not use rounded corners or card radius that break the existing hierarchy.
  Keep radius restrained and consistent.

## Measurement Tolerances

Default thresholds:

- Header height drift inside a module family: 1 px maximum.
- Sidebar width drift inside a module family: 2 px maximum.
- Main/title left-origin drift inside a module family: 4 px maximum.
- Button row height drift: 2 px maximum.
- Button row top drift: 1.5 px maximum.
- Peer button width drift in a repeated row: 12 px maximum unless one button is
  intentionally primary.
- Tab/segmented control width drift by state: 0 px target, 2 px maximum.
- Control rail movement after clicking a state: 0 px target, 2 px maximum.
- Peer control movement after clicking a state: 0 px target, 2 px maximum.
- Peer control resize after clicking a state: 0 px target, 2 px maximum.
- Card row top drift: 2 px maximum.
- Card row height drift: 3 px maximum.
- Card gap drift inside a row: 4 px maximum.
- Product/table column left drift: 1.5 px maximum.
- Product/table column width drift: 2.5 px maximum.
- Baseline grid: key edges should land on a 4 px rhythm.
- Normal internal grid/list viewport: about 10 visible rows before internal
  scrolling.

P1 findings must be fixed before delivery unless the user explicitly asks for
audit-only output. P2 findings should normally be fixed in the same frontend
polish pass. P3 findings can be documented when outside scope.

## Tooling

Before editing UI, run the static contract audit when templates or CSS changed:

```powershell
$skillRoot = 'C:\Users\luis1\.agents\skills\motomaniafrontend'
python "$skillRoot\scripts\static_ui_contract.py" `
  --root C:\Users\luis1\Documents\MotomaniaWeb `
  --changed-only `
  --fail-on none
```

After rendering the app, run the grid audit:

```powershell
$skillRoot = 'C:\Users\luis1\.agents\skills\motomaniafrontend'
node "$skillRoot\scripts\audit_layout_grid.mjs" `
  --base-url http://127.0.0.1:5059 `
  --cookie "<signed Flask session cookie>" `
  --route pantalla=/ruta-a-auditar `
  --out instance\validation\ui-grid `
  --fail-on P1
```

For sibling routes, pass all routes in the same command. The audit checks
consistency between the routes you choose for that run. Use `--compare` only
when the task explicitly defines a comparison route for that single run.

When the view has filters/tabs/state buttons, run the interaction audit:

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

## Fix Loop

1. Measure current UI.
2. Fix P1 overflow, misalignment, moving tabs, and broken scroll ownership.
3. Fix P2 oversized inputs, long labels, cramped grid columns, button/card
   drift, and dead space.
4. Re-run the exact same audit command.
5. Keep JSON/HTML/PNG evidence under `instance/validation/`.
6. Record validation evidence in `docs/HISTORIAL_CAMBIOS.md` when the app
   changed.

Do not close a frontend task with "se ve mejor" as proof. Close with the
specific measurements that passed.

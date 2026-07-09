# Motomania Frontend Workflow

Use this workflow for every Motomania Web UI task.

## 1. Select Mode

Read the user's wording before deciding to edit:

- Conversation/audit-only: "hablemos", "revisemos", "no edites", "solo
  consulta", "solo audita", "que opinas", "vale la pena".
- Execute: "hazlo", "corrigelo", "actualiza", "pulir", or a concrete defect
  with enough scope.
- Microfix: edit only when the evidence is concrete and small. Otherwise report
  an "observacion no corregida".
- Skill-only: update the skill folder and validate it; do not require
  MotomaniaWeb docs unless the repo contract changes.
- Alignment/polish: use `references/grid-contract.md` and the bundled audit
  tools. Do not accept "looks better" as validation.
- Save-approved-rule: when the owner explicitly says to save a good frontend
  result, update `references/owner-placement-preferences.md` with the reusable
  placement rule, not the route or screen.

## 2. Verify Workspace

Before proposing or writing repo changes, run:

```powershell
powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -File .\ejecutar_local\verificar_workspace_original.ps1
```

Stop if the command fails. Dated Codex folders and extracted ZIPs may be read
only when the owner asks, never used as the write target.

## 3. Establish Scope

Identify:

- user intent: audit only, plan only, or execute
- route(s) and templates
- affected module group
- permissions required
- data source and whether data is live, JSON local, SQL read-only, or writable
- docs that define the current behavior

If the user explicitly says not to edit, keep the task read-only.

## 4. Read Required Context

Always read:

- `AGENTS.md`
- `.github/copilot-instructions.md`
- applicable `.github/instructions/*.instructions.md`
- `docs/README.md`
- `docs/07_FRONTEND.md`
- `docs/12_GOTCHAS.md`

For frontend alignment work, also read the skill memory:

- `references/owner-placement-preferences.md`

Then read the module docs from `docs/README.md`.

Read `docs/10_FLUJOS.md` when:

- the UI change affects a complete business flow
- buttons/forms are moved or renamed
- a modal changes behavior
- a visible state may affect what users do next

Read deploy packaging docs when:

- a top-level folder/file is added
- deploy-relevant templates/static/sql/server files change
- a generated/dev-only folder must be excluded from the server ZIP

## 5. Audit Before Planning

Gather evidence before recommending:

- search with `rg`
- inspect templates and shared CSS
- inspect route/controller data passed to templates
- run `scripts/static_ui_contract.py` when templates/CSS/JS are involved
- render the page locally when possible
- run `scripts/audit_layout_grid.mjs` for layout-sensitive work
- compare desktop/mobile and light/dark for visual changes
- measure actual DOM sizes when the concern is alignment, height, overflow, or
  contrast

Do not assume a visual issue from memory if the route can be rendered.

Known evidence traps:

- `UI bugs/` is historical; confirm against current code or rendered UI.
- `legacy` in a filename is not deletion proof; inspect live references and
  packager inputs first.
- broad searches for RMS/SQL/JSON/API/log terms often find internal text, not
  operator-visible copy.
- `create_app()` SQL timeouts can be environment limitations after route
  registration, not frontend defects.

## 6. Create The Plan

Organize findings by:

- layout and alignment
- typography
- cards and containers
- controls
- tables/lists/matrices
- color and contrast
- responsive/mobile
- scroll ownership
- states and modals
- docs and validation

Call out:

- what is intentionally unchanged
- what is risky
- what is low-priority polish
- what must be fixed before release

## 7. Execute Conservatively

Prefer:

- shared selectors and tokens
- existing component language
- smaller edits in the affected template/CSS
- copy changes that reduce wrapping or ambiguity
- moving scroll to a contained working area for long lists
- human operator-facing text that hides internal terms unless useful
- the durable grid contract for shell, titles, controls, cards, and product
  grids
- compact realistic input widths instead of full-width controls by habit

Avoid:

- new layout systems when the existing one works
- nested cards
- route or permission changes for visual work
- changing form names or endpoint contracts
- moving business logic into JS
- broad refactors while doing UI polish
- SQL/RMS/permission changes while solving visual alignment or copy
- custom sidebars, local color systems, or one-off button/card/grid systems
- new cards when the real issue is spacing, sizing, scroll, or alignment
- horizontal scroll caused by oversized textboxes or long button labels

## 8. Validate Like A Release

At minimum:

- render the affected route(s)
- test desktop and mobile
- test light and dark when colors changed
- run the grid audit for sidebars, titles, cards, buttons, and product grids
- check `documentElement.scrollWidth`
- check text fit and button heights
- run `git diff --check`
- run Python compile/test commands when Python/templates changed enough to
  justify it

Record validation in `docs/HISTORIAL_CAMBIOS.md`.

## 9. Close Clearly

Final response should say:

- visual changes
- code changes
- docs updated
- validation performed
- anything that could not be validated
- whether a reusable preference was stored, only when the owner explicitly
  asked for it

If the change is documentation or skill-only, say "No hay cambios visuales."

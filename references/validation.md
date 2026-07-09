# Motomania Frontend Validation

Use the strongest validation available in the current environment. The owner
does not validate technical correctness for Codex.

## Preferred Local Runtime

This checkout may not have its own `venv`. In the user's MotomaniaWeb family,
the known working interpreter is often:

```powershell
C:\Users\luis1\Documents\MotomaniaWeb\venv\Scripts\python.exe
```

Use repo-local `venv\Scripts\python.exe` if it exists. Otherwise use the active
MotomaniaWeb venv above when dependencies are missing globally.

## Starting Flask For UI Checks

Use a separate port and disable background jobs for UI audits:

```powershell
$env:MOTOMANIA_DATA = 'C:\Users\luis1\Documents\MotomaniaWeb\instance'
$env:MOTOMANIA_NO_HTTPS = '1'
$env:MOTOMANIA_CAEX_AUTO = '0'
$env:MOTOMANIA_C807_AUTO = '0'
$env:MOTOMANIA_FORZA_AUTO = '0'
$env:MOTOMANIA_PUSH_AUTO = '0'
$env:FLASK_APP = 'app:app'
C:\Users\luis1\Documents\MotomaniaWeb\venv\Scripts\python.exe -m flask run --host 127.0.0.1 --port 5059
```

If launching in background, stop the listener when done.

## Signed Manager Session

For local browser audits without typing credentials, create a signed Flask
cookie from the app secret:

```powershell
$env:MOTOMANIA_DATA = 'C:\Users\luis1\Documents\MotomaniaWeb\instance'
@'
from app import app
from flask.sessions import SecureCookieSessionInterface
s = SecureCookieSessionInterface().get_signing_serializer(app)
payload = {"usuario":"luis", "rol":"manager", "sales_rep_id":None, "nombre":"Luis Trejo"}
print(s.dumps(payload))
'@ | C:\Users\luis1\Documents\MotomaniaWeb\venv\Scripts\python.exe -
```

Do not store real passwords in scripts or docs.

## Browser Audit Script

## Static UI Contract Audit

Use before or during implementation when templates, CSS, or frontend JS changed:

```powershell
$skillRoot = 'C:\Users\luis1\.agents\skills\motomaniafrontend'
python "$skillRoot\scripts\static_ui_contract.py" `
  --root C:\Users\luis1\Documents\MotomaniaWeb `
  --changed-only `
  --fail-on none
```

For a focused audit:

```powershell
python "$skillRoot\scripts\static_ui_contract.py" `
  --root C:\Users\luis1\Documents\MotomaniaWeb `
  --path templates\modulo_auditado `
  --path static\modulo_auditado `
  --fail-on P1
```

The tool writes:

- `static-ui-contract.json`
- `summary.md`
- `static-ui-contract.html`

## Store Owner-Approved Placement Memory

Use this only when the owner explicitly asks to save a good frontend lesson.
Extract a reusable placement rule; do not save a screen as a permanent
comparison target.

```powershell
$skillRoot = 'C:\Users\luis1\.agents\skills\motomaniafrontend'
python "$skillRoot\scripts\remember_frontend_preference.py" `
  --category buttons `
  --title "Botones hermanos con ritmo unico" `
  --rule "Peer buttons in one visual row should keep equal height and a coherent width rhythm; active, loading, or label changes must not move the row." `
  --avoid "Button rows where long labels, selected states, or mixed padding make buttons jump." `
  --validation "Grid audit should not report button-row-height-mismatch, button-row-width-mismatch, or button-label-wrap."
```

## Layout Grid Audit

Use after the app route renders. This is the main alignment tool. By default it
checks each route against the contract and checks consistency between the routes
included in the same run.

```powershell
$skillRoot = 'C:\Users\luis1\.agents\skills\motomaniafrontend'
node "$skillRoot\scripts\audit_layout_grid.mjs" `
  --base-url http://127.0.0.1:5059 `
  --cookie "<signed cookie>" `
  --route pantalla=/ruta-a-auditar `
  --out instance\validation\ui-grid `
  --fail-on P1
```

For sibling modules, pass all affected routes in the same command:

```powershell
node "$skillRoot\scripts\audit_layout_grid.mjs" `
  --base-url http://127.0.0.1:5059 `
  --cookie "<signed cookie>" `
  --route modulo_a=/ruta-a `
  --route modulo_b=/ruta-b `
  --route modulo_c=/ruta-c `
  --out instance\validation\ui-grid `
  --fail-on P1
```

Use `--compare key=/ruta` only when the task explicitly defines a comparison
route for that run. Do not hard-code a permanent comparison screen into the
workflow.

The tool writes:

- `grid-audit.json`
- `summary.json`
- `summary.md`
- `grid-audit.html`
- per-route visual overlay HTML with red/orange/blue boxes when findings have
  measured rectangles
- clean and grid-overlay screenshots unless `--no-screenshots` is used

Use `--fail-on none` for exploratory audits and `--fail-on P1` before closing
frontend work.

## Interaction Audit

Use when a screen has filters, tabs, segmented controls, or state buttons. The
tool clicks controls and compares before/after geometry so state changes cannot
hide layout drift.

```powershell
$skillRoot = 'C:\Users\luis1\.agents\skills\motomaniafrontend'
node "$skillRoot\scripts\audit_interactions.mjs" `
  --base-url http://127.0.0.1:5059 `
  --cookie "<signed cookie>" `
  --route pantalla=/ruta-a-auditar `
  --click-text "ESTADO A,ESTADO B" `
  --out instance\validation\ui-interactions `
  --fail-on P1
```

If `--click-text` is omitted, the tool auto-clicks safe tab/filter-like
controls and avoids commit/destructive actions.

The tool writes:

- `interaction-audit.json`
- `summary.json`
- `summary.md`
- screenshots for baseline and clicked states unless `--no-screenshots` is
  used

Use this whenever the owner reports "when I press X/Y the UI moves" or when a
screen has status filters that can change content density.

## Broad Browser Audit Script

Run the bundled script when Node and Playwright are available:

```powershell
$skillRoot = 'C:\Users\luis1\.agents\skills\motomaniafrontend'
node "$skillRoot\scripts\audit_admin_ui.mjs" `
  --base-url http://127.0.0.1:5059 `
  --cookie "<signed cookie>" `
  --route pantalla=/ruta-a-auditar `
  --out instance\validation\ui-audit
```

Useful options:

```powershell
node "$skillRoot\scripts\audit_admin_ui.mjs" --help
node "$skillRoot\scripts\audit_admin_ui.mjs" --routes routes.json
node "$skillRoot\scripts\audit_admin_ui.mjs" --route pantalla=/ruta-a-auditar
node "$skillRoot\scripts\audit_admin_ui.mjs" --viewports desktop=1920x1080,mobile=390x844
node "$skillRoot\scripts\audit_admin_ui.mjs" --themes dark,light
node "$skillRoot\scripts\audit_admin_ui.mjs" --no-screenshots
```

The script writes:

- `audit.json`
- `summary.json`
- screenshots per route/viewport/theme unless disabled

If Playwright is available but its bundled browser is missing, point the script
at the installed Chrome executable:

```powershell
node "$skillRoot\scripts\audit_admin_ui.mjs" `
  --base-url http://127.0.0.1:5059 `
  --cookie "<signed cookie>" `
  --route pantalla=/ruta-a-auditar `
  --chrome-executable "C:\Program Files\Google\Chrome\Application\chrome.exe" `
  --out instance\validation\ui-audit
```

If the Playwright module itself is unavailable, use direct Flask render checks,
Chrome headless/CDP, or manual browser inspection instead of abandoning visual
validation.

## Manual Checks

When script execution is not available, still check:

- `document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1`
- no unexpected `background-image: linear-gradient(...)`
- button/select heights are 36 px desktop and 44 px mobile where the pattern
  requires it
- text contrast in light mode
- active sidebar item placement
- internal scroll containers for long lists
- sticky header/column behavior for matrices
- no overlap at 390 px and at the module's tight breakpoint

## Code Validation

Use:

```powershell
git diff --check -- <changed files>
```

For Python/template route changes:

```powershell
venv\Scripts\python.exe -m compileall app.py motomania
```

If the repo has the regression suite available:

```powershell
venv\Scripts\python.exe -m unittest tests.test_auditoria_regresion
```

Use the active MotomaniaWeb venv path when repo-local `venv` is absent.

## Documentation Validation

Before closing, confirm:

- relevant docs updated
- `docs/HISTORIAL_CAMBIOS.md` has a new top entry
- validation evidence is mentioned
- packaging docs/script are updated if a top-level folder or deploy inclusion
  rule changed

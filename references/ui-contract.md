# Motomania UI Contract

This contract applies to Motomania Web UI work across the app. It is not tied
to one current screen; the durable contract is alignment, density, stable
controls, and scroll ownership.

## Shell

Top header:

- one global header only
- do not redefine `.top`, `.top-user`, `.top-module`, `.theme-toggle`,
  `.mod-menu`, or notification controls in child templates
- module actions belong in content, tabs, sidebars, cards, or modals
- desktop height is 56 px
- mobile content must account for the fixed/header area

Sidebars:

- desktop sidebar token is `--sidebar-width: 240px`
- sidebars should render to the page height, not only viewport height, when the
  content is taller than the viewport
- mobile sidebars become a drawer or horizontal bar depending on module pattern
- active item should be visible first in horizontal mobile group bars

Main content:

- use the established module shell
- keep title, KPI, and content origins aligned
- avoid page-level floating cards
- avoid decorative section wrappers
- within a module family, keep the same main/title/card/control rails across
  sibling routes so navigation feels like the data changed, not the UI system

Durable rule:

- do not create a custom sidebar or local shell when the shared shell can serve
  the module
- when a screen family has multiple routes, the user should feel that only the
  information changes, not the menu, title origin, button rail, or card rhythm

## Board Pattern

The `.admin-board-main` pattern is one available dashboard language, not a
mandatory destination for every screen.

Measured contract:

- max content width: 1180 px
- desktop inner content width at 1920 px: 1108 px
- desktop main padding: about 30 px top, 36 px sides, 44 px bottom
- mobile inner content at 390 px: 348 px
- mobile main padding: about 20 px top, 16 px sides, 32 px bottom

Use this pattern when a module needs:

- a compact dashboard surface
- a group sidebar
- status KPIs
- dense operational cards
- internal scroll for lists/matrices

Do not force it where a module already has a stronger local pattern.

## Headers

Contract:

- desktop title: 30 px, `Barlow Condensed`, 800, uppercase
- mobile title: 25 px
- subtitle: 12 px, `Inter`, comfortable line-height
- context mark/chip: 30 px tall, compact, not a card

Rules:

- keep title origin consistent within a visual family
- do not use hero-size type inside operations panels
- use supporting text for context, not long instructions

## Cards And Containers

Cards are not mandatory.

Use cards for:

- repeated items
- modals
- real tool panels
- KPI/status units
- forms or tables that need a frame

Avoid:

- card inside card
- cards as decoration
- one field per card unless the domain truly needs it
- page sections styled as floating cards

Dashboard card contract:

- 4 KPI cards at top when using the dashboard pattern
- KPI card height: 96 px
- desktop KPI width at 1920: about 269.5 px
- mobile KPI width at 390: about 169 px in two columns
- card background: `var(--s1)`
- red rail/icon accent
- no decorative shadows or gradients

## Typography

Type scale:

- page title desktop: 30 px
- page title mobile: 25 px
- card title: 13 px
- body, rows, tables: 12 px
- helpers and buttons: 11 px
- labels, chips, compact table headers: 10 px
- tiny permission keys or metadata: 9-10 px when necessary

Fonts:

- titles: `Barlow Condensed`
- interface: `Inter`
- technical values and money: `JetBrains Mono`

Rules:

- do not create one-off font sizes inside the same module family
- do not scale font-size with viewport width
- letter spacing must not be negative
- keep long identifiers readable with wrapping only where expected
- use mono/tabular treatment for comparable numbers and codes

## Visible Copy

Write for operators, not implementers.

Prefer:

- "No tienes permiso para generar PDF"
- "No se pudo cargar la informacion"
- "Revisa los datos y vuelve a intentar"
- "El documento esta listo para imprimir"

Avoid in visible UI unless the operator truly needs the term:

- RMS
- SQL
- JSON
- API
- logs
- Batch
- ITL
- stack traces, endpoint names, or raw exception text

Keep implementation terms in code, logs, comments, docs, and diagnostics when
they are useful internally. The rule is about customer/operator-facing text.

## Controls

Control contract:

- desktop button/select height: 36 px
- mobile/touch button/select height: 44 px
- icon/text gap: about 7 px
- row action minimum: about 96 px desktop
- primary action minimum: about 118 px desktop

Rules:

- `.cf-btn.sm` must not shrink height inside dashboard surfaces
- destructive and secondary buttons keep the same height as normal actions
- width may vary by context; height and alignment should not
- use familiar icons instead of text-only tool symbols where the app already
  uses icons
- buttons in the same visual row should share one width rhythm; repeated peer
  actions should not alternate between narrow, medium, and wide buttons
- a row of 4-6 actions should look like one control group, not independent
  buttons dropped into a line
- long action labels should be shortened. Use icon plus tooltip for explanation
  when the long text would break the rail.
- action buttons inside cards belong in a header/footer/action rail, not
  floating in the middle of content.

## Inputs And Filters

Size inputs by realistic operational values:

- money/count/quantity/percent fields: compact width, usually 160-190 px
- dates/months: about 180-220 px
- status/category selects: about 220-280 px
- ordinary text filters: about 280-360 px
- broad search boxes may be wider, but only when search is the main action

Avoid:

- full-width textboxes for short values
- price calculator rows that scroll horizontally because inputs are too wide
- empty space above information caused by oversized filter controls

## Tabs And Segmented Controls

Rules:

- tab width and position must not change when active state changes
- counters next to tabs must not move when the selected tab changes
- selected and unselected states keep the same height, padding, and border
- if labels differ in length, choose equal-width tabs or a fixed grid
- changing a tab/filter should change content only, not resize the menu

## Tables, Lists, Matrices, And Product Grids

Rules:

- desktop can use dense tables for comparison
- mobile may convert tables into rows/cards
- long lists should use internal scroll when the user needs a preview/work area
- normal operational grids should show about 10 rows before internal scrolling
- avoid horizontal scroll unless the data is truly dense enough to justify it
- avoid oversized textboxes and empty gaps as causes of horizontal scroll
- matrix headers and first columns may be sticky
- avoid body-level horizontal overflow

Reusable rules:

- preview lists should expose a compact work area, then scroll internally
- matrices should clamp the working panel and put scroll ownership inside it
- product grids should keep aligned headers/cells, stable row height,
  server-driven sorting when applicable, and no body-level overflow

## Colors

Motomania red is the primary accent:

- `--red`: `#E31111`
- `--red-dim`: low-alpha red background

Light mode:

- background: `#f4f4f5`
- surfaces: white / near-white
- text must be dark enough for comfortable reading
- avoid bright yellow on white
- avoid pale green text on pale green backgrounds

Recommended semantic light text:

- success text: `#166534`
- info text: `#1d4ed8`
- warning text: `#92400e`
- danger text: `#b91c1c`

Dark mode:

- preserve contrast against dark surfaces
- use red for Motomania identity, not random module themes

## Responsive Rules

Check:

- desktop 1920x1080
- desktop 1366x900 when possible
- mobile 390x844
- narrow 340 px when grids/KPIs are touched
- light and dark themes

Breakpoints seen in the current system:

- 1100 px: wider grids collapse
- 900 px: global mobile shell changes
- 760 px: admin dashboards stack header and mobile controls
- 680 px: form matrices collapse
- 340 px: KPI two-column grids may become one column

## States

Do not forget:

- empty
- loading
- success
- error
- disabled
- dirty/unsaved
- modal open
- long text
- many rows
- few/no rows
- permission-limited user

# Motomania Frontend Anti-Patterns

Flag these during audit. Fix them only when they are in scope or when the user
asked for broad polish.

## Layout

- creating a new card just to fill space
- putting cards inside cards
- creating a new sidebar when the shared shell/sidebar already fits
- changing sidebar color, width, active state, or placement per module
- letting sibling modules shift title/card/control origins from screen to screen
- using a marketing hero for an operational tool
- building a decorative dashboard before solving the workflow
- making page sections float as cards
- using a sidebar that stops at viewport height while content continues
- hiding active mobile navigation at the far end of a horizontal bar

## Spacing

- rows taller than their content needs
- controls far away from labels/descriptions
- large empty vertical blocks in forms
- hard-coded min-heights copied across unrelated content
- padding used to compensate for unclear hierarchy

## Typography

- one-off font sizes inside the same module family
- oversized headings inside compact panels
- tiny text for operational data users must read repeatedly
- negative letter spacing
- viewport-width font scaling
- mixed font families where the app already has a clear standard

## Controls

- buttons of different heights in the same workflow
- rows of peer buttons with random widths and no shared rhythm
- tab/segmented controls that resize when active state changes
- long visible button labels that wrap instead of using a concise label,
  icon, or tooltip
- small buttons below touch target size in mobile
- text-only symbolic controls where an icon exists in the app's icon set
- destructive buttons that shift layout because of different dimensions
- controls that resize on hover, loading, or changed label text

## Tables And Lists

- body-level horizontal overflow from wide tables
- product grids whose header and row columns do not share the same rails
- product rows that jump height without a content reason
- short-value inputs that create avoidable horizontal scroll
- page-length grids that should be an internal 10-row work area
- endless page growth from long lists that need a preview/work area
- missing sticky headers in tall matrices
- first-column labels disappearing in permission matrices
- mobile tables that require hidden horizontal scroll when a card/list pattern
  already exists

## Color And Effects

- local gradients inside work surfaces
- decorative shadows on operational cards
- module-specific color themes without a domain reason
- yellow text on white or pale backgrounds
- pale green text on pale green backgrounds
- low-contrast helper text in light mode
- blur/backdrop effects in ordinary card headers or footers

## Implementation

- inline styles for repeated layout behavior
- duplicate CSS that competes with `base.html`
- dead old selectors left in place after layout migration
- deleting CSS/assets only because the name contains `legacy`
- treating old `UI bugs/` notes as current defects without rendered evidence
- UI changes that alter route names, permissions, CSRF, form fields, or data
  contracts
- JS-only business logic that belongs in services/routes
- broad visible-copy edits based only on grep matches for RMS, SQL, JSON, API,
  logs, Batch, or ITL
- exposing stack traces, endpoint names, raw JSON, or internal error labels to
  ordinary operators
- docs/history left stale after a visual change

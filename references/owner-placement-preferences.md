# Owner Placement Preferences

This is the skill memory for reusable frontend placement preferences approved by
the owner.

Use it only when the user explicitly says something like:

- "Listo guarda esto en skill frontend motomania"
- "Guarda esto como regla de frontend"
- "Esto quedo bien, guardalo para repetirlo"

Do not store a whole screen as a comparison target. Extract the reusable rule behind the
approval.

## What To Store

Store preferences about:

- alignment and rails
- control sizing
- tab/menu stability
- button label behavior
- scroll ownership
- grid density
- dead-space avoidance
- hierarchy and radius restraint
- tooltip use when visible text would break layout

Store design/aesthetic preferences only when they are really system constraints,
such as no decorative gradients, restrained radius, no random local color
themes, or red as the primary accent.

## What Not To Store

Do not store:

- "copy this module forever"
- route-specific measurements as permanent truth
- one-off fixes tied to temporary data
- subjective decoration preferences without a reusable rule
- anything that contradicts `grid-contract.md`

## Active Learned Rules

Add new rules below this line using `scripts/remember_frontend_preference.py`.

# LocalTask — Design system ("Dispatch")

Calm, precise, trustworthy. Trust is *shown* through structured records, not decoration.
Every module imports from `src/components/ui.tsx` and uses the Tailwind tokens below.
Never hardcode colors, fonts, or ad-hoc styles — extend `ui.tsx` instead.

## Color tokens (tailwind.config.js)
- paper `#F2EFE8` — page background
- surface `#FBFAF6` — cards
- ink `#1E1D19` / ink-soft `#3A3934` — text
- muted `#77746C` / faint `#A29E93` — secondary / hints
- hair `#E6E2D8` — hairline borders
- petrol `#244B4D` (hover `#2A5457`) — brand / primary actions
- verified `#3E7A57` · pending `#B07A2E` · inactive `#A8A499` — status only

## Type roles
- display — Space Grotesk (`font-display`), weight 500; headings and wordmark
- body — Inter (`font-sans`); everything a person reads
- data — Space Mono (`font-mono`); addresses, amounts, IDs, statuses, eyebrows

## Primitives (import from components/ui)
`PageHeading`, `Eyebrow`, `Card`, `Button` (primary | ghost), `Field`, `Label`,
`Input`, `StatusBadge` (verified | pending | unverified), `Alert` (error | info | warning).

## Signature
The task/user "record card": soft off-white surface, thin petrol status edge,
a monospace data strip, and an understated verification mark (dot + label).

# OpenPoker UI Reference Notes

## Purpose

These notes capture what OpenPoker should learn from existing online poker clients before the first UI pass.

The goal is not to copy a specific client. The goal is to preserve familiar poker-room patterns while giving OpenPoker its own calm, readable, server-authoritative interface.

## Sources

- WPT Global lobby update notes: cleaner lobby, improved cash-game visibility, stability-focused changes.
- WPT Global lobby review: dark gray/black lobby, larger clearer fonts, improved icons, cash tables grouped by limit.
- PokerStars software overview: reliability, fast action response, unified lobby/filtering, multi-table expectations.
- GGPoker mobile guidance: high-contrast felt, clear cards, minimal distractions, touch accuracy.

## Patterns To Borrow

### Dark Poker-Room Shell

Most serious poker clients use dark shells because:

- card faces stay high-contrast
- bright table felt becomes the focal surface
- lobby rows/cards are easier to scan for long sessions
- glare matters less during extended play

OpenPoker should use a deep green/black room background instead of a flat dark dashboard.

### Stake-First Lobby

Cash-game players usually choose stakes first, then table.

OpenPoker's fixed catalog maps cleanly to this:

- `$1/$2`
- `$2/$5`
- `$5/$10`

The first lobby should make those three stakes obvious and avoid advanced filters until the game loop works.

### Large, Readable Numeric Data

Poker is full of numbers:

- blinds
- buy-in range
- seat count
- stack
- pot
- call amount
- raise amount

Numbers should use tabular styling and enough contrast. A beautiful UI that makes `$400` look like `$40` is broken.

### Clear Seat Availability

The lobby should answer:

- Is this table open?
- How many seats are occupied?
- Is a hand active?
- What is the buy-in range?

Do not hide these behind hover states.

### Low-Distraction Mobile UI

Mobile poker lives or dies by touch accuracy.

Borrow:

- large action buttons
- clear card faces
- minimal decorative animation
- high-contrast table felt

Reject:

- tiny buttons
- gesture-heavy betting controls
- glitter effects around critical actions

## Patterns To Avoid

### Slot-Machine Energy

OpenPoker should not look like a casino promotions page.

Avoid:

- glossy purple gradients
- jackpot-style banners
- flashing reward panels
- noisy confetti loops
- casino cross-sell areas

### Generic SaaS Dashboard

The lobby should not look like an admin billing table.

Avoid:

- white cards on gray background
- generic stat-card grid
- default component-library buttons
- flat business dashboard typography

### Overbuilt Filters

MVP has 30 fixed rooms. Complex filtering would add UI weight without user value.

Good first filters:

- stake grouping
- open seats visibility
- manual refresh

Later filters:

- hide full tables
- active/waiting only
- region or speed tags

### Fake Optimism

OpenPoker should not animate chips into stacks before the server confirms the state.

Allowed:

- button pending state
- click compression
- loading skeletons
- table transition

Not allowed:

- optimistic stack changes
- optimistic pot changes
- optimistic winner display

## First Screen Direction

The first screen should be a lobby, not a landing page.

Layout:

- top app bar with `OpenPoker`
- left/center hero copy: `Choose a cash table`
- right status cluster: API endpoint, connection hint, optional resume session
- stake sections for `$1/$2`, `$2/$5`, `$5/$10`
- room cards in each stake section

Room card contents:

- table display name
- stake
- occupied seats
- hand status
- street if active
- buy-in range
- join/open button

Empty and partially occupied tables should feel inviting. Full tables should feel disabled.

## OpenPoker Distinctive Choices

OpenPoker should have its own face:

- "command-console poker room" mood
- dark green felt atmosphere
- amber/gold action accents
- monospace numeric labels
- compact but premium room cards
- visible server-state language, for example `Live from PokerRoom DO`

The product should feel like a real-time table server with a beautiful cockpit. That is the point.

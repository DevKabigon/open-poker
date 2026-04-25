# OpenPoker UI Design Plan

## Status

This document is the first UI implementation guide for OpenPoker.

It should be read together with:

- [Web Client Contract](./web-client-contract.md)
- [Lobby Room Catalog](./lobby-room-catalog.md)
- [Domain View Contract](./domain-view-contract.md)
- [Poker Room Runtime](./poker-room-runtime.md)

The goal is not to design a static poker mockup. The goal is to design a real-time poker table UI that is safe to drive from authoritative server snapshots.

## Product Direction

OpenPoker should feel like a serious online poker room, not a generic game demo.

Reference category:

- GGPoker
- PokerStars
- WPT Global

OpenPoker should borrow the category language users already understand:

- green felt table
- oval table geometry
- six-player seat ring
- chip stacks
- clear action buttons
- visible pot and street state
- dealer, small blind, and big blind markers

But it should avoid looking like a slot-machine lobby.

OpenPoker's MVP should feel closer to a professional poker terminal:

- focused
- readable
- calm under pressure
- data-accurate
- slightly premium
- fast enough that acting never feels sticky

## MVP UI Scope

The UI MVP covers:

- fixed cash-game lobby
- six-max no-limit Texas Hold'em table
- seat selection
- buy-in flow
- session resume after refresh
- WebSocket-driven table snapshots
- basic player actions
- connection and command failure states

The UI MVP does not cover:

- tournaments
- chat
- emojis
- hand history viewer
- cashier
- profile pages
- friends
- avatars marketplace
- multi-tabling
- spectators
- mobile app shell

## Core UI Principle

The server owns the game.

The UI can animate and preview intent, but it must not invent poker truth.

The following values must always come from `RoomSnapshotMessage` or HTTP responses:

- seat occupancy
- stack amounts
- current commitments
- total committed amounts
- board cards
- hole cards
- revealed showdown cards
- acting seat
- current bet
- call amount
- allowed actions
- min raise target
- max raise target
- main pot
- side pots
- total pot
- street
- hand status
- next hand countdown
- action deadline
- uncalled bet return
- showdown result after settlement

The UI may locally track:

- selected room tab
- selected empty seat before claiming
- buy-in form value
- slider input value before submitting bet or raise
- command pending state
- transient animation state
- toast messages
- reconnect backoff state
- last seen `roomVersion`

The UI must not locally calculate:

- who won a hand
- side pot eligibility
- how much a player should receive
- whether a player can legally act
- whether a street should advance
- whether an all-in closes action
- whether a hand should start

That is the whole game. If this line stays clean, the UI can be beautiful without becoming dangerous.

## UI Stack Decision

The MVP UI uses:

- Solid
- Tailwind CSS
- OpenPoker-owned components
- CSS variables for OpenPoker design tokens

The MVP UI does not use Shadcn-style component ports by default.

Reason:

- OpenPoker's core surface is a custom poker table, not a generic app dashboard.
- Tailwind keeps layout and responsive work fast.
- Custom components keep the visual language away from default SaaS/admin UI.
- Accessibility-heavy primitives can still be introduced later when they earn their cost.

Potential later additions:

- Kobalte or another headless primitive for complex dialogs/selects/tooltips
- a small internal `components/ui` folder once repeated button/modal/input patterns stabilize

## High-Level Information Architecture

```text
/
  Lobby

/rooms/:roomId
  Table
  Seat claim modal
  Resume session flow

Global overlays
  Connection state
  Command rejection toast
  Fatal error screen
```

The MVP can implement this without a router at first:

- show lobby when no selected room exists
- show table when a room is selected
- persist selected session with `readStoredRoomSession()`

A router can be added later when table URLs need to be shareable.

## App State Model

The web app should keep a thin client state layer.

```text
HTTP lobby load
  -> LobbyRoomsResponse
  -> lobby view state

User selects room
  -> fetchRoomState(roomId, sessionToken?)
  -> initial RoomSnapshotMessage
  -> open WebSocket

WebSocket room-snapshot
  -> replace authoritative snapshot
  -> derive presentational UI state

User action click
  -> send player-action command
  -> mark command pending
  -> wait for command-ack or command-rejected
  -> visible game state changes only after next room-snapshot
```

The UI should treat snapshots as replace events, not patches.

Recommended store shape:

```ts
interface TableClientState {
  roomId: string
  snapshot: RoomSnapshotMessage | null
  connectionStatus: 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed' | 'failed'
  pendingCommandId: string | null
  lastCommandError: string | null
  selectedSeatId: number | null
  buyInDraft: number | null
}
```

Do not duplicate nested snapshot data into separate writable stores unless there is a specific UI-only reason.

## Visual Direction

### Aesthetic

Direction: industrial premium poker room.

The UI should look intentional and serious:

- deep room background
- felt table surface
- warm highlights
- crisp card rendering
- strong numeric readability
- compact but not cramped controls

Avoid:

- generic purple gradients
- mobile casino glitter overload
- bubbly SaaS cards
- centered landing-page sections
- cartoon chips as the main identity

### Mood

The table should feel like:

- a private online poker room
- a real-time command console
- a game surface where every number matters

It should not feel like:

- a toy game
- a crypto casino
- a generic dashboard
- a marketing template

## Design Tokens

These are starting tokens. They can change during UI implementation, but changes should be deliberate.

### Color

```css
:root {
  --op-bg-950: #070806;
  --op-bg-900: #0c100d;
  --op-bg-850: #111711;
  --op-panel-800: #182019;
  --op-panel-700: #202b22;

  --op-felt-900: #062b1b;
  --op-felt-800: #0a3a24;
  --op-felt-700: #105334;
  --op-felt-ring: #1f6b45;

  --op-rail-900: #20150d;
  --op-rail-700: #4c301b;
  --op-rail-highlight: #8f653b;

  --op-gold-500: #d6a84f;
  --op-gold-400: #e8c76d;
  --op-cream-100: #f6ecd6;
  --op-muted-300: #a8aa9e;
  --op-muted-500: #73786c;

  --op-red-500: #c7483c;
  --op-red-600: #9f312d;
  --op-blue-500: #4d8fd8;
  --op-green-500: #43a56d;
  --op-warning-500: #e6b54a;
}
```

Usage:

- background: `--op-bg-950`, `--op-bg-900`
- table felt: `--op-felt-900` to `--op-felt-700`
- table rail: `--op-rail-900`, `--op-rail-700`
- primary action: `--op-gold-500`
- destructive fold: muted red, not screaming red
- call/check: cream or gold depending on current action
- all-in: red with a confirmation affordance later
- inactive text: `--op-muted-500`
- active timer: gold progressing toward warning red

### Typography

Recommended fonts:

- Display: `Cabinet Grotesk` or `Satoshi`
- Body/UI: `DM Sans` or `Instrument Sans`
- Numeric/Data: `JetBrains Mono` or `IBM Plex Mono`

Why:

- poker UI is numeric and time-sensitive
- stack and pot values need tabular number behavior
- labels need to remain readable at small sizes
- the brand can have personality in headers without making controls weird

Initial CSS strategy:

```css
:root {
  --op-font-display: "Cabinet Grotesk", "Satoshi", sans-serif;
  --op-font-body: "DM Sans", "Instrument Sans", sans-serif;
  --op-font-data: "JetBrains Mono", "IBM Plex Mono", monospace;
}
```

If external font loading is deferred, use the variables now and wire the actual font import later.

### Spacing

Use a 4px base grid.

```css
--op-space-1: 4px;
--op-space-2: 8px;
--op-space-3: 12px;
--op-space-4: 16px;
--op-space-5: 20px;
--op-space-6: 24px;
--op-space-8: 32px;
--op-space-10: 40px;
--op-space-12: 48px;
--op-space-16: 64px;
```

Density should be compact on table controls and comfortable in the lobby.

### Radius

```css
--op-radius-sm: 6px;
--op-radius-md: 10px;
--op-radius-lg: 16px;
--op-radius-xl: 24px;
--op-radius-pill: 999px;
```

Use radius deliberately:

- cards: small radius
- buttons: medium radius
- panels: large radius
- table: oval geometry, not generic rounded rectangle

### Motion

Motion should explain state changes.

Allowed MVP motion:

- table entrance fade/scale
- room cards stagger in
- active seat ring pulse
- action timer sweep
- chip commit nudge
- command pending button compression
- WebSocket reconnect banner slide

Avoid:

- random floating cards
- infinite decorative glows
- heavy particle effects
- animations that delay action controls

Suggested durations:

- micro feedback: 80ms
- button state: 120ms
- seat highlight: 180ms
- card reveal: 220ms
- room transition: 280ms
- reconnect banner: 180ms

## Layout Breakpoints

Suggested breakpoints:

```css
--op-bp-mobile: 0px;
--op-bp-tablet: 768px;
--op-bp-desktop: 1120px;
--op-bp-wide: 1440px;
```

Implementation can use CSS media queries directly.

Target behavior:

- mobile: portrait poker table with avatars around the table edge and a sticky action dock
- tablet: portrait-to-landscape bridge, table centered, action dock still prominent
- desktop: landscape poker table with wider seat spacing and lower action panel
- wide: table stays readable, do not stretch indefinitely

## Screen: App Shell

The app shell should be minimal.

Desktop structure:

```text
┌────────────────────────────────────────────────────────┐
│ Top Bar                                                │
│ OpenPoker | stake / room | connection | session status │
├────────────────────────────────────────────────────────┤
│ Main content                                           │
└────────────────────────────────────────────────────────┘
```

Top bar responsibilities:

- brand
- current room name
- blind level
- connection status
- leave table button when seated
- compact debug/version indicator during development

Top bar must not become a crowded dashboard.

## Screen: Lobby

### Purpose

The lobby helps the player choose a stake and table quickly.

Because MVP uses fixed rooms, the lobby is not a room creation product. It is a table picker.

### Lobby Layout

Desktop:

```text
┌──────────────────────────────────────────────────────────────┐
│ OpenPoker                                                    │
│ Pick a seat                                                 │
├──────────────────────────────────────────────────────────────┤
│ Stake tabs: $1/$2 | $2/$5 | $5/$10                           │
├──────────────────────────────────────────────────────────────┤
│ Selected stake summary                                       │
│ Table 01   3/6   Waiting   Buy-in $100-$400   Join           │
│ Table 02   0/6   Open      Buy-in $100-$400   Open           │
└──────────────────────────────────────────────────────────────┘
```

Mobile:

```text
┌──────────────────────────────┐
│ OpenPoker                    │
│ Stake tabs: 1/2  2/5  5/10   │
├──────────────────────────────┤
│ Selected stake summary       │
│ Table row/card               │
│ Table row/card               │
│ Table row/card               │
└──────────────────────────────┘
```

The lobby should use tabs for stakes on both mobile and desktop.

Reason:

- mobile stays short and scannable
- desktop avoids showing all 30 rooms at once
- future stake levels do not break the layout
- the mental model matches cash poker: choose blinds first, then table

The hero/header area should be compact. The lobby is the product surface, not a marketing page.

### Lobby Room Card

Each room card should show:

- display name, for example `NLH $1/$2 - Table 01`
- stake
- occupied seats, for example `3/6`
- hand status, for example `Waiting`, `In hand`, `Showdown`, `Settled`
- street, when active
- minimum and maximum buy-in
- join/open button

Room card visual states:

- empty table: quieter, invite to start
- partially occupied: normal
- full: disabled or "Full"
- active hand: show street
- next hand scheduled: show countdown if available

Room card should not show:

- exact hole cards
- active player names in the MVP lobby
- long hand history
- raw room IDs as primary copy

### Lobby Data Refresh

MVP approach:

- load once on app start
- refresh after returning from a table
- optional manual refresh button

Later:

- poll every 5 to 10 seconds
- or use a lobby WebSocket

Do not overbuild lobby real-time before the table UI works.

## Screen: Table

### Purpose

The table screen is the core product.

It must answer four questions instantly:

- What is happening?
- Is it my turn?
- What can I do?
- How much does this action cost?

### Table Layout Split

The table layout is not one responsive layout that simply shrinks.

OpenPoker should use two explicit table layouts:

- `MobileTableLayout`: portrait table, built for phone screens.
- `DesktopTableLayout`: landscape table, built for wide screens.

Both layouts consume the same `RoomSnapshotMessage` and shared presentational components, but they own different geometry.

Shared:

- `TableSeat`
- `BoardCards`
- `PotDisplay`
- `PlayingCard`
- `ActionPanel`
- `ConnectionBanner`

Split:

- table frame aspect ratio
- seat anchor coordinates
- amount of seat detail shown
- action panel placement
- board and pot scale

Implementation should prefer:

```tsx
<div class="lg:hidden">
  <MobileTableLayout snapshot={snapshot()} />
</div>

<div class="hidden lg:block">
  <DesktopTableLayout snapshot={snapshot()} />
</div>
```

Do not attempt to make the desktop oval table fit mobile by only changing Tailwind classes. That creates cramped poker, and cramped poker causes mistakes.

### Desktop Landscape Table Layout

Desktop should feel like a classic horizontal online poker table.

```text
┌────────────────────────────────────────────────────────────────────┐
│ Top bar: OpenPoker | NLH $1/$2 Table 01 | Connected | Leave        │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│                 Seat 0                    Seat 1                  │
│                                                                    │
│        Seat 5     ┌────────────────────────────────┐    Seat 2     │
│                   │ Board: [  ] [  ] [  ] [  ] [  ] │               │
│                   │ Main pot / side pots            │               │
│                   │ Street + acting seat + timer    │               │
│                   └────────────────────────────────┘               │
│                                                                    │
│                 Seat 4                    Seat 3                  │
│                                                                    │
├────────────────────────────────────────────────────────────────────┤
│ My hand panel | stack | call amount | bet slider | action buttons  │
└────────────────────────────────────────────────────────────────────┘
```

Desktop layout rules:

- use a wide oval table
- keep all six seats visible around the rail
- show richer seat cards with name, stack, cards, committed amount, and badges
- keep board and pot in the center
- place hero hand and action controls in a bottom dock
- allow side pot detail to be visible without opening a drawer
- use the full width, but cap the table so seat spacing stays intentional

Suggested desktop table frame:

- breakpoint: `lg` and up
- aspect ratio: about `16 / 9` or `17 / 9`
- max width: `1180px` to `1280px`
- min height: `620px`
- seat card width: `150px` to `190px`
- board card width: `54px` to `70px`

Suggested desktop seat anchors:

```text
seat 0: top 4%, left 27%
seat 1: top 4%, right 27%
seat 2: top 42%, right 0%
seat 3: bottom 4%, right 27%
seat 4: bottom 4%, left 27%
seat 5: top 42%, left 0%
```

### Mobile Portrait Table Layout

Mobile should still look like a poker table.

Do not replace the table with a plain HUD stack. The phone layout should keep a central table surface with player avatars placed around the table edge.

```text
┌──────────────────────────────┐
│ Compact room bar             │
│ NLH $1/$2 · Connected        │
├──────────────────────────────┤
│        Seat 0   Seat 1       │
│                              │
│  Seat 5   ┌──────────┐ Seat 2│
│           │ Board    │       │
│           │ Pot      │       │
│  Seat 4   └──────────┘ Seat 3│
│                              │
│          Hero cards          │
├──────────────────────────────┤
│ Sticky action panel          │
│ Fold   Call $4   Raise       │
└──────────────────────────────┘
```

Mobile layout rules:

- use a portrait oval or rounded capsule table
- keep six avatar anchors around the rail
- keep board and pot in the table center
- keep hero cards near the bottom of the table surface
- keep the action panel sticky at the bottom of the viewport
- reduce opponent seat detail, but do not remove seat positions
- make the active seat obvious with a ring/timer
- avoid hiding the acting seat behind the action dock

Suggested mobile table frame:

- target viewport: `390px x 844px`
- breakpoint: below `lg`
- table frame width: `min(100%, 430px)`
- table frame height: `min(58svh, 520px)`
- minimum table height: `390px`
- seat avatar size: `44px` to `56px`
- hero card width: `54px` to `64px`
- board card width: `38px` to `48px`
- sticky action dock height: `148px` to `220px`, depending on raise controls

Suggested mobile seat anchors:

```text
seat 0: top 4%, left 28%
seat 1: top 4%, right 28%
seat 2: top 40%, right -2%
seat 3: bottom 17%, right 14%
seat 4: bottom 17%, left 14%
seat 5: top 40%, left -2%
```

Mobile seat card content:

- avatar
- truncated name or `Seat 2`
- stack
- current committed chip badge when non-zero
- folded/all-in/sitting-out/disconnected badge
- dealer/SB/BB marker

Mobile seat card should usually not show:

- full player names
- long status copy
- two-card detailed area for every opponent
- side-pot eligibility lists

Hero area on mobile:

- show hero cards larger than opponent cards
- show stack and call amount near the cards
- keep hero cards visually connected to seat position
- do not move hero information so far down that it feels detached from the table

The action dock is separate from the table frame, but it should feel attached to the table through spacing and color.

### Table Geometry

The table should be an oval, not a rectangle.

Layers:

1. room background
2. subtle vignette or radial light behind table
3. rail oval
4. felt oval
5. center board/pot group
6. seat anchors
7. floating action effects

CSS approach:

- `PokerTable` as a relative container
- seats positioned absolutely around an oval
- table center uses normal flex/grid layout
- mobile and desktop use different seat anchor maps
- shared components receive density props such as `mobile` or `desktop`

Canonical seat order for six-max:

```text
0: top-left
1: top-right
2: right
3: bottom-right
4: bottom-left
5: left
```

Seat order should match the server's `seatId` array. Do not reorder server data.

Seat anchor position can change by layout, but `seatId` meaning must not.

### Center Table Content

Center table should show:

- board cards
- total pot
- main pot
- side pot count or side pot details
- current street
- hand number
- acting seat indicator
- next hand countdown when settled
- uncalled bet return note when present

Pot display hierarchy:

1. total pot largest
2. main pot medium
3. side pots compact
4. uncalled return as small contextual note

Example:

```text
POT $186.00
Main $124.00 | Side 1 $62.00
Returned $14.00 to Seat 3
```

### Board Cards

Board card slots:

- always render 5 slots
- filled slots show card face
- empty slots show quiet placeholders
- flop can reveal 3 at once
- turn and river reveal one each

Card rendering should support:

- face-up card code from `TableCardCode`
- hidden card back
- empty slot
- disabled placeholder

Do not implement fancy 3D cards in the first pass. Clean 2D cards are better.

## Component: Seat

### Seat Anatomy

A seat should contain:

- display name or `Open Seat`
- stack
- current committed amount
- two card slots
- status badges
- position markers
- active turn ring

Suggested visual hierarchy:

```text
┌──────────────────────┐
│ Dealer / SB / BB     │
│ Player Name          │
│ Stack $250.00        │
│ [card] [card]        │
│ Bet $12.00           │
│ All-in / Folded      │
└──────────────────────┘
```

### Seat States

Empty:

- shows `Open Seat`
- subdued border
- clickable if not seated or if seat claiming is allowed

Occupied:

- shows player name and stack
- shows hidden cards during active hand
- shows revealed cards when `revealedHoleCards` exists

Hero seat:

- stronger border
- shows private hole cards from `PrivatePlayerView.holeCards`
- should be visually distinct without becoming noisy

Acting:

- active ring
- timer sweep
- slightly raised card/panel

Folded:

- dimmed
- cards darkened or tucked
- status badge `Folded`

All-in:

- strong badge
- stack may be zero
- committed amount remains visible

Sitting out:

- muted
- badge `Sitting out`
- no action affordance

Disconnected:

- badge `Disconnected`
- do not hide chips

Showdown revealed:

- use `revealedHoleCards`
- do not reveal private cards from other players unless server sends them

### Seat Marker Rules

Markers:

- `D` for dealer
- `SB` for small blind
- `BB` for big blind

If a seat has multiple concepts during edge cases, show position markers in this order:

- dealer
- small blind
- big blind

Heads-up special blind behavior is a domain concern. UI only renders the markers the server sends.

## Component: Action Panel

### Purpose

The action panel is more important than the table decoration.

It must make legal actions obvious and illegal actions impossible.

### Desktop Placement

Bottom dock:

```text
┌──────────────────────────────────────────────────────────────┐
│ Hole cards | Stack | To call | Bet/Raise control | Actions   │
└──────────────────────────────────────────────────────────────┘
```

### Mobile Placement

Sticky bottom dock:

```text
┌──────────────────────────────┐
│ [Ah] [Kd]    Stack $198      │
│ To call $4   Pot $32         │
│ slider / amount presets      │
│ Fold   Call $4   Raise       │
└──────────────────────────────┘
```

Mobile action panel must stay reachable by thumb.

### Action Source

Available actions must come from:

```ts
snapshot.privateView?.allowedActions
```

Action cost must come from:

```ts
snapshot.privateView?.callAmount
snapshot.privateView?.minBetOrRaiseTo
snapshot.privateView?.maxBetOrRaiseTo
```

### Button Rules

Render buttons based on `allowedActions`:

- `fold`
- `check`
- `call`
- `bet`
- `raise`
- `all-in`

Recommended grouping:

- left: `Fold`
- middle: `Check` or `Call`
- right: `Bet` or `Raise`
- secondary/danger: `All-in`

If both `check` and `call` are not available, disable middle action.

If `bet` or `raise` is available:

- show amount input
- show min/max
- default amount should be min legal target
- user can change draft amount locally
- submit sends amount
- after send, lock controls until ack/reject or timeout

Do not send amount for:

- fold
- check
- call
- all-in

### Pending Commands

When a player clicks an action:

- generate command ID
- send WebSocket `player-action`
- disable action controls
- show small pending state
- do not change stacks yet

When `command-ack` arrives:

- clear pending state
- wait for snapshot to update display

When `command-rejected` arrives:

- clear pending state
- show rejection toast
- keep current snapshot

If socket closes while command is pending:

- clear pending state
- show reconnecting
- fetch state after reconnect

## Component: Buy-In Modal

### Entry

User clicks an empty seat.

Modal receives:

- roomId
- seatId
- room min buy-in
- room max buy-in
- blind level

### Fields

MVP fields:

- display name
- buy-in amount

Future:

- avatar
- auto-rebuy
- wait for big blind

### Rules

Buy-in must be:

- integer chip units
- between `minBuyIn` and `maxBuyIn`
- displayed as dollars using catalog blind units

On submit:

- call `claimSeat(roomId, seatId, request)`
- write `{ roomId, sessionToken }` only after success
- replace table snapshot from response
- open or rebind WebSocket using session token

On failure:

- do not store session
- keep modal open
- show server reason

## Component: Resume Flow

On app load:

1. read stored session
2. if no session, show lobby
3. if session exists, call `resumeSeatSession(roomId, { sessionToken })`
4. if success, show table and connect WebSocket
5. if failure, clear stored session and show lobby

Resume screen copy:

```text
Rejoining table...
Restoring your seat session.
```

Do not show private data from local storage while resuming.

## Component: Connection State

Connection states:

- idle
- connecting
- open
- reconnecting
- closed
- failed

Visual treatment:

- connected: small green dot, quiet
- connecting: small spinner
- reconnecting: top banner
- failed: top banner with retry
- closed intentionally: no panic state

Reconnect rule:

- WebSocket reconnect should fetch a fresh room state before trusting UI again
- if session resume fails, clear local session
- if room state fetch fails, stay in table shell with error banner

## Error Handling

### API Errors

Use `OpenPokerApiError.reason` when available.

Display:

- short user-readable message
- optional technical detail in development

Avoid:

- raw stack traces
- JSON dumps in production UI
- silent failures

### Command Rejections

Command rejections are normal in real-time poker:

- stale action
- not your turn
- illegal amount
- session mismatch
- socket not associated with a seat

Toast pattern:

```text
Action rejected
It is no longer your turn.
```

Then keep the current authoritative snapshot.

## Formatting Money

The engine stores chip amounts as integers.

For current fixed catalog:

- values are cents
- `$1/$2` is `100 / 200`
- display `100` as `$1.00`

Create one formatter:

```ts
formatChipAmount(amount: number): string
```

Do not scatter formatting logic across components.

Initial display:

- `$0.00`
- `$12.00`
- `$1,250.00`

If later the product supports play-money or tournament chips, this formatter becomes table-config-aware.

## Accessibility

Poker UI is visual, but it should still be usable.

Minimum requirements:

- all buttons have accessible labels
- cards expose readable labels, for example `Ace of hearts`
- hidden cards expose `Hidden card`
- active player state is not color-only
- focus states are visible
- modal traps focus
- escape closes non-critical modal
- all-in should not be easy to trigger accidentally by keyboard spam

Keyboard MVP:

- tab through lobby cards
- enter joins selected room
- tab through action buttons
- enter activates focused action

Do not add hotkeys like `F` for fold in the first pass. Dangerous.

## Responsive Design

### Desktop

Desktop should prioritize full table awareness.

Recommended:

- max content width: `1440px`
- top bar: `64px`
- action dock: `132px` to `180px`
- table area: fills remaining height

### Tablet

Tablet should preserve the six-seat table but compress:

- smaller seat cards
- smaller board cards
- action dock remains large
- lobby uses two columns or stake tabs

### Mobile

Mobile must use a portrait poker table, not a plain HUD.

Recommended:

- top bar becomes compact
- table stays visually central
- table frame becomes portrait-oriented
- seats become avatar-first anchors around the table edge
- hero player's cards stay near the bottom edge of the table surface
- actions move to a sticky bottom dock
- side pots collapse into compact center-table text or an expandable inspector

Mobile priority order:

1. my legal actions
2. my cards
3. amount to call
4. pot
5. board
6. acting player
7. other stacks

If space is tight, opponent detail collapses before seat position collapses.

The user should always feel like they are seated at a table, even on a phone.

## Implementation Component Tree

Suggested first component structure:

```text
apps/web/src/
  app/
    AppShell.tsx
  features/lobby/
    LobbyPage.tsx
    StakeColumn.tsx
    RoomCard.tsx
  features/table/
    TablePage.tsx
    DesktopTableLayout.tsx
    MobileTableLayout.tsx
    PokerTableFrame.tsx
    TableCenter.tsx
    TableSeat.tsx
    BoardCards.tsx
    PotDisplay.tsx
    ActionPanel.tsx
    BuyInModal.tsx
    ConnectionBanner.tsx
  lib/
    api.ts
    session-storage.ts
    format.ts
```

Keep CSS close to feature components at first.

Do not build a generic design system package yet.

## First UI Implementation Sequence

### Step 1: Replace Starter UI

Remove the default Vite/Solid starter screen.

Create:

- app shell
- global tokens
- OpenPoker top bar
- placeholder lobby page

No WebSocket yet.

### Step 2: Lobby With Real API

Use:

- `fetchLobbyRooms()`

Build:

- stake grouping
- room cards
- loading state
- error state
- refresh button

Clicking a room opens table shell.

### Step 3: Table Shell With Snapshot Fetch

Use:

- `fetchRoomState(roomId, sessionToken?)`

Build:

- desktop landscape table oval
- mobile portrait table oval
- six seat anchors in both layouts
- board placeholders
- pot display
- action dock placeholder

No player actions yet.

### Step 4: Seat Claim Flow

Use:

- empty seat click
- buy-in modal
- `claimSeat()`
- `writeStoredRoomSession()`

After success:

- render private player view
- show hero cards if present

### Step 5: WebSocket Snapshots

Use:

- `createRoomWebSocket()`
- `join-room`
- `room-snapshot`

Rules:

- replace snapshot on each `room-snapshot`
- show connection status
- fetch state after reconnect

### Step 6: Action Panel

Use:

- `PrivatePlayerView.allowedActions`
- `callAmount`
- `minBetOrRaiseTo`
- `maxBetOrRaiseTo`

Build:

- fold/check/call
- bet/raise amount control
- all-in button
- pending command state
- command rejected toast

### Step 7: Polish Critical States

Polish:

- active seat ring
- timer display
- folded/all-in/sitting-out states
- next hand countdown
- mobile action dock

Only after this should we add extra flourishes.

## Testing Strategy

### Unit Tests

Add tests for:

- chip amount formatting
- grouping lobby rooms by stake
- deriving visible action buttons from private view
- session resume state transitions
- WebSocket message parsing helpers if extracted

### Component Tests Later

Not required before first UI pass.

Useful later:

- Lobby renders empty/active/full rooms
- Action panel disables illegal actions
- Buy-in modal clamps invalid values
- Reconnect banner appears on socket close

### Manual QA Checklist

Before considering UI MVP done:

- load lobby with worker running
- join an empty table
- claim a seat
- refresh page and resume session
- open second browser and claim another seat
- auto-start hand with enough players
- take fold/check/call actions
- verify stacks only change after server snapshots
- disconnect WebSocket and reconnect
- leave table while waiting
- leave table during hand and verify sitting-out behavior
- test mobile width at 390px
- test desktop width at 1440px

## Copy Guidelines

Tone:

- short
- calm
- poker-native
- not salesy

Good:

- `Choose a cash table`
- `Seat open`
- `Waiting for players`
- `Your turn`
- `Call $4.00`
- `Action rejected`
- `Reconnecting to table`

Avoid:

- `Oops! Something went wrong!`
- `Let us get you back in the game!`
- `Amazing table selected!`
- vague labels like `Submit`

## Known Design Risks

### Risk: Too much decoration

Poker UI invites casino glitter. Resist it.

The MVP wins by being clear and responsive.

### Risk: Mobile table overcrowding

Six seats, board, pot, and action buttons do not fit naturally on a phone.

The solution is priority, not shrinking everything.

### Risk: Optimistic chip changes

Animating chips before server confirmation can make the table feel fast, but it can also lie.

MVP should animate button feedback only. Chip values update after snapshots.

### Risk: Side pots are hard to read

Side pots are visually confusing for casual players.

MVP should show total pot clearly and side pot details compactly. Later we can add an expandable side-pot inspector.

## Definition of Done for First UI Milestone

The first UI milestone is done when:

- default starter UI is gone
- lobby renders fixed room catalog from Worker
- user can enter a table
- table renders six seats from snapshot
- user can claim a seat
- session persists and resumes after refresh
- WebSocket snapshots update the table
- action panel sends legal player actions
- command errors are visible
- mobile layout is usable at 390px width
- `pnpm test`, `pnpm typecheck`, and `pnpm build` pass

## Final Implementation Rule

Build the UI as a projection of server state.

Every time a component feels tempted to "figure out poker," stop and move that logic to the domain, Worker, or protocol layer.

The web app is the cockpit. The Durable Object is the table.

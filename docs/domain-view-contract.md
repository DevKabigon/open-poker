# OpenPoker Domain View Contract

## Why This Exists

`InternalRoomState` is the authoritative room state used by the domain engine and, later, the `PokerRoom` Durable Object.

That state must **never** be sent directly to clients because it contains hidden and engine-only data:

- full remaining `deck`
- `burnCards`
- every player's `holeCards`
- engine bookkeeping that should not leak into UI contracts

Instead, the server must project the internal state into two safe views:

- `PublicTableView`
- `PrivatePlayerView`

This document fixes the MVP contract before the Durable Object and WebSocket layers are built.

## Core Principle

- `InternalRoomState` is the truth for the engine.
- `PublicTableView` is what everyone at the table can see.
- `PrivatePlayerView` is what one specific seated player can see about themselves.

The same room tick should produce:

- one shared public view
- zero or one private view per connected player

## PublicTableView

`PublicTableView` is broadcast to everyone connected to the room, including railbirds once spectator support exists.

It may include:

- room identifiers and versioning
- current hand identifiers
- street / hand status
- dealer / small blind / big blind positions
- acting seat
- public board cards
- public pot information
- public seat state

It must not include:

- remaining deck order
- burn cards
- private hole cards before reveal rules say otherwise
- per-player legal actions
- timeout internals or server-only bookkeeping

## PrivatePlayerView

`PrivatePlayerView` is scoped to a single occupied seat and may include:

- that player's own hole cards
- whether they can act right now
- their legal actions
- call amount
- min / max bet-or-raise target
- optional action deadline supplied by the room server

It must not include:

- other players' hidden cards
- hidden deck information
- server-only randomness or ordering state

## Public Seat Fields

Each public seat should expose only information that is visible or inferable at the table:

- `seatId`
- `playerId`
- `displayName`
- `isOccupied`
- `stack`
- `committed`
- `totalCommitted`
- `hasFolded`
- `isAllIn`
- `isSittingOut`
- `isDisconnected`
- `actedThisStreet`
- `revealedHoleCards`

## Hole Card Reveal Policy

For the current MVP we use this rule:

- before showdown: nobody's hole cards are public
- at showdown / after settlement: hole cards are public **only for seats that did not fold**

That means:

- folded hands stay hidden
- showdown contestants are revealed

This is intentionally simple and safe for now.

Future versions may support richer reveal rules such as:

- voluntary mucking
- forced all-in reveals
- per-seat shown/mucked status
- partial reveal history in replays

Those rules are **not** modeled yet, so the current projection layer uses the simpler non-folded-at-showdown policy.

## Pot Display Policy

The public table should project pot information from seat contributions rather than trusting stale room fields.

The projected table exposes:

- `mainPot`
- `sidePots`
- `totalPot`
- `uncalledBetReturn`

Important:

- `totalPot` means the **contestable pot**
- `uncalledBetReturn` is exposed separately when one seat has unmatched excess chips committed

This avoids the common bug where UI shows a pot total that accidentally includes unmatched chips.

## Action Projection Policy

Private action data comes from the same domain action validator used by the reducer.

For a seated player:

- if they can act now, return legal actions and numeric action bounds
- if they cannot act now, return their hole cards but no legal actions

This keeps the UI aligned with the engine and avoids “optimistic” action menus that disagree with the server.

## Action Deadline

The domain state does not yet own timer deadlines.

So:

- `PrivatePlayerView.actionDeadlineAt` is optional input from the room server layer
- for now the domain projection accepts that deadline as an argument
- if none is supplied, it stays `null`

Later the `PokerRoom` Durable Object can inject the live deadline while still reusing the same projection logic.

## Recommended Flow

When the room state changes:

1. reduce the authoritative `InternalRoomState`
2. build `PublicTableView`
3. build one `PrivatePlayerView` per connected seated player
4. send each socket the shared public view plus that player's private view

This keeps the room server simple:

- command in
- reduce authoritative state
- project safe views out

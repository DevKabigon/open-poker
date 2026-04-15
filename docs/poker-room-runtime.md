# PokerRoom Runtime Skeleton

## Goal

This step introduces the first real `PokerRoom` Durable Object runtime for OpenPoker.

The room server is still intentionally minimal:

- no auth yet
- no lobby persistence yet
- no reconnect / resume policy yet
- no D1-backed chip ledger yet

But it already proves the important architecture:

- one room = one Durable Object
- room state is authoritative inside the DO
- commands are applied through the domain engine
- clients receive projected room snapshots, not raw internal state
- HTTP and WebSocket paths both share the same authoritative room loop
- action timeout scheduling is owned by the DO runtime

## Authoritative State

`PokerRoom` owns one `InternalRoomState`.

That state is:

- loaded from Durable Object storage on startup / resume
- mutated only inside the DO
- persisted back after every accepted mutation

The DO also owns a small runtime metadata record for the live turn clock:

- `actionDeadlineAt`
- `actionSeatId`
- `actionSequence`

The DO also owns `roomVersion` increments.

For now:

- each accepted command increments `roomVersion` by 1
- each accepted seat management mutation increments `roomVersion` by 1
- read-only snapshot requests do not change `roomVersion`

## Why The DO Owns roomVersion

The domain engine is replayable and pure.

`roomVersion` is not game logic. It is runtime delivery metadata used by:

- clients for snapshot freshness
- command acknowledgements
- later WebSocket reconciliation

So it belongs naturally in the room server layer.

## Runtime Metadata

Turn deadlines are not domain truth in the same sense as chips, pots, and cards.

They are runtime delivery state owned by the room server.

So the DO persists a separate runtime record:

- `actionDeadlineAt`: when the current acting seat times out
- `actionSeatId`: which seat the deadline belongs to
- `actionSequence`: which exact domain action sequence the deadline was derived from

This lets the room safely survive hibernation / restart and still know whether an alarm is stale or current.

## Current Internal Endpoints

The DO exposes internal HTTP-style routes used by the Hono worker:

- `GET /health`
- `GET /snapshot`
- `GET /ws`
- `POST /commands`
- `POST /seats/:seatId/claim`
- `POST /seats/:seatId/leave`
- `PUT /debug/seats/:seatId`
- `POST /debug/sessions`
- `POST /debug/reset`

These are internal runtime endpoints, not final public product API contracts.

## Snapshot Flow

`GET /snapshot` returns:

- shared `PublicTableView`
- optional `PrivatePlayerView` when a valid `sessionToken` is supplied

The DO never returns raw `InternalRoomState`.

## Seat Session Binding

Before real authentication exists, the room uses temporary seat session tokens.

The flow is:

1. a player claims an empty seat with `POST /seats/:seatId/claim`
2. the room returns a fresh `sessionToken`
3. HTTP snapshot requests may include `sessionToken`
4. WebSocket clients may upgrade with `sessionToken` or send it in `join-room`

The DO resolves:

- `sessionToken -> seatId`

Only if the token still matches the current occupied player in that seat.

This gives us a safer intermediate step than trusting raw `viewerSeatId` values from the client.

## Seat Claim Rules

Seat claiming is the first non-debug room lifecycle step.

`POST /seats/:seatId/claim` currently requires:

- `playerId`
- `buyIn`
- optional `displayName`

The room enforces:

- seat id must exist
- seat must currently be empty
- `buyIn` must be within table `minBuyIn` / `maxBuyIn`
- the same `playerId` cannot occupy a second seat
- new players cannot claim seats while a hand is actively running

Successful claims:

- occupy the seat
- set the initial stack to the buy-in amount
- clear sitting-out / disconnected flags
- issue a seat session token
- auto-start the next hand when enough eligible seats are now present
- broadcast fresh snapshots

## Auto-Start Policy

The room now supports the first minimal auto-start path.

When the room is:

- `waiting` or `settled`

and the number of hand-eligible seated players is at least:

- `config.autoStartMinPlayers`

the DO immediately dispatches a domain `start-hand` command.

For now, that auto-start happens after:

- `POST /seats/:seatId/claim`
- `PUT /debug/seats/:seatId`

This is intentionally narrow.

It gives the room a playable bootstrap loop without yet deciding product-level pacing questions such as:

- whether to pause briefly between hands
- whether to require all seated players to be marked ready
- whether to auto-start again immediately after settlement

## Leave Seat Rules

`POST /seats/:seatId/leave` currently requires:

- `sessionToken`

The room verifies the token matches the targeted occupied seat.

Then it behaves differently based on hand state:

- outside a live hand: the seat is fully cleared
- during `in-hand` / `showdown`: the seat remains in place, but is marked `isSittingOut = true` and `isDisconnected = true`

That second path is important.

It avoids corrupting an in-progress hand by removing committed chips, cards, or showdown eligibility out from under the table. The current hand can finish on the normal timeout path, and the player is naturally excluded from the next hand.

## WebSocket Flow

`GET /ws` upgrades into a Durable Object-managed WebSocket.

Each accepted socket stores a small attachment:

- `sessionToken`

That attachment is re-resolved against current room session state whenever the room needs to know which private seat view to project.

When a socket connects:

1. the DO accepts the socket with the hibernation-friendly API
2. the socket attachment stores `sessionToken` if one was provided
3. the DO immediately sends a `room-snapshot`

When a socket sends a `player-action` message:

1. the DO reads the socket attachment
2. the room resolves the attachment `sessionToken` into the current acting seat
3. the domain command is dispatched
4. the DO persists state and increments `roomVersion`
5. the sender receives `command-ack` or `command-rejected`
6. every socket receives a fresh `room-snapshot`

This is the first real end-to-end room server loop.

## Alarm Flow

Whenever the authoritative room state changes:

1. the DO derives runtime timeout metadata from the new room state
2. if a player is currently acting, the DO schedules an alarm for `actionDeadlineAt`
3. if nobody is acting, the DO clears any alarm

When the alarm fires:

1. the DO checks whether the stored deadline still matches the current `actingSeat` and `actionSequence`
2. if the deadline is stale, it resynchronizes the alarm and stops
3. if the deadline is current and expired, it dispatches a domain `timeout` command
4. the DO persists the new state and broadcasts fresh snapshots

This keeps timeout handling on the same deterministic command path as every other action.

## Command Flow

`POST /commands` accepts:

- `DomainCommand`
- optional `sessionToken`

The DO then:

1. validates and dispatches the command through the domain engine
2. receives `DomainEvent[]` and `nextState`
3. increments `roomVersion`
4. persists the new state
5. broadcasts fresh snapshots to connected sockets
6. returns the produced events plus a projected snapshot

That is the same loop the future WebSocket path will use.

## Temporary Debug Seat Endpoint

Until lobby, join, and seat-assignment flows exist, we need a safe way to seed rooms for development.

So the runtime currently includes:

- `PUT /debug/seats/:seatId`

This is intentionally temporary and development-facing.

It allows:

- occupying a seat
- updating display info / stack
- clearing a seat

It is deliberately blocked while a hand is actively running.

Once proper join / leave / buy-in flows exist, this endpoint should be removed or hidden behind development-only guards.

## Next Step After This

After this WebSocket-enabled skeleton, the natural next step is:

- real authenticated session identity replacing temporary seat session tokens
- reconnect / resume policy
- lobby / room discovery replacing direct seat claim calls
- buy-in / ledger integration so seat stacks come from actual balance movement instead of direct client input

At that point the room runtime starts looking like a full production table server instead of a controlled development skeleton.

# PokerRoom Runtime Skeleton

## Goal

This step introduces the first real `PokerRoom` Durable Object runtime for OpenPoker.

The room server is still intentionally minimal:

- no WebSocket fanout yet
- no auth yet
- no lobby persistence yet

But it already proves the important architecture:

- one room = one Durable Object
- room state is authoritative inside the DO
- commands are applied through the domain engine
- clients receive projected room snapshots, not raw internal state

## Authoritative State

`PokerRoom` owns one `InternalRoomState`.

That state is:

- loaded from Durable Object storage on startup / resume
- mutated only inside the DO
- persisted back after every accepted mutation

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

## Current Internal Endpoints

The DO exposes internal HTTP-style routes used by the Hono worker:

- `GET /health`
- `GET /snapshot`
- `POST /commands`
- `PUT /debug/seats/:seatId`
- `POST /debug/reset`

These are internal runtime endpoints, not final public product API contracts.

## Snapshot Flow

`GET /snapshot` returns:

- shared `PublicTableView`
- optional `PrivatePlayerView` when `viewerSeatId` is supplied

The DO never returns raw `InternalRoomState`.

## Command Flow

`POST /commands` accepts:

- `DomainCommand`
- optional `viewerSeatId`

The DO then:

1. validates and dispatches the command through the domain engine
2. receives `DomainEvent[]` and `nextState`
3. increments `roomVersion`
4. persists the new state
5. returns the produced events plus a projected snapshot

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

After this skeleton is stable, the natural next step is:

- WebSocket connection management inside `PokerRoom`
- socket session -> `viewerSeatId` mapping
- command ack + snapshot broadcast
- alarm-driven timeout handling

At that point the room runtime becomes the real table server rather than just an HTTP-driven control surface.

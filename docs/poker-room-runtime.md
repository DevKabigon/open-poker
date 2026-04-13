# PokerRoom Runtime Skeleton

## Goal

This step introduces the first real `PokerRoom` Durable Object runtime for OpenPoker.

The room server is still intentionally minimal:

- no auth yet
- no lobby persistence yet
- no alarm-driven action timeout yet

But it already proves the important architecture:

- one room = one Durable Object
- room state is authoritative inside the DO
- commands are applied through the domain engine
- clients receive projected room snapshots, not raw internal state
- HTTP and WebSocket paths both share the same authoritative room loop

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
- `GET /ws`
- `POST /commands`
- `PUT /debug/seats/:seatId`
- `POST /debug/reset`

These are internal runtime endpoints, not final public product API contracts.

## Snapshot Flow

`GET /snapshot` returns:

- shared `PublicTableView`
- optional `PrivatePlayerView` when `viewerSeatId` is supplied

The DO never returns raw `InternalRoomState`.

## WebSocket Flow

`GET /ws` upgrades into a Durable Object-managed WebSocket.

Each accepted socket stores a small attachment:

- `viewerSeatId`

That attachment is the current per-socket identity used for private view projection.

For now the mapping is provided by query string during upgrade. Proper authenticated seat binding will come later.

When a socket connects:

1. the DO accepts the socket with the hibernation-friendly API
2. the socket attachment stores `viewerSeatId`
3. the DO immediately sends a `room-snapshot`

When a socket sends a `player-action` message:

1. the DO reads the socket attachment
2. `viewerSeatId` becomes the acting seat
3. the domain command is dispatched
4. the DO persists state and increments `roomVersion`
5. the sender receives `command-ack` or `command-rejected`
6. every socket receives a fresh `room-snapshot`

This is the first real end-to-end room server loop.

## Command Flow

`POST /commands` accepts:

- `DomainCommand`
- optional `viewerSeatId`

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

- authenticated socket identity instead of query-string `viewerSeatId`
- alarm-driven timeout handling
- reconnect / resume policy
- lobby / join / buy-in flows replacing debug seat endpoints

At that point the room runtime starts looking like a full production table server instead of a controlled development skeleton.

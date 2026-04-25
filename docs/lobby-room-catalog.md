# Lobby Room Catalog

## Goal

OpenPoker MVP uses a fixed cash table catalog instead of user-created rooms.

This keeps the first lobby simple:

- players choose a stake
- players choose an open table
- the selected table maps directly to one Durable Object

The initial catalog is:

- `$1/$2`: 10 tables
- `$2/$5`: 10 tables
- `$5/$10`: 10 tables

## Why Fixed Tables First

Cash poker lobbies are usually stake-first.

For the MVP, user-created room settings would add avoidable surface area:

- custom blind sizes
- custom table names
- room privacy
- host ownership
- table configuration validation

Those can come later. The first useful product loop is choosing a stake and sitting down.

## Room IDs

Room IDs are deterministic.

Examples:

- `cash-nlhe-1-2-table-01`
- `cash-nlhe-1-2-table-10`
- `cash-nlhe-2-5-table-01`
- `cash-nlhe-5-10-table-10`

Durable Objects use these IDs through:

- `env.POKER_ROOM.idFromName(roomId)`

That means the room ID is both the lobby identifier and the DO identity.

## Chip Units

The current engine stores chip amounts as integers.

For these MVP cash tables, catalog amounts are expressed in cents:

- `$1/$2`: `100 / 200`
- `$2/$5`: `200 / 500`
- `$5/$10`: `500 / 1000`

The UI can format these integer amounts as dollars later.

## Buy-In Policy

The catalog keeps the same structure as the earlier default table:

- minimum buy-in: `50 big blinds`
- maximum buy-in: `200 big blinds`

So:

- `$1/$2`: `$100` to `$400`
- `$2/$5`: `$250` to `$1,000`
- `$5/$10`: `$500` to `$2,000`

The worker still treats these as integer chip units.

## API Flow

`GET /api/lobby/rooms` returns the fixed catalog plus live room status.

Each room includes:

- `roomId`
- `stakeKey`
- `tableNumber`
- `displayName`
- `smallBlind`
- `bigBlind`
- `minBuyIn`
- `maxBuyIn`
- `maxSeats`
- `occupiedSeatCount`
- `handEligibleSeatCount`
- `handStatus`
- `street`
- `nextHandStartAt`

The lobby route may touch all fixed Durable Objects to collect live health.

That is acceptable for the MVP because the catalog is intentionally small: 30 tables total.

## Room Validation

The worker rejects unknown room IDs before forwarding requests to a Durable Object.

The `PokerRoom` Durable Object also validates the room ID when it initializes. This double check matters because the DO is the authority for table config, not just the Hono edge route.

Unknown room IDs should fail instead of creating arbitrary tables.

## Future Options

This catalog can move to D1 later if the product needs:

- operator-managed table configs
- private tables
- event tables
- dynamic stake rollout
- region-specific table pools

Until then, code-defined fixed tables are simpler and easier to reason about.

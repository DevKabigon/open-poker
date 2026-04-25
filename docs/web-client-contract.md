# Web Client Contract

OpenPoker UI should treat the Worker and `PokerRoom` Durable Object as the only authoritative source for live table state. The web app may animate optimistic UI affordances, but it must not locally decide chip counts, pot totals, acting seats, or hand results.

## Current Client Boundary

- `@openpoker/protocol` owns shared HTTP and WebSocket message types.
- `apps/web/src/lib/api.ts` owns every Worker HTTP endpoint call and room WebSocket construction.
- `apps/web/src/lib/session-storage.ts` owns browser persistence for the current `{ roomId, sessionToken }`.
- UI components should import from `apps/web/src/lib` rather than calling `fetch()` directly.

## Environment

The web app uses:

```text
VITE_API_BASE_URL=http://localhost:8787
```

If `VITE_API_BASE_URL` is omitted, the client defaults to `http://localhost:8787`, which matches the local Wrangler Worker dev server.

## HTTP Endpoints

| Client helper | Worker route | Purpose |
| --- | --- | --- |
| `fetchLobbyRooms()` | `GET /api/lobby/rooms` | Lists the fixed cash-game room catalog with current table health. |
| `fetchRoomState(roomId, sessionToken?)` | `GET /api/rooms/:roomId/state` | Returns a public table snapshot and optional private view for the session. |
| `claimSeat(roomId, seatId, request)` | `POST /api/rooms/:roomId/seats/:seatId/claim` | Buys into a seat and receives a resumable session token. |
| `resumeSeatSession(roomId, request)` | `POST /api/rooms/:roomId/sessions/resume` | Revalidates a saved session token after reload or reconnect. |
| `leaveSeat(roomId, seatId, request)` | `POST /api/rooms/:roomId/seats/:seatId/leave` | Leaves a seat immediately or marks it sitting out if the hand is active. |
| `dispatchRoomCommand(roomId, request)` | `POST /api/rooms/:roomId/commands` | Sends command-handler requests for server-driven actions. |

## WebSocket

`createRoomWebSocket(roomId, sessionToken?)` builds:

```text
ws://localhost:8787/api/rooms/:roomId/ws?sessionToken=...
```

When production uses HTTPS, the helper automatically switches to `wss://`.

The server sends `ServerToClientMessage`:

- `room-snapshot`: authoritative public table view plus optional private player view.
- `command-ack`: confirms a socket command was accepted.
- `command-rejected`: returns the server-side rejection reason.

The client sends `ClientToServerMessage`:

- `join-room`: binds a socket to a resumable seat session.
- `player-action`: submits fold/check/call/bet/raise/all-in for the server to validate.

## Session Storage Rule

The browser only stores:

```json
{
  "roomId": "nlh-1-2-01",
  "sessionToken": "opaque-token-from-server",
  "savedAt": "2026-04-25T00:00:00.000Z"
}
```

Never store hole cards, stack values, betting state, or private table data in local storage. On reload, call `resumeSeatSession()` first; if it fails, clear the stored session and fall back to lobby/seat selection.

## UI Safety Rules

- Lobby occupancy can be rendered from `fetchLobbyRooms()`, but the table screen should refresh with `fetchRoomState()` or WebSocket `room-snapshot`.
- Seat buy-in success should call `writeStoredRoomSession()` only after `claimSeat()` returns.
- Leave-seat success should call `clearStoredRoomSession()` when the response disposition is `cleared`.
- Chip animations may run locally, but visible chip numbers should update from server snapshots only.
- Buttons may disable optimistically after click, but action availability must come from `PrivatePlayerView.allowedActions`.

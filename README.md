# OpenPoker

OpenPoker is being organized as a pnpm workspace with a clear separation between UI, realtime worker infrastructure, and poker domain logic.

## Workspace Layout

```text
open-poker/
  apps/
    web/        Solid + Vite frontend
    worker/     Hono + Cloudflare Workers + Durable Objects
  packages/
    domain/     Poker rules and state machine building blocks
    protocol/   Shared API and realtime message contracts
  docs/
```

## Commands

```bash
pnpm install
pnpm dev:web
pnpm dev:worker
pnpm build
pnpm typecheck
```

## Docs

- [OpenPoker development guide](./docs/openpoker-development-guide.md)

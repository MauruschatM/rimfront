## 2024-05-22 - Missing Rate Limiting and Validation in Matchmaking

**Vulnerability:** The `findOrCreateLobby` and `joinLobby` mutations in `packages/backend/convex/matchmaking.ts` do not implement any rate limiting or substantial validation on player names.
**Learning:** Game lobbies can be flooded with fake players/bots, potentially causing Denial of Service or degrading the experience for real players.
**Prevention:** Implement rate limiting on matchmaking endpoints and validate player inputs (e.g. name length, profanity filter).

## 2024-05-22 - Hardcoded Secrets Check

**Vulnerability:** Checked for hardcoded secrets and none were found using grep.
**Learning:** `better-auth` and `t3-oss/env-nextjs` are used effectively to manage secrets.
**Prevention:** Continue using environment variables and secret scanning tools.

## 2025-05-23 - Matchmaking IDOR Vulnerability

**Vulnerability:** `leaveLobby` and `forceStartLobby` mutations accepted a `playerId` argument without verifying if the authenticated user owned that player record. This allowed any user to force others to leave or start games.
**Learning:** In multiplayer games where users control specific entities (Players), always verify ownership (`user._id === player.userId`) before performing sensitive actions. Do not rely on client-provided IDs alone.
**Prevention:** Use a helper function or middleware to enforce ownership checks at the start of mutations. Explicitly handle bot accounts (no `userId`) to prevent unauthorized control.

# Sentinel's Journal

## 2024-05-22 - Missing Rate Limiting and Validation in Matchmaking

**Vulnerability:** The `findOrCreateLobby` and `joinLobby` mutations in `packages/backend/convex/matchmaking.ts` do not implement any rate limiting or substantial validation on player names.
**Learning:** Game lobbies can be flooded with fake players/bots, potentially causing Denial of Service or degrading the experience for real players.
**Prevention:** Implement rate limiting on matchmaking endpoints and validate player inputs (e.g. name length, profanity filter).

## 2024-05-22 - Hardcoded Secrets Check

**Vulnerability:** Checked for hardcoded secrets and none were found using grep.
**Learning:** `better-auth` and `t3-oss/env-nextjs` are used effectively to manage secrets.
**Prevention:** Continue using environment variables and secret scanning tools.

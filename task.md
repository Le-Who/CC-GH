## 🎯 Real-Time Sync & 30 Free Daily Taps Implementation

### Socket.io Real-Time Pipeline
- [x] Install `socket.io` and `socket.io-client` packages via terminal.
- [x] Initialize Socket.io on the Express HTTP server (`server.js` and `socketManager.js`).
- [x] Create an auth mechanism for Socket.io to associate socket connections with `userId`.
- [x] Update `playerManager.js` (`withPlayerLock`) to emit `player_sync` to the user's socket room whenever the lock commits changes to the database.
- [x] Update `src/vanilla/realtime.js` to connect to Socket.io, join the user's room, listen for `player_sync` events, and dispatch `applySyncPayload()` for seamless multi-device tracking.

### 30 Free Daily Taps (Merge)
- [x] Create `/api/merge/claim-free-taps` in `routes/mergeRoutes.js` that checks timestamp `p.merge.lastFreeTaps` and adds 30 taps to generators if a new day has started.
- [x] Update `src/vanilla/merge/panel.js` UI to display a 🎁 Claim button if eligible, tying it to the new `claimFreeTaps` API.
- [x] Add `claimFreeTaps` frontend API caller in `src/vanilla/merge/api.js`.

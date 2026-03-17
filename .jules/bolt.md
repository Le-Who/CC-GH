## 2024-03-17 - Supabase Realtime Fallback Mitigation
**Learning:** Supabase Realtime connections can drop unexpectedly and fallback to REST, causing out-of-sync visual glitches because state updates are lost in transit.
**Action:** When working with Realtime broadcast networks in this app, implement an IndexedDB offline queue that intercepts failed payloads (using a `catch` block on the `.send` promise and connection state guards) and flushes the most recent payload when the channel emits a 'SUBSCRIBED' event upon reconnection.

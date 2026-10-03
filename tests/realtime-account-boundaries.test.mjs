import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

// Real connection lifecycle; only socket transport and auth inputs are replaced.
const hooks = registerHooks({
  resolve(specifier, context, next) {
    const name = specifier === 'socket.io-client' ? 'socket' : specifier.endsWith('/platform/telegram.js') ? 'auth' : specifier.endsWith('/apiClient.js') ? 'config' : null;
    return name ? { shortCircuit: true, url: `realtime-boundary:${name}` } : next(specifier, context);
  },
  load(url, context, next) {
    const sources = {
      socket: `export function io() { const handlers = new Map(); const connection = { handlers, disconnects: 0, connects: 0, on(name, fn) { handlers.set(name, fn); }, disconnect() { this.disconnects++; }, connect() { this.connects++; } }; globalThis.__boundaryConnections.push(connection); return connection; }`,
      auth: `export function getTelegramAuthData() { return globalThis.__boundaryAuth; }`,
      config: `export function getPublicConfig() { return globalThis.__boundaryConfig(); }`,
    };
    return url.startsWith('realtime-boundary:') ? { shortCircuit: true, format: 'module', source: sources[url.split(':')[1]] } : next(url, context);
  },
});
const { connectRealtime, applyRealtimeConnectionStatus } = await import('../src/services/realtimeClient.js'); hooks.deregister();
beforeEach(() => {
  globalThis.__boundaryConnections = []; globalThis.__boundaryAuth = 'verified';
  globalThis.window = { location: { origin: 'http://local.test' } };
  globalThis.document = { hidden: false, listeners: new Set(), addEventListener(_, fn) { this.listeners.add(fn); }, removeEventListener(_, fn) { this.listeners.delete(fn); } };
});
const emit = (connection, id, seq) => connection.handlers.get('player_sync')({ seq, payload: { accountId: id, syncSeq: seq } });

test('a connected or disconnected socket cannot acknowledge a pending HTTP operation', async () => {
  let state = { status: 'syncing', message: '', owner: 'account-a' };
  const hub = { setState(update) { state = { ...state, ...update(state) }; } };
  const cleanup = await connectRealtime(() => {}, status => applyRealtimeConnectionStatus(hub, status));
  const connection = __boundaryConnections[0];
  connection.handlers.get('connect')(); connection.handlers.get('disconnect')();
  assert.deepEqual(state, { status: 'syncing', message: '', owner: 'account-a' });
  state = { ...state, status: 'ready', snapshotRequestPending: true };
  connection.handlers.get('connect')(); connection.handlers.get('disconnect')();
  assert.equal(state.status, 'ready'); assert.equal(state.snapshotRequestPending, true);
  state = { ...state, snapshotRequestPending: false };
  // Only the HTTP operation's completion ends syncing. Normal connection
  // availability remains observable once that owner has finished.
  state = { ...state, status: 'ready' }; connection.handlers.get('disconnect')();
  assert.equal(state.status, 'offline'); connection.handlers.get('connect')();
  assert.equal(state.status, 'ready'); assert.equal(state.owner, 'account-a'); cleanup();
});

test('realtime sequence belongs to its account and connection, including reconnect', async () => {
  const seen = [], cleanupA = await connectRealtime(value => seen.push(value)); const a = __boundaryConnections[0];
  emit(a, 'account-a', 100); emit(a, 'account-b', 1); emit(a, 'account-b', 1);
  assert.deepEqual(seen.map(value => [value.accountId, value.syncSeq]), [['account-a', 100], ['account-b', 1]]);
  cleanupA(); const cleanupB = await connectRealtime(value => seen.push(value)); emit(__boundaryConnections[1], 'account-b', 1);
  assert.equal(seen.length, 3); cleanupB();
});

test('retired realtime callbacks and cleanup cannot affect the replacement connection', async () => {
  const seen = [], statuses = [], cleanupA = await connectRealtime(value => seen.push(value), value => statuses.push(value)); const a = __boundaryConnections[0];
  const cleanupB = await connectRealtime(value => seen.push(value), value => statuses.push(value)); const b = __boundaryConnections[1];
  cleanupA(); emit(a, 'account-a', 999); a.handlers.get('disconnect')();
  emit(b, 'account-b', 1); b.handlers.get('connect')();
  assert.equal(b.disconnects, 0); assert.equal(seen.length, 1); assert.deepEqual(statuses, ['online']); cleanupB();
  assert.equal(document.listeners.size, 0);
});

test('overlapping auth resolution cannot create or report an obsolete connection', async () => {
  __boundaryAuth = ''; const releases = [], statuses = [];
  globalThis.__boundaryConfig = () => new Promise(resolve => releases.push(resolve));
  const old = connectRealtime(() => {}, value => statuses.push(`old:${value}`));
  const current = connectRealtime(() => {}, value => statuses.push(`current:${value}`));
  releases[1]({ devAuthEnabled: false }); await current;
  releases[0]({ devAuthEnabled: false }); await old;
  assert.deepEqual(statuses, ['current:offline']); assert.equal(__boundaryConnections.length, 0);
});

for(const returnToA of [false,true])test(`bound hub session fences socket data and status after A-B${returnToA?'-A':''}`,async()=>{
  let account='account-a',session={};const owner=session,seen=[],statuses=[];
  const cleanup=await connectRealtime(value=>seen.push(value),value=>statuses.push(value),{isCurrent:()=>account==='account-a'&&session===owner});
  const connection=__boundaryConnections[0];account='account-b';session={};if(returnToA){account='account-a';session={};}
  emit(connection,'account-a',999);connection.handlers.get('connect')();connection.handlers.get('disconnect')();
  assert.equal(seen.length,0);assert.equal(statuses.length,0);cleanup();assert.equal(connection.disconnects,1);
});

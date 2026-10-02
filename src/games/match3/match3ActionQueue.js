// Keep acknowledged Match3 writes ordered across renders and exit/re-entry.
// The shared action store intentionally rejects concurrent writes with the same key.
const queues = new WeakMap();

export function getQueuedMatch3Action(performAction) {
  if (queues.has(performAction)) return queues.get(performAction);
  const commands = [];
  let draining = false;
  async function drain() {
    if (draining) return;
    draining = true;
    while (commands.length) {
      const command = commands.shift();
      try {
        command.resolve(await performAction(command.action, command.payload, command.options));
      } catch (error) {
        command.reject(error);
      }
    }
    draining = false;
  }
  const enqueue = (action, payload, options) => new Promise((resolve, reject) => {
    commands.push({ action, payload, options, resolve, reject });
    void drain();
  });
  queues.set(performAction, enqueue);
  return enqueue;
}

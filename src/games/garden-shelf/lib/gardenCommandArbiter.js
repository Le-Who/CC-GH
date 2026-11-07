/** At most one explicit intent may wait behind a background heartbeat.
 * Other overlapping commands are refused, preserving duplicate-tap protection.
 * A failed/uncertain heartbeat never releases a new economic command.
 */
export function createGardenCommandArbiter({isCurrent, canDrain}) {
  let active = null, waiting = null, generation = 0;
  async function start(kind, work) {
    const ticket = {kind, generation};
    active = ticket;
    let confirmed = false;
    try {
      const result = await work();
      confirmed = result === true;
      return result;
    } finally {
      if (active === ticket) active = null;
      const queued = waiting;
      waiting = null;
      if (queued) {
        let allowed = false;
        try { allowed = confirmed && queued.generation === generation && isCurrent() && canDrain(); } catch {}
        if (allowed) start(queued.kind, queued.work).then(queued.resolve, queued.reject);
        else queued.resolve(false);
      }
    }
  }
  return {
    run(kind, work) {
      if (!isCurrent()) return Promise.resolve(false);
      if (!active) return start(kind, work);
      if (active.kind !== 'heartbeat' || active.generation !== generation || kind === 'heartbeat' || waiting) return Promise.resolve(false);
      return new Promise((resolve, reject) => { waiting = {kind, work, resolve, reject, generation}; });
    },
    cancel() {
      generation++;
      waiting?.resolve(false);
      waiting = null;
    },
  };
}

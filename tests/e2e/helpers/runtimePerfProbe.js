// Passed directly to page.addInitScript: keep this function self-contained.
export function installRuntimePerfProbe() {
  const probe = {
    supportedEntryTypes: [...(globalThis.PerformanceObserver?.supportedEntryTypes || [])],
    phases: [{ name: "navigation", startTime: 0 }],
    longTasks: [],
    longAnimationFrames: [],
  };
  const observers = [];
  const addEntries = (key, entries) => {
    for (const entry of entries) {
      const record = {
        name: entry.name,
        startTime: entry.startTime,
        duration: entry.duration,
      };
      if (key === "longAnimationFrames") {
        Object.assign(record, {
          blockingDuration: entry.blockingDuration || 0,
          renderStart: entry.renderStart || 0,
          styleAndLayoutStart: entry.styleAndLayoutStart || 0,
          scripts: Array.from(entry.scripts || [], script => ({
            sourceURL: String(script.sourceURL || "").split(/[?#]/)[0],
            sourceFunctionName: script.sourceFunctionName || "",
            invoker: script.invoker || "",
            invokerType: script.invokerType || "",
            startTime: script.startTime,
            duration: script.duration,
            forcedStyleAndLayoutDuration: script.forcedStyleAndLayoutDuration || 0,
          })),
        });
      }
      probe[key].push(record);
    }
  };
  for (const [type, key] of [["longtask", "longTasks"], ["long-animation-frame", "longAnimationFrames"]]) {
    if (!probe.supportedEntryTypes.includes(type)) continue;
    const observer = new PerformanceObserver(list => addEntries(key, list.getEntries()));
    observer.observe({ entryTypes: [type] });
    observers.push({ observer, key });
  }
  probe.mark = name => probe.phases.push({ name, startTime: performance.now() });
  probe.snapshot = () => {
    // Include queued entries, not just callbacks already delivered to this task.
    for (const { observer, key } of observers) addEntries(key, observer.takeRecords());
    return {
      capturedAt: performance.now(),
      supportedEntryTypes: [...probe.supportedEntryTypes],
      phases: probe.phases.map(phase => ({ ...phase })),
      longTasks: probe.longTasks.map(entry => ({ ...entry })),
      longAnimationFrames: probe.longAnimationFrames.map(entry => ({ ...entry })),
    };
  };
  window.__perfGuard = probe;
}

export function summarizeRuntimePerf(runtime) {
  const phases = runtime?.phases || [];
  const phaseFor = entry => [...phases].reverse().find(phase => entry.startTime >= phase.startTime)?.name || "unmarked";
  const counts = {};
  for (const key of ["longTasks", "longAnimationFrames"]) {
    for (const entry of runtime?.[key] || []) {
      const phase = phaseFor(entry);
      counts[phase] ||= { longTasks: 0, longAnimationFrames: 0 };
      counts[phase][key]++;
    }
  }
  return { longTasks: runtime?.longTasks?.length || 0, longAnimationFrames: runtime?.longAnimationFrames?.length || 0, phases: counts };
}

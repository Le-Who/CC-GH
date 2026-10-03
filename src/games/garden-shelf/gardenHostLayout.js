import repoLayout from '../../app/hud-layout/defaultLayouts/garden.json' with { type: 'json' };

const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;

/** The real Hub owns safe areas. Garden receives the remaining
 * measured frame, so it must not subtract those insets a second time. */
export function getGardenHostVariables(hudLayout = {}) {
  const defaults = repoLayout.base.regions;
  const composition = { ...defaults.gardenComposition, ...hudLayout?.regions?.gardenComposition };
  return {
    '--garden-host-padding': `${Math.max(0, finite(composition.padding, defaults.gardenComposition.padding))}px`,
    '--garden-dock-reserve': '0px',
  };
}

/** Deliberately scoped custom adapter; it never changes auth, state, or storage.
 * Restoring owned values prevents this lazy-loaded game's CSS leaking into tabs. */
export function applyGardenHostLayout(host, hudLayout) {
  if (!host) return () => {};
  const variables = getGardenHostVariables(hudLayout);
  const previousMarker = host.getAttribute('data-garden-presentation');
  const previous = Object.fromEntries(Object.keys(variables).map(key => [key, {
    value: host.style.getPropertyValue(key),
    priority: host.style.getPropertyPriority(key),
  }]));
  host.setAttribute('data-garden-presentation', 'living');
  for (const [key, value] of Object.entries(variables)) host.style.setProperty(key, value);
  let restored = false;
  return () => {
    if (restored) return;
    restored = true;
    for (const [key, record] of Object.entries(previous)) {
      if (host.style.getPropertyValue(key) !== variables[key]) continue;
      if (record.value) host.style.setProperty(key, record.value, record.priority);
      else host.style.removeProperty(key);
    }
    if (host.getAttribute('data-garden-presentation') === 'living') {
      if (previousMarker === null) host.removeAttribute('data-garden-presentation');
      else host.setAttribute('data-garden-presentation', previousMarker);
    }
  };
}

const FOCUSABLE_SELECTOR = "button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])";
const inertOwners = new WeakMap();

export function getDialogFocusableElements(dialog) {
  return Array.from(dialog.querySelectorAll(FOCUSABLE_SELECTOR)).filter((element) => (
    !element.closest("[hidden], [inert]") && element.getClientRects().length > 0
  ));
}

export function containDialogTab(event, dialog, activeElement) {
  if (event.key !== "Tab" || event.defaultPrevented) return;
  const elements = getDialogFocusableElements(dialog);
  const first = elements[0];
  const last = elements.at(-1);
  if (!first) {
    event.preventDefault();
    dialog.focus({ preventScroll: true });
  } else if (event.shiftKey && (activeElement === first || !elements.includes(activeElement))) {
    event.preventDefault();
    last.focus({ preventScroll: true });
  } else if (!event.shiftKey && (activeElement === last || !elements.includes(activeElement))) {
    event.preventDefault();
    first.focus({ preventScroll: true });
  }
}

// Keep the stage mounted (and saved game state intact), but unavailable beneath
// the dialog. Restore each sibling's prior state rather than blindly enabling it.
export function makeDialogSiblingsInert(dialog) {
  const siblings = Array.from(dialog.parentElement?.children || [])
    .filter((element) => element !== dialog && !element.hasAttribute("data-menu-blocker"));
  for (const element of siblings) {
    const ownership = inertOwners.get(element) || { count: 0, previous: element.inert };
    ownership.count += 1;
    inertOwners.set(element, ownership);
    element.inert = true;
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    for (const element of siblings) {
      const ownership = inertOwners.get(element);
      if (!ownership) continue;
      ownership.count -= 1;
      if (!ownership.count) {
        element.inert = ownership.previous;
        inertOwners.delete(element);
      }
    }
  };
}

/** Pending animation-frame focus work must belong to the current dialog.
 * A new opening/closing invalidates every older return-focus callback. */
export function createDialogFocusManager() {
  const owners = [];
  let generation = 0;
  const current = () => owners.findLast((owner) => owner.dialog.isConnected !== false);
  return {
    begin(dialog) {
      const owner = { dialog };
      owners.push(owner);
      generation += 1;
      let ended = false;
      return {
        isCurrent: () => !ended && current() === owner,
        end() {
          if (ended) return () => false;
          ended = true;
          // React may detach the DOM before passive-effect cleanup. Stack order,
          // not isConnected, determines which closing dialog owned focus.
          const wasCurrent = owners.at(-1) === owner;
          owners.splice(owners.indexOf(owner), 1);
          const releasedGeneration = ++generation;
          return (target, focused = null) => {
            if (!wasCurrent || generation !== releasedGeneration || !target || target.isConnected === false) return false;
            const active = current();
            if (active && !active.dialog.contains(target)) return false;
            // Respect focus already claimed by another modal or user action.
            if (focused?.isConnected !== false && focused && !dialog.contains(focused) && focused !== target) return false;
            return true;
          };
        },
      };
    },
  };
}

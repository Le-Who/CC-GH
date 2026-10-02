import { useEffect } from "react";
import { containDialogTab, createDialogFocusManager, getDialogFocusableElements, makeDialogSiblingsInert } from "./dialogFocus.js";

const focusManager = createDialogFocusManager();

/** A mounted dialog stays at natural size; its siblings stay mounted but inert.
 * Put data-menu-blocker on a sibling scrim that must still receive dismiss taps.
 * Escape/Back and the visible close action remain the caller's responsibility. */
export function useDialogFocus(dialogRef, { active = true, resetKey = "", inertSiblings = true, returnFocusRef = null } = {}) {
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!active || !dialog) return undefined;
    // The opener may already be disabled by the commit that mounted this dialog.
    const previousFocus = returnFocusRef?.current || document.activeElement;
    const stage = dialog.parentElement;
    const ownership = focusManager.begin(dialog);
    const restoreSiblings = inertSiblings ? makeDialogSiblingsInert(dialog) : () => {};
    const frame = window.requestAnimationFrame(() => {
      if (!ownership.isCurrent()) return;
      (getDialogFocusableElements(dialog)[0] || dialog).focus({ preventScroll: true });
    });
    const handleKeyDown = (event) => containDialogTab(event, dialog, document.activeElement);
    dialog.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      dialog.removeEventListener("keydown", handleKeyDown);
      const mayRestore = ownership.end();
      restoreSiblings();
      // A game's pause trigger may be re-mounted on resume.
      window.requestAnimationFrame(() => {
        const target = previousFocus !== document.body && previousFocus?.isConnected && !previousFocus.closest?.("[inert]")
          ? previousFocus
          : stage?.querySelector("[data-game-pause]") || stage?.querySelector("[data-dialog-focus-fallback]") || stage?.querySelector(".game-play-actions button:not(:disabled)");
        const focused = document.activeElement === document.body ? null : document.activeElement;
        if (mayRestore(target, focused) && !target.closest?.("[inert]")) target.focus?.({ preventScroll: true });
      });
    };
  }, [active, dialogRef, inertSiblings, resetKey, returnFocusRef]);
}

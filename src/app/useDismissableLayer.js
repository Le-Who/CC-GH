import { useEffect } from "react";

export function useEscapeDismiss(active, onDismiss) {
  useEffect(() => {
    if (!active || typeof onDismiss !== "function") return undefined;
    const handleKeyDown = (event) => {
      if (event.key !== "Escape" || event.defaultPrevented || event.isComposing) return;
      event.preventDefault();
      event.stopPropagation();
      onDismiss(event);
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [active, onDismiss]);
}

export function useOutsideDismiss(active, layerRef, onDismiss) {
  useEffect(() => {
    if (!active || typeof onDismiss !== "function") return undefined;
    const handlePointerDown = (event) => {
      const layer = layerRef?.current;
      if (!layer || !(event.target instanceof Node) || layer.contains(event.target)) return;
      onDismiss(event);
    };
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [active, layerRef, onDismiss]);
}

export function isInteractiveDismissTarget(target) {
  return target instanceof Element
    && !!target.closest("button, a, input, select, textarea, [role='button'], [role='dialog'], [data-dismiss-keep='true']");
}

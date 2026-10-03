import { useEffect } from "react";

const escapeLayers = [];
let escapeSerial = 0;

function dismissTopLayer(event) {
  if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing) return;
  const layer = escapeLayers.reduce((top, item) => !top || item.priority > top.priority || (item.priority === top.priority && item.order > top.order) ? item : top, null);
  if (!layer) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  layer.dismiss(event);
}

export function useEscapeDismiss(active, onDismiss, { priority = 0 } = {}) {
  useEffect(() => {
    if (!active || typeof onDismiss !== "function") return undefined;
    const layer = { dismiss: onDismiss, priority, order: ++escapeSerial };
    if (!escapeLayers.length) window.addEventListener('keydown', dismissTopLayer, true);
    escapeLayers.push(layer);
    return () => {
      const index = escapeLayers.indexOf(layer);
      if (index >= 0) escapeLayers.splice(index, 1);
      if (!escapeLayers.length) window.removeEventListener('keydown', dismissTopLayer, true);
    };
  }, [active, onDismiss, priority]);
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

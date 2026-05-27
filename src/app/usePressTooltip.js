import { useCallback, useEffect, useId, useRef, useState } from "react";

export function usePressTooltip(label, delayMs = 360) {
  const tooltipId = useId();
  const timerRef = useRef(null);
  const [visible, setVisible] = useState(false);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const hide = useCallback(() => {
    clearTimer();
    setVisible(false);
  }, [clearTimer]);

  const show = useCallback(() => {
    if (label) setVisible(true);
  }, [label]);

  const start = useCallback(() => {
    clearTimer();
    if (!label) return;
    timerRef.current = window.setTimeout(show, delayMs);
  }, [clearTimer, delayMs, label, show]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) hide();
    };
    window.addEventListener("blur", hide);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearTimer();
      window.removeEventListener("blur", hide);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [clearTimer, hide]);

  return {
    visible,
    tooltipId,
    handlers: {
      onPointerDown: start,
      onPointerUp: hide,
      onPointerCancel: hide,
      onPointerLeave: hide,
      onFocus: show,
      onBlur: hide,
    },
  };
}

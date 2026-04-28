import { useEffect, useRef } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, Pause, Sparkles } from "lucide-react";
import { audioManager } from "../services/audioManager.js";
import { useAppI18n } from "./i18n.jsx";
export function formatCount(value) {
  if (value == null) return "0";
  if (value >= 10000) return `${(value / 1000).toFixed(1)}k`;
  return String(value);
}

export function PanelButton({ children, icon: Icon = Sparkles, onClick, disabled, danger, subtle, active, title, className = "" }) {
  return (
    <button
      type="button"
      className={`panel-button${danger ? " danger" : ""}${subtle ? " subtle" : ""}${active ? " active" : ""}${className ? ` ${className}` : ""}`}
      disabled={disabled}
      aria-label={title || (typeof children === "string" ? children : undefined)}
      onClick={(event) => {
        audioManager.play("tap");
        onClick?.(event);
      }}
      title={title}
    >
      <Icon size={17} />
      <span>{children}</span>
    </button>
  );
}

export function Stat({ icon: Icon, label, value }) {
  return (
    <div className="stat-chip">
      <Icon size={17} />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function PauseBrief({ gameId, kicker, title, body, status = [] }) {
  return (
    <div className="pause-menu-frame pause-menu-brief" data-pause-menu={gameId}>
      <span className="pause-menu-kicker">{kicker}</span>
      <strong>{title}</strong>
      <small>{body}</small>
      {status.length > 0 && (
        <div className="pause-status-line">
          {status.map((item) => (
            <span key={item.label}>
              {item.label} <b>{item.value}</b>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function GamePlayHud({ title, subtitle, stats = [], onPause, onFinish, finishLabel = null, extraActions = null, className = "" }) {
  const reduceMotion = useReducedMotion();
  const { t } = useAppI18n();
  return (
    <motion.div
      className={`game-play-hud ${className}`.trim()}
      initial={reduceMotion ? false : { opacity: 0, y: -14 }}
      animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
      transition={{ duration: reduceMotion ? 0.01 : 0.2, ease: "easeOut" }}
    >
      <div className="game-play-title">
        <strong>{title}</strong>
        <span>{subtitle}</span>
      </div>
      <div className="game-play-stats">
        {stats.map((item) => (
          <span key={item.label}>
            {item.label} <strong>{item.value}</strong>
          </span>
        ))}
      </div>
      <div className="game-play-actions">
        {extraActions}
        <PanelButton icon={Pause} subtle onClick={onPause}>{t("common.pause")}</PanelButton>
        {onFinish && <PanelButton icon={Check} onClick={onFinish}>{finishLabel || t("common.settle")}</PanelButton>}
      </div>
    </motion.div>
  );
}

export function GameShell({ gameId, phase, skin = "cycle", children, hud, overlay, overlayClassName = "", className = "" }) {
  const reduceMotion = useReducedMotion();
  const overlayRef = useRef(null);

  useEffect(() => {
    if (phase === "playing") return undefined;
    const frame = window.requestAnimationFrame(() => {
      const target = overlayRef.current?.querySelector("button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])");
      target?.focus?.({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [gameId, phase]);

  return (
    <div
      className={`game-layout game-shell shell-${phase} shell-skin-${skin}${className ? ` ${className}` : ""}`}
      data-game-shell={gameId}
    >
      {children}
      {phase === "playing" && hud}
      <AnimatePresence initial={false} mode="wait">
        {phase !== "playing" && (
          <motion.aside
            key={`${gameId}-${phase}`}
            ref={overlayRef}
            className={`side-panel game-menu-overlay ${overlayClassName}`}
            role="dialog"
            aria-modal="true"
            aria-label={`${gameId} ${phase} menu`}
            data-menu-phase={phase}
            tabIndex={-1}
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0.01 : 0.22, ease: "easeOut" }}
          >
            {overlay}
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  );
}

export function SectionTabs({ tabs, active, onChange }) {
  return (
    <div className="section-tabs" role="tablist">
      {tabs.map((tab) => (
        <button key={tab.id} className={active === tab.id ? "active" : ""} onClick={() => onChange(tab.id)}>
          {tab.label}
        </button>
      ))}
    </div>
  );
}

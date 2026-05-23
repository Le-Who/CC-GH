import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Pause, Sparkles } from "lucide-react";
import { audioManager } from "../services/audioManager.js";
import { useAppI18n } from "./i18n.jsx";
import { useGameEvents } from "../game-state/gameEvents.js";
import { useEscapeDismiss } from "./useDismissableLayer.js";
import { HudEditableRegion, HudRegion } from "./hud-layout/index.js";

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

export function Stat({ icon: Icon, image = "", label, value, progress = null, onClick = null, active = false, title = "", id = "", dataGardenXp = false }) {
  const Tag = onClick ? "button" : "div";
  const boundedProgress = progress == null ? null : Math.max(0, Math.min(100, Number(progress) || 0));
  return (
    <Tag
      type={onClick ? "button" : undefined}
      className={`stat-chip${onClick ? " clickable" : ""}${active ? " active" : ""}`}
      onClick={onClick || undefined}
      title={title || undefined}
      data-stat-id={id || undefined}
      data-garden-xp={dataGardenXp ? "true" : undefined}
    >
      {image ? (
        <img className="stat-icon-image" src={image} alt="" draggable={false} />
      ) : (
        <Icon size={17} />
      )}
      <span>{label}</span>
      <strong>{value}</strong>
      {boundedProgress != null && (
        <i className="stat-progress" aria-hidden="true">
          <b style={{ transform: `scaleX(${boundedProgress / 100})` }} />
        </i>
      )}
    </Tag>
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

export function GameEventLog({ gameId = null, limit = 2, className = "" }) {
  const events = useGameEvents((state) => state.events);
  const visibleEvents = useMemo(() => (
    events
      .filter((event) => !gameId || event.game === gameId)
      .slice(0, Math.max(1, Number(limit) || 1))
  ), [events, gameId, limit]);

  return (
    <HudEditableRegion
      id="eventLog"
      as="div"
      applyLayout={false}
      className={`game-play-event-log${className ? ` ${className}` : ""}`}
      aria-live="polite"
      aria-atomic="false"
      data-empty={visibleEvents.length ? undefined : "true"}
    >
      {visibleEvents.map((event) => (
        <p key={event.id} className={`tone-${event.tone}`}>
          <b>{event.title}</b>
          {event.value && <strong>{event.value}</strong>}
        </p>
      ))}
    </HudEditableRegion>
  );
}

export function GamePlayHud({ title, subtitle, stats = [], onPause, onFinish, finishLabel = null, extraActions = null, className = "", gameId = null }) {
  const { t } = useAppI18n();
  return (
    <HudEditableRegion
      id="gameplayHud"
      as="div"
      className={`game-play-hud${gameId ? " has-event-log" : ""}${className ? ` ${className}` : ""}`.trim()}
    >
      <div className="game-play-title">
        <strong>{title}</strong>
        {subtitle && <span>{subtitle}</span>}
      </div>
      {gameId && <GameEventLog gameId={gameId} />}
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
    </HudEditableRegion>
  );
}

export function GameShell({ gameId, phase, skin = "cycle", children, hud, overlay, overlayClassName = "", className = "", onDismiss = null, style = undefined }) {
  const { t } = useAppI18n();
  const overlayRef = useRef(null);
  const [overlaySize, setOverlaySize] = useState({ width: 356, height: 534 });
  const canDismissOverlay = phase !== "playing" && typeof onDismiss === "function";

  useEscapeDismiss(canDismissOverlay, onDismiss);

  useEffect(() => {
    if (phase === "playing") return undefined;
    const frame = window.requestAnimationFrame(() => {
      const target = overlayRef.current?.querySelector("button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])");
      target?.focus?.({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [gameId, phase]);

  useEffect(() => {
    if (!overlayRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
          setOverlaySize({
            width: entry.contentRect.width,
            height: entry.contentRect.height
          });
        }
      }
    });
    observer.observe(overlayRef.current);
    return () => observer.disconnect();
  }, [phase]);

  const scale = Math.min(overlaySize.width / 356, overlaySize.height / 534);

  return (
    <HudRegion
      id="gameShell"
      as="div"
      className={`game-layout game-shell shell-${phase} shell-skin-${skin}${className ? ` ${className}` : ""}`}
      data-game-shell={gameId}
      style={style}
    >
      {children}
      {phase === "playing" && hud}
      {canDismissOverlay && (
        <button
          type="button"
          className="game-menu-dismiss"
          aria-label={t("common.close")}
          onClick={onDismiss}
        />
      )}
      {phase !== "playing" && (
        <HudEditableRegion
          id="pauseOverlay"
          as="aside"
          key={`${gameId}-${phase}`}
          ref={overlayRef}
          className={`side-panel game-menu-overlay ${overlayClassName}`}
          role="dialog"
          aria-modal="true"
          aria-label={`${gameId} ${phase} menu`}
          data-menu-phase={phase}
          tabIndex={-1}
        >
          <div className="game-menu-scaler" style={{ transform: `translate(-50%, -50%) scale(${scale})` }}>
            {overlay}
          </div>
        </HudEditableRegion>
      )}
    </HudRegion>
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

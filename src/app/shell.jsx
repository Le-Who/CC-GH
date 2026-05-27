import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Pause, Sparkles } from "lucide-react";
import { audioManager } from "../services/audioManager.js";
import { useAppI18n } from "./i18n.jsx";
import { useGameEvents } from "../game-state/gameEvents.js";
import { useEscapeDismiss } from "./useDismissableLayer.js";
import { HudEditableRegion, HudRegion } from "./hud-layout/index.js";
import { usePressTooltip } from "./usePressTooltip.js";

export function formatCount(value) {
  if (value == null) return "0";
  if (value >= 10000) return `${(value / 1000).toFixed(1)}k`;
  return String(value);
}

const HUD_SEMANTIC_ICON_IDS = {
  garden: { gold: "stat-gold", levelXp: "stat-level-xp", quest: "stat-quest" },
  blox: { score: "stat-score", lines: "stat-lines", reward: "stat-reward", pause: "action-pause" },
  match3: { score: "stat-score", moves: "stat-moves", time: "stat-moves", combo: "stat-combo", reward: "stat-reward", mix: "action-mix", pause: "action-pause" },
  bubbo: { score: "stat-score", shots: "stat-shots", time: "stat-shots", pressure: "stat-pressure", reward: "stat-reward", pause: "action-pause", swap: "action-swap" },
  trivia: { score: "stat-score", streak: "stat-streak", time: "stat-time", fifty: "action-fifty", reveal: "action-reveal", pause: "action-pause" },
};

export function semanticHudIconPath(gameId, id) {
  const iconId = HUD_SEMANTIC_ICON_IDS[gameId]?.[id];
  return iconId ? `/games/hud-redesign/${gameId}/semantic-icons/${iconId}.png` : "";
}

function mergeHandlers(first, second) {
  return (event) => {
    first?.(event);
    second?.(event);
  };
}

function Tooltip({ id, label, visible }) {
  if (!visible || !label) return null;
  return (
    <em id={id} role="tooltip" className="press-tooltip">
      {label}
    </em>
  );
}

export function PanelButton({
  children,
  icon: Icon = Sparkles,
  image = "",
  onClick,
  disabled,
  danger,
  subtle,
  active,
  title,
  tooltip = "",
  iconOnly = false,
  className = "",
  ...buttonProps
}) {
  const label = tooltip || title || (typeof children === "string" ? children : undefined);
  const tip = usePressTooltip(label);
  return (
    <button
      type="button"
      className={`panel-button${danger ? " danger" : ""}${subtle ? " subtle" : ""}${active ? " active" : ""}${iconOnly ? " icon-only" : ""}${className ? ` ${className}` : ""}`}
      disabled={disabled}
      aria-label={label}
      aria-describedby={tip.visible ? tip.tooltipId : undefined}
      data-tooltip={label || undefined}
      data-icon-only={iconOnly ? "true" : undefined}
      onClick={(event) => {
        audioManager.play("tap");
        onClick?.(event);
      }}
      onPointerDown={mergeHandlers(buttonProps.onPointerDown, tip.handlers.onPointerDown)}
      onPointerUp={mergeHandlers(buttonProps.onPointerUp, tip.handlers.onPointerUp)}
      onPointerCancel={mergeHandlers(buttonProps.onPointerCancel, tip.handlers.onPointerCancel)}
      onPointerLeave={mergeHandlers(buttonProps.onPointerLeave, tip.handlers.onPointerLeave)}
      onFocus={mergeHandlers(buttonProps.onFocus, tip.handlers.onFocus)}
      onBlur={mergeHandlers(buttonProps.onBlur, tip.handlers.onBlur)}
      title={label}
    >
      {image ? <img className="panel-button-icon-image" src={image} alt="" draggable={false} /> : <Icon size={17} />}
      <span className="panel-button-label">{children}</span>
      <Tooltip id={tip.tooltipId} label={label} visible={tip.visible} />
    </button>
  );
}

export function Stat({ icon: Icon, image = "", label, value, progress = null, onClick = null, active = false, title = "", id = "", dataGardenXp = false, labelMode = "visible" }) {
  const Tag = onClick ? "button" : "div";
  const boundedProgress = progress == null ? null : Math.max(0, Math.min(100, Number(progress) || 0));
  const accessibleLabel = `${label}: ${value}`;
  const tip = usePressTooltip(labelMode === "tooltip" ? label : "");
  return (
    <Tag
      type={onClick ? "button" : undefined}
      className={`stat-chip${onClick ? " clickable" : ""}${active ? " active" : ""}`}
      onClick={onClick || undefined}
      title={title || label || undefined}
      aria-label={accessibleLabel}
      aria-describedby={tip.visible ? tip.tooltipId : undefined}
      data-stat-id={id || undefined}
      data-garden-xp={dataGardenXp ? "true" : undefined}
      data-label-mode={labelMode}
      data-tooltip={labelMode === "tooltip" ? label : undefined}
      tabIndex={labelMode === "tooltip" && !onClick ? 0 : undefined}
      onPointerDown={tip.handlers.onPointerDown}
      onPointerUp={tip.handlers.onPointerUp}
      onPointerCancel={tip.handlers.onPointerCancel}
      onPointerLeave={tip.handlers.onPointerLeave}
      onFocus={tip.handlers.onFocus}
      onBlur={tip.handlers.onBlur}
    >
      {image ? (
        <img className="stat-icon-image" src={image} alt="" draggable={false} />
      ) : (
        <Icon size={17} />
      )}
      <span className="stat-chip-label">{label}</span>
      <strong>{value}</strong>
      <Tooltip id={tip.tooltipId} label={label} visible={tip.visible} />
      {boundedProgress != null && (
        <i className="stat-progress" aria-hidden="true">
          <b style={{ transform: `scaleX(${boundedProgress / 100})` }} />
        </i>
      )}
    </Tag>
  );
}

function GamePlayStat({ item, gameId }) {
  const label = item.label || "";
  const boundedProgress = item.progress == null ? null : Math.max(0, Math.min(100, Number(item.progress) || 0));
  const image = item.image || semanticHudIconPath(gameId, item.id);
  const tip = usePressTooltip(label);
  return (
    <span
      className="game-play-stat"
      data-stat-id={item.id || undefined}
      data-label-mode="tooltip"
      data-tooltip={label || undefined}
      aria-label={`${label}: ${item.value}`}
      aria-describedby={tip.visible ? tip.tooltipId : undefined}
      title={label || undefined}
      onPointerDown={tip.handlers.onPointerDown}
      onPointerUp={tip.handlers.onPointerUp}
      onPointerCancel={tip.handlers.onPointerCancel}
      onPointerLeave={tip.handlers.onPointerLeave}
      onFocus={tip.handlers.onFocus}
      onBlur={tip.handlers.onBlur}
      tabIndex={0}
    >
      {image && <img className="game-play-stat-icon" src={image} alt="" draggable={false} />}
      <small className="game-play-stat-label">{label}</small>
      <strong>{item.value}</strong>
      <Tooltip id={tip.tooltipId} label={label} visible={tip.visible} />
      {boundedProgress != null && (
        <i className="game-play-stat-progress" aria-hidden="true">
          <b style={{ transform: `scaleX(${boundedProgress / 100})` }} />
        </i>
      )}
    </span>
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
  const visibleEventCount = useGameEvents((state) => (
    gameId ? state.events.filter((event) => event.game === gameId).length : 0
  ));
  const hasEventLog = Boolean(gameId && visibleEventCount);
  return (
    <HudEditableRegion
      id="gameplayHud"
      as="div"
      className={`game-play-hud${hasEventLog ? " has-event-log" : ""}${className ? ` ${className}` : ""}`.trim()}
    >
      <div className="game-play-title">
        <strong>{title}</strong>
        {subtitle && <span>{subtitle}</span>}
      </div>
      {hasEventLog && <GameEventLog gameId={gameId} />}
      <div className="game-play-stats">
        {stats.map((item) => <GamePlayStat key={item.id || item.label} item={item} gameId={gameId} />)}
      </div>
      <div className="game-play-actions">
        {extraActions}
        <PanelButton icon={Pause} image={semanticHudIconPath(gameId, "pause")} subtle iconOnly onClick={onPause}>{t("common.pause")}</PanelButton>
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

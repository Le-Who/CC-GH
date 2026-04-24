import React, { Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";
import {
  Blocks,
  Bot,
  Gem,
  Leaf,
  PackageOpen,
  Pickaxe,
  RotateCcw,
  Sparkles,
  Trophy,
  Zap,
} from "lucide-react";
import { initTelegramPlatform, getTelegramUser, haptic } from "./platform/telegram.js";
import { api, getPublicConfig } from "./services/apiClient.js";
import { connectRealtime } from "./services/realtimeClient.js";

const PixiGameHost = lazy(() => import("./game-runtime/PixiGameHost.jsx"));

const TABS = [
  { id: "farm", label: "Farm", icon: Leaf },
  { id: "blox", label: "Blox", icon: Blocks },
  { id: "match3", label: "Gems", icon: Gem },
  { id: "merge", label: "Merge", icon: PackageOpen },
  { id: "trivia", label: "Trivia", icon: Bot },
];

const TRIVIA_FALLBACK = [
  {
    question: "Which runtime renders CC-GH game boards after this migration?",
    answers: ["PixiJS", "Unity WebGL", "Godot export", "Native canvas only"],
    correct: 0,
  },
  {
    question: "Which service is the durable source of player saves?",
    answers: ["PostgreSQL", "Redis", "localStorage", "Socket.IO"],
    correct: 0,
  },
];

function Stat({ label, value, icon: Icon }) {
  return (
    <div className="stat-chip">
      <Icon size={16} />
      <span>{label}</span>
      <strong>{value ?? "0"}</strong>
    </div>
  );
}

function ActionButton({ children, icon: Icon = Sparkles, onClick, variant = "primary", disabled }) {
  return (
    <button className={`action-button ${variant}`} onClick={onClick} disabled={disabled}>
      <Icon size={18} />
      <span>{children}</span>
    </button>
  );
}

function GamePanel({ activeTab, state, refreshAll, setState }) {
  const [sceneModule, setSceneModule] = useState(null);

  useEffect(() => {
    if (activeTab === "trivia") return;
    let cancelled = false;
    import("./game-runtime/scenes.js").then((mod) => {
      if (!cancelled) setSceneModule(mod);
    });
    return () => {
      cancelled = true;
    };
  }, [activeTab]);

  const sceneBuilder = useCallback(
    (app) => {
      if (!sceneModule) return () => {};
      if (activeTab === "farm") return sceneModule.buildFarmScene(app, state.farm);
      if (activeTab === "blox") return sceneModule.buildBloxScene(app, state.blox);
      if (activeTab === "match3") return sceneModule.buildMatch3Scene(app, state.match3);
      if (activeTab === "merge") return sceneModule.buildMergeScene(app, state.merge);
      return () => {};
    },
    [activeTab, state, sceneModule],
  );

  if (activeTab === "trivia") {
    return <TriviaPanel />;
  }

  return (
    <section className="game-surface">
      <Suspense fallback={<div className="pixi-host loading">Loading renderer</div>}>
        {sceneModule ? (
          <PixiGameHost sceneKey={activeTab} buildScene={sceneBuilder} />
        ) : (
          <div className="pixi-host loading">Loading renderer</div>
        )}
      </Suspense>
      <GameActions activeTab={activeTab} state={state} setState={setState} refreshAll={refreshAll} />
    </section>
  );
}

function GameActions({ activeTab, state, setState, refreshAll }) {
  const [busy, setBusy] = useState(false);

  async function run(path, body, after) {
    setBusy(true);
    const res = await api(path, body);
    setBusy(false);
    if (res.error) {
      haptic("warning");
      setState((prev) => ({ ...prev, message: res.error }));
      return;
    }
    haptic("success");
    after?.(res);
    await refreshAll();
  }

  if (activeTab === "farm") {
    const firstEmpty = state.farm?.plots?.find((plot) => !plot.crop);
    const planted = state.farm?.plots?.find((plot) => plot.crop);
    return (
      <div className="action-row">
        <ActionButton icon={Leaf} disabled={busy || !firstEmpty} onClick={() => run("/api/farm/plant", { plotId: firstEmpty?.id ?? 0, cropId: "strawberry" })}>
          Plant
        </ActionButton>
        <ActionButton icon={Zap} variant="secondary" disabled={busy || !planted} onClick={() => run("/api/farm/water", { plotId: planted?.id ?? 0 })}>
          Water
        </ActionButton>
        <ActionButton icon={Pickaxe} variant="secondary" disabled={busy || !planted} onClick={() => run("/api/farm/harvest", { plotId: planted?.id ?? 0 })}>
          Harvest
        </ActionButton>
      </div>
    );
  }

  if (activeTab === "blox") {
    return (
      <div className="action-row">
        <ActionButton disabled={busy} onClick={() => run("/api/blox/start", {})}>Start</ActionButton>
        <ActionButton icon={Trophy} variant="secondary" disabled={busy} onClick={() => run("/api/blox/end", { score: 120 })}>Score</ActionButton>
      </div>
    );
  }

  if (activeTab === "match3") {
    return (
      <div className="action-row">
        <ActionButton disabled={busy} onClick={() => run("/api/game/start", { mode: "classic" })}>Start</ActionButton>
        <ActionButton icon={Trophy} variant="secondary" disabled={busy} onClick={() => run("/api/game/end", { score: 640 })}>Finish</ActionButton>
      </div>
    );
  }

  return (
    <div className="action-row">
      <ActionButton disabled={busy} onClick={() => run("/api/merge/claim-free-taps", {})}>30 Taps</ActionButton>
      <ActionButton icon={Sparkles} variant="secondary" disabled={busy} onClick={() => run("/api/merge/free-pull", {})}>Free Pull</ActionButton>
    </div>
  );
}

function TriviaPanel() {
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState(null);
  const current = TRIVIA_FALLBACK[index % TRIVIA_FALLBACK.length];

  return (
    <section className="trivia-panel">
      <div className="trivia-question">{current.question}</div>
      <div className="answer-grid">
        {current.answers.map((answer, answerIndex) => (
          <button
            key={answer}
            className={
              selected == null
                ? "answer-button"
                : answerIndex === current.correct
                  ? "answer-button correct"
                  : selected === answerIndex
                    ? "answer-button wrong"
                    : "answer-button"
            }
            onClick={() => {
              setSelected(answerIndex);
              haptic(answerIndex === current.correct ? "success" : "warning");
            }}
          >
            {answer}
          </button>
        ))}
      </div>
      <ActionButton
        icon={RotateCcw}
        variant="secondary"
        onClick={() => {
          setSelected(null);
          setIndex((value) => value + 1);
        }}
      >
        Next
      </ActionButton>
    </section>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState("farm");
  const [platform, setPlatform] = useState(null);
  const [config, setConfig] = useState(null);
  const [state, setState] = useState({
    farm: {},
    blox: {},
    match3: {},
    merge: {},
    resources: null,
    message: "",
  });
  const [status, setStatus] = useState("booting");

  const user = useMemo(() => getTelegramUser(), [platform]);

  const refreshAll = useCallback(async () => {
    setStatus("syncing");
    const [farm, blox, match3, merge, resources] = await Promise.all([
      api("/api/farm/state", {}),
      api("/api/blox/state", {}),
      api("/api/game/state", {}),
      api("/api/merge/state", {}),
      api("/api/resources/state"),
    ]);
    setState((prev) => ({
      ...prev,
      farm: farm.error ? prev.farm : farm,
      blox: blox.error ? prev.blox : blox,
      match3: match3.error ? prev.match3 : match3,
      merge: merge.error ? prev.merge : merge,
      resources: resources.error ? prev.resources : resources.resources,
      message: [farm, blox, match3, merge, resources].find((item) => item.error)?.error || "",
    }));
    setStatus("ready");
  }, []);

  useEffect(() => {
    let cleanupRealtime = () => {};
    async function boot() {
      const [platformState, publicConfig] = await Promise.all([
        initTelegramPlatform(),
        getPublicConfig(),
      ]);
      setPlatform(platformState);
      setConfig(publicConfig);
      await refreshAll();
      cleanupRealtime = await connectRealtime(
        (payload) => {
          setState((prev) => ({
            ...prev,
            resources: payload.resources || prev.resources,
            farm: payload.plots ? { ...prev.farm, plots: payload.plots, harvested: payload.harvested } : prev.farm,
            merge: payload.merge ? { ...prev.merge, merge: payload.merge } : prev.merge,
          }));
        },
        (nextStatus) => setStatus(nextStatus === "online" ? "ready" : "offline"),
      );
    }
    boot();
    return () => cleanupRealtime();
  }, [refreshAll]);

  const resources = state.resources || state.farm?.resources || state.merge?.resources || {};

  return (
    <main className="telegram-app">
      <header className="topbar">
        <div>
          <p className="eyebrow">Telegram Mini App</p>
          <h1>Game Hub</h1>
        </div>
        <div className={`status-dot ${status}`}>{status}</div>
      </header>

      <section className="profile-strip">
        <div className="avatar">{(user?.firstName || user?.first_name || user?.username || "G").slice(0, 1)}</div>
        <div>
          <strong>{user?.username || user?.firstName || user?.first_name || "Player"}</strong>
          <span>{config?.telegramBotUsername ? `@${config.telegramBotUsername}` : "VPS runtime"}</span>
        </div>
      </section>

      <section className="stats-row">
        <Stat icon={Sparkles} label="Gold" value={resources.gold} />
        <Stat icon={Zap} label="Energy" value={resources.energy?.current ?? resources.energy} />
        <Stat icon={Trophy} label="Tokens" value={resources.gachaTokens} />
      </section>

      {state.message && <div className="notice">{state.message}</div>}

      <GamePanel activeTab={activeTab} state={state} setState={setState} refreshAll={refreshAll} />

      <nav className="bottom-tabs">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={activeTab === id ? "active" : ""}
            onClick={() => {
              setActiveTab(id);
              haptic("light");
            }}
          >
            <Icon size={19} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </main>
  );
}

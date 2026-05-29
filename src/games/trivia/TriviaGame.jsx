import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronRight, Eye, Home, Play, RotateCcw, Sparkles, Trophy, Users } from "lucide-react";
import { api } from "../../services/apiClient.js";
import { useGameHub } from "../../game-state/useGameHub.js";
import { HudEditableRegion, HudRegion } from "../../app/hud-layout/index.js";
import { GamePlayHud, PanelButton, PauseBrief, semanticHudIconPath } from "../../app/shell.jsx";
import { useExitToHub, useImmersiveGame, useSnapshot } from "../../app/gameHooks.js";
import { useAppI18n } from "../../app/i18n.jsx";
import { getQuestionTiming, useQuestionTimer } from "./useQuestionTimer.js";
import "./i18n.js";
import "./trivia.css";

export default function TriviaGame() {
  const snapshot = useSnapshot();
  const loadSnapshot = useGameHub((state) => state.loadSnapshot);
  const exitToHub = useExitToHub();
  const { t } = useAppI18n();
  const [view, setView] = useState("menu");
  const [question, setQuestion] = useState(null);
  const [sessionScore, setSessionScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [difficulty, setDifficulty] = useState("medium");
  const [category, setCategory] = useState("");
  const [roomId, setRoomId] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [duelStatus, setDuelStatus] = useState(null);
  const [history, setHistory] = useState([]);
  const [paused, setPaused] = useState(false);
  const [reveal, setReveal] = useState(null);
  const [lifelines, setLifelines] = useState({ fifty: 1, reveal: 1, audience: 1 });
  const [hiddenAnswers, setHiddenAnswers] = useState([]);
  const [hintAnswer, setHintAnswer] = useState("");
  const [audiencePoll, setAudiencePoll] = useState({});
  const revealTimerRef = useRef(null);
  const duelStartInFlightRef = useRef("");
  const activeDuelRoomRef = useRef("");
  const inShell = view !== "menu";
  const questionActive = (view === "solo" || view === "duel-play") && question;
  const isPlaying = questionActive && !paused;
  const activePause = questionActive && paused;
  const questionTiming = useQuestionTimer(question, (question?.timeLimit || 15) * 1000, paused);
  const pauseRun = useCallback(() => {
    if (questionActive) setPaused(true);
  }, [questionActive]);
  const shellControls = useMemo(() => ({
    activeRun: !!questionActive,
    pauseRun,
    hudState: {
      score: sessionScore,
      streak,
      timeLeft: Math.ceil(questionTiming.remainingMs / 1000),
    },
  }), [pauseRun, questionActive, questionTiming.remainingMs, sessionScore, streak]);
  useImmersiveGame("trivia", inShell, shellControls);

  useEffect(() => () => window.clearTimeout(revealTimerRef.current), []);

  useEffect(() => {
    api("/api/trivia/duel/history").then((data) => {
      if (data?.items) setHistory(data.items);
      else if (Array.isArray(data?.history)) setHistory(data.history);
    });
  }, [view]);

  async function startSolo() {
    const data = await api("/api/trivia/start", { category, difficulty });
    if (data.error) {
      useGameHub.setState({ message: data.error });
      return;
    }
    setQuestion(data.question);
    setSessionScore(0);
    setStreak(0);
    setReveal(null);
    setLifelines({ fifty: 1, reveal: 1, audience: 1 });
    setHiddenAnswers([]);
    setHintAnswer("");
    setAudiencePoll({});
    setRoomId("");
    setDuelStatus(null);
    duelStartInFlightRef.current = "";
    activeDuelRoomRef.current = "";
    setPaused(false);
    setView("solo");
    await loadSnapshot();
  }

  async function submitAnswer(answer) {
    if (paused || reveal) return;
    if (hiddenAnswers.includes(answer)) return;
    const path = view === "duel-play" ? "/api/trivia/duel/answer" : "/api/trivia/answer";
    const timing = getQuestionTiming(questionTiming.startedAt, Date.now(), (question?.timeLimit || 15) * 1000, questionTiming.pausedMs);
    const timeMs = Math.max(1, Math.round(timing.timeMs));
    const data = await api(path, view === "duel-play" ? { roomId, answer, timeMs } : { answer, timeMs });
    if (data.error) {
      useGameHub.setState({ message: data.error });
      return;
    }
    setReveal({
      answer,
      correct: !!data.correct,
      correctAnswer: data.correctAnswer,
      points: Number(data.points) || 0,
      timeMs,
    });
    window.clearTimeout(revealTimerRef.current);
    revealTimerRef.current = window.setTimeout(async () => {
      setSessionScore(data.sessionScore ?? data.score ?? sessionScore);
      setStreak(data.streak || 0);
      setReveal(null);
      setHiddenAnswers([]);
      setHintAnswer("");
      setAudiencePoll({});
      if (data.nextQuestion) {
        setQuestion(data.nextQuestion);
      } else {
        setQuestion(null);
        setPaused(false);
        setView(data.results ? "duel-results" : "results");
        setDuelStatus(data.results || data);
        await loadSnapshot();
      }
    }, 1100);
  }

  async function createDuel() {
    const data = await api("/api/trivia/duel/create", { category, difficulty });
    if (data.error) {
      useGameHub.setState({ message: data.error });
      return;
    }
    setRoomId(data.roomId);
    setDuelStatus(data);
    setReveal(null);
    setHiddenAnswers([]);
    setHintAnswer("");
    setAudiencePoll({});
    setQuestion(null);
    duelStartInFlightRef.current = "";
    activeDuelRoomRef.current = "";
    setPaused(false);
    setView("duel-room");
  }

  async function joinDuel() {
    const data = await api("/api/trivia/duel/join", { inviteCode: joinCode.trim().toUpperCase() });
    if (data.error) {
      useGameHub.setState({ message: data.error });
      return;
    }
    setRoomId(data.roomId);
    setDuelStatus(data);
    setPaused(false);
    setQuestion(null);
    activeDuelRoomRef.current = "";
    if (data.status === "active") {
      await startDuel(data.roomId);
      return;
    }
    setView("duel-room");
  }

  async function readyDuel() {
    const data = await api("/api/trivia/duel/ready", { roomId });
    if (data.error) {
      useGameHub.setState({ message: data.error });
      return;
    }
    await pollDuelStatus(roomId);
  }

  async function startDuel(targetRoomId = roomId) {
    const nextRoomId = targetRoomId || roomId;
    if (!nextRoomId) return;
    if (duelStartInFlightRef.current === nextRoomId) return;
    if (activeDuelRoomRef.current === nextRoomId && question) return;
    duelStartInFlightRef.current = nextRoomId;
    let data;
    try {
      data = await api("/api/trivia/duel/start", { roomId: nextRoomId });
      if (data.error) {
        useGameHub.setState({ message: data.error });
        return;
      }
    } finally {
      if (duelStartInFlightRef.current === nextRoomId) duelStartInFlightRef.current = "";
    }
    setRoomId(nextRoomId);
    activeDuelRoomRef.current = nextRoomId;
    setQuestion(data.question);
    setReveal(null);
    setLifelines({ fifty: 1, reveal: 1, audience: 1 });
    setHiddenAnswers([]);
    setHintAnswer("");
    setAudiencePoll({});
    setPaused(false);
    setView("duel-play");
  }

  async function useLifeline(type) {
    if (!question || view !== "solo") return;
    const data = await api("/api/trivia/lifeline", { type });
    if (data.error) {
      useGameHub.setState({ message: data.error });
      return;
    }
    if (data.lifelines) setLifelines(data.lifelines);
    if (Array.isArray(data.hiddenAnswers)) setHiddenAnswers(data.hiddenAnswers);
    if (data.correctAnswer) setHintAnswer(data.correctAnswer);
    if (data.audiencePoll) setAudiencePoll(data.audiencePoll);
  }

  async function pollDuelStatus(id = roomId) {
    if (!id) return;
    const data = await api(`/api/trivia/duel/status/${id}`);
    if (!data.error) setDuelStatus(data);
    if (data.status === "active") await startDuel(data.roomId || id);
  }

  return (
    <HudRegion
      id="triviaShell"
      as="div"
      className={`trivia-shell${inShell ? ` game-shell ${isPlaying ? "shell-playing" : "shell-paused"}` : ""}`}
      data-trivia-view={view}
      data-trivia-playing={isPlaying ? "true" : undefined}
    >
      <HudEditableRegion id="triviaBackgroundAsset" as="div" className="trivia-background-asset" aria-hidden="true" />
      <aside className="trivia-card">
        <div className="panel-header">
          <div>
            <strong>{t("trivia.title")}</strong>
            <span>{t("trivia.total", { score: snapshot?.trivia?.totalScore || 0, streak: snapshot?.trivia?.bestStreak || 0 })}</span>
          </div>
        </div>
        {isPlaying && (
          <GamePlayHud
            gameId="trivia"
            title={t("trivia.title")}
            subtitle={`${question.category || t("trivia.fallbackCategory")} · ${question.difficulty || difficulty}`}
            stats={[
              { id: "score", label: t("common.score"), value: sessionScore },
              { id: "streak", label: t("trivia.streakLabel"), value: streak || 0 },
              { id: "time", label: t("common.time"), value: Math.ceil(questionTiming.remainingMs / 1000) },
            ]}
            onPause={() => setPaused(true)}
          />
        )}
        {view === "menu" && (
          <>
            <div className="form-grid">
              <label>
                {t("trivia.category")}
                <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder={t("trivia.any")} />
              </label>
              <label>
                {t("trivia.difficulty")}
                <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
                  <option value="easy">{t("trivia.easy")}</option>
                  <option value="medium">{t("trivia.medium")}</option>
                  <option value="hard">{t("trivia.hard")}</option>
                  <option value="all">{t("trivia.all")}</option>
                </select>
              </label>
            </div>
            <div className="button-row">
              <PanelButton icon={Play} onClick={startSolo}>{t("trivia.solo")}</PanelButton>
              <PanelButton icon={Trophy} onClick={createDuel}>{t("trivia.createDuel")}</PanelButton>
            </div>
            <div className="join-row">
              <input value={joinCode} onChange={(e) => setJoinCode(e.target.value)} placeholder={t("trivia.inviteCode")} />
              <PanelButton icon={ChevronRight} onClick={joinDuel}>{t("trivia.join")}</PanelButton>
            </div>
          </>
        )}
        {(view === "solo" || view === "duel-play") && question && (
          <QuestionPanel
            question={question}
            score={sessionScore}
            streak={streak}
            submitAnswer={submitAnswer}
            reveal={reveal}
            timing={questionTiming}
            lifelines={view === "solo" ? lifelines : null}
            hiddenAnswers={hiddenAnswers}
            hintAnswer={hintAnswer}
            audiencePoll={audiencePoll}
            paused={activePause}
            onFifty={() => useLifeline("fifty")}
            onReveal={() => useLifeline("reveal")}
            onAudience={() => useLifeline("audience")}
          />
        )}
        {view === "duel-room" && (
          <div className="duel-box">
            <strong>{t("trivia.invite", { code: duelStatus?.inviteCode || roomId })}</strong>
            <span>{t("trivia.status", { status: duelStatus?.status || t("trivia.waiting") })}</span>
            <div className="button-row">
              <PanelButton icon={Check} onClick={readyDuel}>{t("common.ready")}</PanelButton>
              <PanelButton icon={RotateCcw} onClick={() => pollDuelStatus()}>{t("common.refresh")}</PanelButton>
            </div>
          </div>
        )}
        {(view === "results" || view === "duel-results") && (
          <div className="results-box">
            <Trophy size={42} />
            <strong>{t("trivia.finished")}</strong>
            <span>{t("common.score")} {sessionScore}</span>
            <PanelButton
              icon={RotateCcw}
              onClick={() => {
                setPaused(false);
                setView("menu");
              }}
            >
              {t("common.back")}
            </PanelButton>
          </div>
        )}
      </aside>
      <HudEditableRegion id="triviaPausePanel" as="aside" className={`side-panel${inShell ? " game-menu-overlay trivia-pause-overlay" : ""}`}>
        {inShell && (
          <div className="panel-header pause-panel-header">
            <div>
              <strong>{view === "results" || view === "duel-results" ? t("trivia.result") : t("common.pause")}</strong>
              <span>{activePause ? t("pause.paused") : `${t("common.score")} ${sessionScore} · ${t("trivia.streak", { streak: streak || 0 })}`}</span>
            </div>
          </div>
        )}
        {inShell && (
          <PauseBrief
            gameId="trivia"
            kicker={paused ? t("pause.paused") : t("trivia.result")}
            title={questionActive ? t("pause.triviaFrozen") : t("pause.triviaReady")}
            body={questionActive ? t("pause.triviaIntro") : t("pause.triviaResults")}
            status={questionActive ? [
              { label: t("common.score"), value: sessionScore },
              { label: t("trivia.streakLabel"), value: streak || 0 },
              { label: t("common.questionShort"), value: question ? `${(question.index ?? 0) + 1}/${question.total || "?"}` : "-" },
            ] : []}
          />
        )}
        {inShell && (
          <div className="pause-action-stack">
            {activePause && <PanelButton icon={Play} className="pause-primary" onClick={() => setPaused(false)}>{t("common.resume")}</PanelButton>}
            <div className="button-row two">
              <PanelButton
                icon={RotateCcw}
                subtle
                onClick={() => {
                  setPaused(false);
                  setQuestion(null);
                  setReveal(null);
                  setView("menu");
                }}
              >
                {t("common.setup")}
              </PanelButton>
              <PanelButton
                icon={Home}
                danger
                onClick={() => {
                  setPaused(false);
                  setQuestion(null);
                  setReveal(null);
                  setView("menu");
                  exitToHub();
                }}
              >
                {t("common.exit")}
              </PanelButton>
            </div>
          </div>
        )}
        {!activePause && (
          <>
            <strong>{t("trivia.recentDuels")}</strong>
            <div className="panel-scroll compact-list">
              {history.length ? history.map((item, index) => (
                <span key={item.roomId || index}>{item.roomId || t("trivia.duel")} · {item.status || item.result || t("trivia.played")}</span>
              )) : <span>{t("trivia.noDuels")}</span>}
            </div>
          </>
        )}
      </HudEditableRegion>
    </HudRegion>
  );
}

function QuestionPanel({ question, score, streak, submitAnswer, reveal, timing, lifelines = null, hiddenAnswers = [], hintAnswer = "", audiencePoll = {}, paused = false, onFifty, onReveal, onAudience }) {
  const { t } = useAppI18n();
  const remainingSeconds = Math.ceil((timing?.remainingMs || 0) / 1000);
  return (
    <HudEditableRegion id="triviaQuestionPanel" as="div" className={`question-panel${reveal ? " revealing" : ""}`}>
      <HudEditableRegion id="triviaQuestionSurfaceAsset" as="div" className="trivia-question-surface-asset" aria-hidden="true" />
      <div className="question-meta">
        <span>{t("trivia.question", { current: (question.index ?? 0) + 1, total: question.total || "?" })}</span>
        <span>{t("common.score")} {score}</span>
        <span>{streak ? t("trivia.streak", { streak }) : t("trivia.noStreak")}</span>
      </div>
      <h2>{question.question}</h2>
      <small>{question.category} · {question.difficulty} · {remainingSeconds}s</small>
      <i className="trivia-timer-bar" aria-hidden="true"><b style={{ transform: `scaleX(${timing?.progress ?? 1})` }} /></i>
      {lifelines && (
        <div className="trivia-lifeline-dock">
          <PanelButton icon={Users} subtle disabled={!!reveal || lifelines.audience <= 0} onClick={onAudience}>{t("trivia.lifeline.audience")} {lifelines.audience}</PanelButton>
          <PanelButton icon={Sparkles} image={semanticHudIconPath("trivia", "fifty")} subtle disabled={!!reveal || lifelines.fifty <= 0} onClick={onFifty}>50/50 {lifelines.fifty}</PanelButton>
          <PanelButton icon={Eye} image={semanticHudIconPath("trivia", "reveal")} subtle disabled={!!reveal || lifelines.reveal <= 0} onClick={onReveal}>{t("trivia.lifeline.reveal")} {lifelines.reveal}</PanelButton>
        </div>
      )}
      <div className="answer-grid">
        {(question.answers || []).map((answer) => {
          const isHidden = hiddenAnswers.includes(answer);
          const isHinted = hintAnswer && answer === hintAnswer;
          const isCorrect = reveal && answer === reveal.correctAnswer;
          const isChosenWrong = reveal && answer === reveal.answer && !reveal.correct;
          return (
          <button
            key={answer}
            className={`${isCorrect ? "correct" : ""}${isChosenWrong ? " incorrect" : ""}${isHidden ? " hidden-by-lifeline" : ""}${isHinted ? " hinted" : ""}`.trim()}
            disabled={paused || !!reveal || isHidden}
            onClick={() => submitAnswer(answer)}
          >
            <span>{isHidden ? "—" : answer}</span>
            {audiencePoll?.[answer] != null && !isHidden && <small className="audience-poll">{audiencePoll[answer]}%</small>}
          </button>
          );
        })}
      </div>
      {reveal && (
        <div className={`trivia-reveal ${reveal.correct ? "correct" : "incorrect"}`}>
          <strong>{reveal.correct ? t("trivia.correct") : t("trivia.incorrect")}</strong>
          <span>{t("trivia.answerTime", { ms: reveal.timeMs })}</span>
          {reveal.points > 0 && <b>+{reveal.points}</b>}
        </div>
      )}
    </HudEditableRegion>
  );
}

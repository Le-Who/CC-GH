import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronRight, Home, Play, RotateCcw, Trophy } from "lucide-react";
import { api } from "../../services/apiClient.js";
import { useGameHub } from "../../game-state/useGameHub.js";
import { GamePlayHud, PanelButton, PauseBrief } from "../../app/shell.jsx";
import { useExitToHub, useImmersiveGame, useSnapshot } from "../../app/gameHooks.js";
import { useAppI18n } from "../../app/i18n.jsx";
import { getQuestionTiming, useQuestionTimer } from "./useQuestionTimer.js";
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
  const revealTimerRef = useRef(null);
  const inShell = view !== "menu";
  const questionActive = (view === "solo" || view === "duel-play") && question;
  const isPlaying = questionActive && !paused;
  const activePause = questionActive && paused;
  const questionTiming = useQuestionTimer(question, (question?.timeLimit || 15) * 1000);
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
    setPaused(false);
    setView("solo");
    await loadSnapshot();
  }

  async function submitAnswer(answer) {
    if (reveal) return;
    const path = view === "duel-play" ? "/api/trivia/duel/answer" : "/api/trivia/answer";
    const timing = getQuestionTiming(questionTiming.startedAt, Date.now(), (question?.timeLimit || 15) * 1000);
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
    setView(data.status === "active" ? "duel-play" : "duel-room");
  }

  async function readyDuel() {
    const data = await api("/api/trivia/duel/ready", { roomId });
    if (data.error) {
      useGameHub.setState({ message: data.error });
      return;
    }
    await pollDuelStatus(roomId);
  }

  async function startDuel() {
    const data = await api("/api/trivia/duel/start", { roomId });
    if (data.error) {
      useGameHub.setState({ message: data.error });
      return;
    }
    setQuestion(data.question);
    setReveal(null);
    setPaused(false);
    setView("duel-play");
  }

  async function pollDuelStatus(id = roomId) {
    if (!id) return;
    const data = await api(`/api/trivia/duel/status/${id}`);
    if (!data.error) setDuelStatus(data);
    if (data.status === "active") await startDuel();
  }

  return (
    <div className={`trivia-shell${inShell ? ` game-shell ${isPlaying ? "shell-playing" : "shell-paused"}` : ""}`}>
      <aside className="trivia-card">
        <div className="panel-header">
          <div>
            <strong>{t("trivia.title")}</strong>
            <span>{t("trivia.total", { score: snapshot?.trivia?.totalScore || 0, streak: snapshot?.trivia?.bestStreak || 0 })}</span>
          </div>
        </div>
        {isPlaying && (
          <GamePlayHud
            title={t("trivia.title")}
            subtitle={`${question.category || t("trivia.fallbackCategory")} · ${question.difficulty || difficulty}`}
            stats={[
              { label: t("common.score"), value: sessionScore },
              { label: t("trivia.streakLabel"), value: streak || 0 },
              { label: t("common.time"), value: Math.ceil(questionTiming.remainingMs / 1000) },
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
          <QuestionPanel question={question} score={sessionScore} streak={streak} submitAnswer={submitAnswer} reveal={reveal} timing={questionTiming} />
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
      <aside className={`side-panel${inShell ? " game-menu-overlay trivia-pause-overlay" : ""}`}>
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
      </aside>
    </div>
  );
}

function QuestionPanel({ question, score, streak, submitAnswer, reveal, timing }) {
  const { t } = useAppI18n();
  const remainingSeconds = Math.ceil((timing?.remainingMs || 0) / 1000);
  return (
    <div className={`question-panel${reveal ? " revealing" : ""}`}>
      <div className="question-meta">
        <span>{t("trivia.question", { current: (question.index ?? 0) + 1, total: question.total || "?" })}</span>
        <span>{t("common.score")} {score}</span>
        <span>{streak ? t("trivia.streak", { streak }) : t("trivia.noStreak")}</span>
      </div>
      <h2>{question.question}</h2>
      <small>{question.category} · {question.difficulty} · {remainingSeconds}s</small>
      <i className="trivia-timer-bar" aria-hidden="true"><b style={{ transform: `scaleX(${timing?.progress ?? 1})` }} /></i>
      <div className="answer-grid">
        {(question.answers || []).map((answer) => {
          const isCorrect = reveal && answer === reveal.correctAnswer;
          const isChosenWrong = reveal && answer === reveal.answer && !reveal.correct;
          return (
          <button
            key={answer}
            className={`${isCorrect ? "correct" : ""}${isChosenWrong ? " incorrect" : ""}`.trim()}
            disabled={!!reveal}
            onClick={() => submitAnswer(answer)}
          >
            {answer}
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
    </div>
  );
}

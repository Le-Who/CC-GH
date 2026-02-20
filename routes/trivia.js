/**
 * ═══════════════════════════════════════════════════════
 *  Game Hub — Trivia Routes (Solo & Duel)
 *  Question selection, solo sessions, duel rooms, history
 * ═══════════════════════════════════════════════════════
 */
import { Router } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  ECONOMY,
  calcRegen,
  pickQuestions,
  makeClientQuestion,
} from "../game-logic.js";
import { getPlayer, debouncedSaveDb } from "../playerManager.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load questions from data file
const QUESTIONS = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "..", "data", "questions.json"),
    "utf-8",
  ),
);

export default function triviaRoutes(requireAuth, resolveUser) {
  const router = Router();

  /* ═══════════════════════════════════════════════════
   *  SOLO MODE
   * ═══════════════════════════════════════════════════ */

  function _pickQuestions(count = 5, difficulty = "all") {
    return pickQuestions(QUESTIONS, count, difficulty);
  }

  router.post("/api/trivia/start", requireAuth, (req, res) => {
    const { userId, username } = resolveUser(req);
    const { count = 5, difficulty } = req.body;
    if (!userId) return res.status(400).json({ error: "userId required" });
    const p = getPlayer(userId, username);
    calcRegen(p);

    // Energy check
    if (p.resources.energy.current < ECONOMY.COST_TRIVIA) {
      return res.status(400).json({
        error: "NOT_ENOUGH_ENERGY",
        required: ECONOMY.COST_TRIVIA,
        current: p.resources.energy.current,
      });
    }
    p.resources.energy.current -= ECONOMY.COST_TRIVIA;

    const questions = _pickQuestions(count, difficulty);
    p.trivia.session = {
      questions,
      index: 0,
      answers: [],
      score: 0,
      streak: 0,
      startedAt: Date.now(),
    };
    debouncedSaveDb();

    res.json({
      success: true,
      resources: p.resources,
      stats: {
        totalScore: p.trivia.totalScore,
        bestStreak: p.trivia.bestStreak,
        totalPlayed: p.trivia.totalPlayed,
      },
      question: makeClientQuestion(questions[0], 0, questions.length),
    });
  });

  router.post("/api/trivia/forfeit", requireAuth, (req, res) => {
    const { userId } = resolveUser(req);
    const p = getPlayer(userId);
    const s = p.trivia.session;
    if (!s) return res.status(400).json({ error: "no session" });

    // Mark session complete with current stats
    p.trivia.totalScore += s.score;
    p.trivia.totalCorrect += s.answers.filter((a) => a.correct).length;
    p.trivia.totalPlayed++;
    p.trivia.bestStreak = Math.max(p.trivia.bestStreak, s.streak);
    const finalScore = s.score;
    p.trivia.session = null;
    debouncedSaveDb();

    res.json({
      success: true,
      score: finalScore,
      stats: {
        totalScore: p.trivia.totalScore,
        bestStreak: p.trivia.bestStreak,
        totalPlayed: p.trivia.totalPlayed,
        totalCorrect: p.trivia.totalCorrect,
      },
    });
  });

  router.post("/api/trivia/answer", requireAuth, (req, res) => {
    const { userId } = resolveUser(req);
    const { answer, timeMs } = req.body;
    const p = getPlayer(userId);
    const s = p.trivia.session;
    if (!s) return res.status(400).json({ error: "no session" });
    const q = s.questions[s.index];
    if (!q) return res.status(400).json({ error: "done" });

    const correct = answer === q.correctAnswer;
    const timeBonus = correct
      ? Math.max(0, Math.floor((q.timeLimit * 1000 - (timeMs || 0)) / 100))
      : 0;
    const points = correct ? q.points + timeBonus : 0;

    s.answers.push({ answer, correct, points, timeMs });
    s.score += points;
    s.streak = correct ? s.streak + 1 : 0;
    s.index++;

    const isComplete = s.index >= s.questions.length;
    let goldReward = 0;
    if (isComplete) {
      p.trivia.totalScore += s.score;
      const correctCount = s.answers.filter((a) => a.correct).length;
      p.trivia.totalCorrect += correctCount;
      p.trivia.totalPlayed++;
      p.trivia.bestStreak = Math.max(p.trivia.bestStreak, s.streak);
      // Gold reward: win (>50% correct) or lose
      const triviaWin = correctCount > s.questions.length / 2;
      goldReward = triviaWin
        ? ECONOMY.REWARD_TRIVIA_WIN
        : ECONOMY.REWARD_TRIVIA_LOSE;
      p.resources.gold += goldReward;
      p.trivia.session = null;
      debouncedSaveDb();
    }

    let nextQuestion = null;
    if (!isComplete)
      nextQuestion = makeClientQuestion(
        s.questions[s.index],
        s.index,
        s.questions.length,
      );

    res.json({
      correct,
      points,
      timeBonus,
      correctAnswer: q.correctAnswer,
      sessionScore: s.score,
      streak: s.streak,
      isComplete,
      nextQuestion,
      resources: isComplete ? p.resources : undefined,
      goldReward: isComplete ? goldReward : undefined,
      stats: isComplete
        ? {
            totalScore: p.trivia.totalScore,
            bestStreak: p.trivia.bestStreak,
            totalPlayed: p.trivia.totalPlayed,
            totalCorrect: p.trivia.totalCorrect,
          }
        : undefined,
    });
  });

  /* ═══════════════════════════════════════════════════
   *  DUEL SYSTEM
   * ═══════════════════════════════════════════════════ */
  const duelRooms = new Map(); // roomId -> duel state
  const duelHistory = []; // Circular buffer of finished duel results (max 50)
  const DUEL_HISTORY_MAX = 50;
  const DUEL_WAIT_EXPIRY_MS = 3 * 60 * 1000; // 3 min for waiting rooms
  const DUEL_FINISH_EXPIRY_MS = 10 * 60 * 1000; // 10 min for finished rooms

  // Periodic cleanup of stale duel rooms
  setInterval(() => {
    const now = Date.now();
    for (const [id, room] of duelRooms) {
      const age = now - room.createdAt;
      if (room.status === "waiting" && age > DUEL_WAIT_EXPIRY_MS) {
        duelRooms.delete(id);
      } else if (room.status === "finished" && age > DUEL_FINISH_EXPIRY_MS) {
        duelRooms.delete(id);
      }
    }
  }, 60_000);

  function generateCode() {
    return Math.random().toString(36).slice(2, 8).toUpperCase();
  }

  router.post("/api/trivia/duel/create", requireAuth, (req, res) => {
    const { userId, username } = resolveUser(req);
    const { count = 5, difficulty } = req.body;
    if (!userId) return res.status(400).json({ error: "userId required" });
    const p = getPlayer(userId, username);
    calcRegen(p);

    // Energy check
    if (p.resources.energy.current < ECONOMY.COST_TRIVIA) {
      return res.status(400).json({
        error: "NOT_ENOUGH_ENERGY",
        required: ECONOMY.COST_TRIVIA,
        current: p.resources.energy.current,
      });
    }
    p.resources.energy.current -= ECONOMY.COST_TRIVIA;

    const roomId = generateCode();
    const inviteCode = roomId; // Same for simplicity in demo
    const questions = _pickQuestions(count, difficulty);

    duelRooms.set(roomId, {
      roomId,
      inviteCode,
      questions,
      players: {
        [userId]: {
          userId,
          username: p.username,
          answers: [],
          score: 0,
          streak: 0,
          finished: false,
          startedAt: null,
        },
      },
      createdAt: Date.now(),
      status: "waiting", // waiting -> active -> finished
    });
    debouncedSaveDb();

    res.json({
      success: true,
      resources: p.resources,
      roomId,
      inviteCode,
      questionCount: questions.length,
    });
  });

  router.post("/api/trivia/duel/join", requireAuth, (req, res) => {
    const { userId, username } = resolveUser(req);
    const { inviteCode } = req.body;
    if (!userId || !inviteCode)
      return res.status(400).json({ error: "userId and inviteCode required" });

    const room = duelRooms.get(inviteCode.toUpperCase());
    if (!room) return res.status(404).json({ error: "Room not found" });
    // Check if room has expired
    if (
      room.status === "waiting" &&
      Date.now() - room.createdAt > DUEL_WAIT_EXPIRY_MS
    ) {
      duelRooms.delete(inviteCode.toUpperCase());
      return res.status(404).json({ error: "Room expired" });
    }
    if (room.status === "finished")
      return res.status(400).json({ error: "Duel already finished" });
    // Self-join guard — can't join your own room
    if (room.players[userId])
      return res.status(400).json({
        error: "You're already in this room — share the code with a friend!",
      });
    if (Object.keys(room.players).length >= 2)
      return res.status(400).json({ error: "Room is full" });

    const p = getPlayer(userId, username);
    if (!room.players[userId]) {
      room.players[userId] = {
        userId,
        username: p.username,
        answers: [],
        score: 0,
        streak: 0,
        finished: false,
        startedAt: null,
      };
    }

    // Move to lobby when 2 players joined (ready-up required)
    if (Object.keys(room.players).length >= 2) room.status = "lobby";

    const playerNames = Object.values(room.players).map((pl) => pl.username);
    res.json({
      success: true,
      roomId: room.roomId,
      status: room.status,
      players: playerNames,
      questionCount: room.questions.length,
    });
  });

  router.post("/api/trivia/duel/start", requireAuth, (req, res) => {
    const { userId } = resolveUser(req);
    const { roomId } = req.body;
    const room = duelRooms.get(roomId);
    if (!room) return res.status(404).json({ error: "Room not found" });
    if (!room.players[userId])
      return res.status(403).json({ error: "Not in this room" });
    if (room.players[userId].finished)
      return res.status(400).json({ error: "Already finished" });

    room.players[userId].startedAt = Date.now();
    const first = room.questions[0];
    res.json({
      success: true,
      question: makeClientQuestion(first, 0, room.questions.length),
      opponent:
        Object.values(room.players)
          .filter((pl) => pl.userId !== userId)
          .map((pl) => pl.username)[0] || "Waiting...",
    });
  });

  router.post("/api/trivia/duel/answer", requireAuth, (req, res) => {
    const { userId } = resolveUser(req);
    const { roomId, answer, timeMs } = req.body;
    const room = duelRooms.get(roomId);
    if (!room) return res.status(404).json({ error: "Room not found" });
    const dp = room.players[userId];
    if (!dp) return res.status(403).json({ error: "Not in this room" });
    if (dp.finished) return res.status(400).json({ error: "Already finished" });

    const qIndex = dp.answers.length;
    const q = room.questions[qIndex];
    if (!q) return res.status(400).json({ error: "No more questions" });

    const correct = answer === q.correctAnswer;
    const timeBonus = correct
      ? Math.max(0, Math.floor((q.timeLimit * 1000 - (timeMs || 0)) / 100))
      : 0;
    const points = correct ? q.points + timeBonus : 0;

    dp.answers.push({ answer, correct, points, timeMs });
    dp.score += points;
    dp.streak = correct ? dp.streak + 1 : 0;

    const isComplete = dp.answers.length >= room.questions.length;
    if (isComplete) {
      dp.finished = true;
      dp.finishedAt = Date.now();
      // Check if both finished
      const allDone = Object.values(room.players).every((pl) => pl.finished);
      if (allDone) {
        room.status = "finished";
        // Record to duel history
        const sorted = Object.values(room.players).sort(
          (a, b) => b.score - a.score,
        );
        const winner =
          sorted[0].score > sorted[1]?.score
            ? sorted[0].username
            : sorted[0].score === sorted[1]?.score
              ? "Tie"
              : sorted[0].username;
        duelHistory.unshift({
          roomId: room.roomId,
          finishedAt: Date.now(),
          players: Object.values(room.players).map((pl) => ({
            userId: pl.userId,
            username: pl.username,
            score: pl.score,
            correctCount: pl.answers.filter((a) => a.correct).length,
            totalQuestions: room.questions.length,
          })),
          winner,
        });
        if (duelHistory.length > DUEL_HISTORY_MAX)
          duelHistory.length = DUEL_HISTORY_MAX;
      }
    }

    let nextQuestion = null;
    if (!isComplete)
      nextQuestion = makeClientQuestion(
        room.questions[qIndex + 1],
        qIndex + 1,
        room.questions.length,
      );

    res.json({
      correct,
      points,
      timeBonus,
      correctAnswer: q.correctAnswer,
      sessionScore: dp.score,
      streak: dp.streak,
      isComplete,
      nextQuestion,
    });
  });

  router.get("/api/trivia/duel/status/:roomId", (req, res) => {
    const room = duelRooms.get(req.params.roomId);
    if (!room) return res.status(404).json({ error: "Room not found" });

    // Lazy expiry check
    if (
      room.status === "waiting" &&
      Date.now() - room.createdAt > DUEL_WAIT_EXPIRY_MS
    ) {
      duelRooms.delete(req.params.roomId);
      return res.status(404).json({ error: "Room expired" });
    }

    const playersInfo = Object.values(room.players).map((pl) => ({
      username: pl.username,
      finished: pl.finished,
      ready: !!pl.ready,
      score: pl.finished ? pl.score : undefined,
      correctCount: pl.finished
        ? pl.answers.filter((a) => a.correct).length
        : undefined,
      totalQuestions: room.questions.length,
    }));

    let winner = null;
    if (room.status === "finished") {
      const sorted = Object.values(room.players).sort(
        (a, b) => b.score - a.score,
      );
      winner =
        sorted[0].score > sorted[1]?.score
          ? sorted[0].username
          : sorted[0].score === sorted[1]?.score
            ? "Tie"
            : sorted[0].username;
    }

    res.json({
      roomId: room.roomId,
      status: room.status,
      players: playersInfo,
      winner,
    });
  });

  router.post("/api/trivia/duel/leave", requireAuth, (req, res) => {
    const { userId } = resolveUser(req);
    const { roomId } = req.body;
    if (!roomId) return res.status(400).json({ error: "roomId required" });
    const room = duelRooms.get(roomId);
    if (!room) return res.json({ success: true }); // already gone
    delete room.players[userId];
    // Delete room if empty
    if (Object.keys(room.players).length === 0) {
      duelRooms.delete(roomId);
    }
    res.json({ success: true });
  });

  /* ─── Duel Ready-Up ─── */
  router.post("/api/trivia/duel/ready", requireAuth, (req, res) => {
    const { userId } = resolveUser(req);
    const { roomId } = req.body;
    const room = duelRooms.get(roomId);
    if (!room) return res.status(404).json({ error: "Room not found" });
    const dp = room.players[userId];
    if (!dp) return res.status(403).json({ error: "Not in this room" });

    dp.ready = true;

    // Check if both players are ready
    const allReady = Object.values(room.players).every((pl) => pl.ready);
    if (allReady && Object.keys(room.players).length >= 2) {
      room.status = "active";
    }

    const playersInfo = Object.values(room.players).map((pl) => ({
      username: pl.username,
      ready: !!pl.ready,
    }));

    res.json({
      success: true,
      status: room.status,
      players: playersInfo,
    });
  });

  /* ─── Duel History ─── */
  router.get("/api/trivia/duel/history", (req, res) => {
    const userId = req.query.userId || "";
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(20, Math.max(1, parseInt(req.query.limit) || 5));

    // Filter by user if specified, otherwise return all
    let filtered = userId
      ? duelHistory.filter((d) => d.players.some((p) => p.userId === userId))
      : duelHistory;

    const total = filtered.length;
    const totalPages = Math.ceil(total / limit) || 1;
    const offset = (page - 1) * limit;
    const entries = filtered.slice(offset, offset + limit);

    res.json({ entries, page, totalPages, total });
  });

  // Expose duelRooms for health endpoint
  router._duelRooms = duelRooms;

  return router;
}

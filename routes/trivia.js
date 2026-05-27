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
  createTriviaLifelineState,
  calcRegen,
  pickQuestions,
  makeClientQuestion,
  selectTriviaFiftyFiftyAnswers,
  spendTriviaLifeline,
} from "../game-logic.js";
import { withPlayerLock } from "../playerManager.js";
import { routeFail, routeOk, sendRouteResult } from "./mutationResults.js";

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

  router.post("/api/trivia/start", requireAuth, async (req, res) => {
    const { userId, username } = resolveUser(req);
    if (!userId) return res.status(400).json({ error: "userId required" });
    const result = await withPlayerLock(userId, async (p) => {
      const { count = 5, difficulty } = req.body;
      calcRegen(p);

      const questions = _pickQuestions(count, difficulty);
      p.trivia.session = {
        questions,
        index: 0,
        answers: [],
        score: 0,
        streak: 0,
        lifelines: createTriviaLifelineState(),
        startedAt: Date.now(),
      };

      return routeOk({
        success: true,
        resources: p.resources,
        stats: {
          totalScore: p.trivia.totalScore,
          bestStreak: p.trivia.bestStreak,
          totalPlayed: p.trivia.totalPlayed,
        },
        question: makeClientQuestion(questions[0], 0, questions.length),
      });
    }, username);
    return sendRouteResult(res, result);
  });

  router.post("/api/trivia/lifeline", requireAuth, async (req, res) => {
    const { userId, username } = resolveUser(req);
    if (!userId) return res.status(400).json({ error: "userId required" });
    const result = await withPlayerLock(userId, async (p) => {
      const { type } = req.body;
      const s = p.trivia.session;
      if (!s) return routeFail(400, { error: "no session" });
      const q = s.questions[s.index];
      if (!q) return routeFail(400, { error: "done" });
      if (type !== "fifty" && type !== "reveal") return routeFail(400, { error: "unknown lifeline" });

      const spent = spendTriviaLifeline(s.lifelines, type);
      s.lifelines = spent.next;
      if (!spent.allowed) return routeFail(400, { error: "lifeline unavailable", lifelines: s.lifelines });

      if (type === "fifty") {
        return routeOk({
          success: true,
          type,
          hiddenAnswers: selectTriviaFiftyFiftyAnswers(q),
          lifelines: s.lifelines,
        });
      }
      if (type === "reveal") {
        return routeOk({
          success: true,
          type,
          correctAnswer: q.correctAnswer,
          lifelines: s.lifelines,
        });
      }
      return routeFail(400, { error: "unknown lifeline", lifelines: s.lifelines });
    }, username);
    return sendRouteResult(res, result);
  });

  router.post("/api/trivia/forfeit", requireAuth, async (req, res) => {
    const { userId, username } = resolveUser(req);
    if (!userId) return res.status(400).json({ error: "userId required" });
    const result = await withPlayerLock(userId, async (p) => {
      const s = p.trivia.session;
      if (!s) return routeFail(400, { error: "no session" });

      // Mark session complete with current stats
      p.trivia.totalScore += s.score;
      p.trivia.totalCorrect += s.answers.filter((a) => a.correct).length;
      p.trivia.totalPlayed++;
      p.trivia.bestStreak = Math.max(p.trivia.bestStreak, s.streak);
      const finalScore = s.score;
      p.trivia.session = null;

      return routeOk({
        success: true,
        score: finalScore,
        stats: {
          totalScore: p.trivia.totalScore,
          bestStreak: p.trivia.bestStreak,
          totalPlayed: p.trivia.totalPlayed,
          totalCorrect: p.trivia.totalCorrect,
        },
      });
    }, username);
    return sendRouteResult(res, result);
  });

  router.post("/api/trivia/answer", requireAuth, async (req, res) => {
    const { userId, username } = resolveUser(req);
    if (!userId) return res.status(400).json({ error: "userId required" });
    const result = await withPlayerLock(userId, async (p) => {
      const { answer, timeMs } = req.body;
      const s = p.trivia.session;
      if (!s) return routeFail(400, { error: "no session" });
      const q = s.questions[s.index];
      if (!q) return routeFail(400, { error: "done" });

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
      }

      let nextQuestion = null;
      if (!isComplete)
        nextQuestion = makeClientQuestion(
          s.questions[s.index],
          s.index,
          s.questions.length,
        );

      return routeOk({
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
    }, username);
    return sendRouteResult(res, result);
  });

  /* ═══════════════════════════════════════════════════
   *  DUEL SYSTEM
   * ═══════════════════════════════════════════════════ */
  const duelRooms = new Map(); // roomId -> duel state
  const waitingRoomsByUser = new Map(); // v10.1: userId -> roomId for 'waiting' rooms
  const duelHistory = []; // Circular buffer of finished duel results (max 50)
  const DUEL_HISTORY_MAX = 50;
  const DUEL_WAIT_EXPIRY_MS = 3 * 60 * 1000; // 3 min for waiting rooms
  const DUEL_FINISH_EXPIRY_MS = 10 * 60 * 1000; // 10 min for finished rooms
  const MAX_DUEL_ROOMS = 2000; // v7.3: Hard capacity limit to prevent OOM

  // Periodic cleanup of stale duel rooms (.unref() for clean test/process exit)
  setInterval(() => {
    const now = Date.now();
    for (const [id, room] of duelRooms) {
      const age = now - room.createdAt;
      if (room.status === "waiting" && age > DUEL_WAIT_EXPIRY_MS) {
        // Sync v10.1: Remove waiting room player from index if it matches this room
        for (const userId in room.players) {
          if (waitingRoomsByUser.get(userId) === id) {
            waitingRoomsByUser.delete(userId);
          }
        }
        duelRooms.delete(id);
      } else if (room.status === "finished" && age > DUEL_FINISH_EXPIRY_MS) {
        duelRooms.delete(id);
      }
    }
  }, 60_000).unref();

  function generateCode() {
    return Math.random().toString(36).slice(2, 8).toUpperCase();
  }

  router.post("/api/trivia/duel/create", requireAuth, async (req, res) => {
    const { userId, username } = resolveUser(req);
    if (!userId) return res.status(400).json({ error: "userId required" });
    const result = await withPlayerLock(userId, async (p) => {
      const { count = 5, difficulty } = req.body;

      // v10.1: Optimized O(1) quota check via waitingRoomsByUser index
      if (waitingRoomsByUser.has(userId)) {
        return routeFail(429, {
          error: "ACTIVE_ROOM_EXISTS",
          message: "You already have a waiting room",
        });
      }

      // v7.3: Hard capacity limit with oldest-eviction fallback
      if (duelRooms.size >= MAX_DUEL_ROOMS) {
        // Evict oldest "waiting" rooms first, then oldest overall
        let evicted = false;
        for (const [id, room] of duelRooms) {
          if (room.status === "waiting") {
            // Sync v10.1: Remove evicted room's players from index if they match
            for (const pId in room.players) {
              if (waitingRoomsByUser.get(pId) === id) {
                waitingRoomsByUser.delete(pId);
              }
            }
            duelRooms.delete(id);
            evicted = true;
            break;
          }
        }
        if (!evicted) {
          // All rooms are active/finished — evict absolute oldest
          const oldestKey = duelRooms.keys().next().value;
          if (oldestKey) duelRooms.delete(oldestKey);
        }
      }
      calcRegen(p);

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
      // Sync v10.1: Track user's active waiting room
      waitingRoomsByUser.set(userId, roomId);

      return routeOk({
        success: true,
        resources: p.resources,
        roomId,
        inviteCode,
        questionCount: questions.length,
      });
    }, username);
    return sendRouteResult(res, result);
  });

  router.post("/api/trivia/duel/join", requireAuth, async (req, res) => {
    const { userId, username } = resolveUser(req);
    if (!userId) return res.status(400).json({ error: "userId required" });
    const result = await withPlayerLock(userId, async (p) => {
      const { inviteCode } = req.body;
      if (!inviteCode)
        return routeFail(400, { error: "inviteCode required" });

      const room = duelRooms.get(inviteCode.toUpperCase());
      if (!room) return routeFail(404, { error: "Room not found" });
      // Check if room has expired
      if (
        room.status === "waiting" &&
        Date.now() - room.createdAt > DUEL_WAIT_EXPIRY_MS
      ) {
        duelRooms.delete(inviteCode.toUpperCase());
        return routeFail(404, { error: "Room expired" });
      }
      if (room.status === "finished")
        return routeFail(400, { error: "Duel already finished" });
      // Self-join guard — can't join your own room
      if (room.players[userId])
        return routeFail(400, {
          error: "You're already in this room — share the code with a friend!",
        });
      if (Object.keys(room.players).length >= 2)
        return routeFail(400, { error: "Room is full" });
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
      if (Object.keys(room.players).length >= 2) {
        // Sync v10.1: Transition from waiting to lobby removes players from index if they match
        const rId = room.roomId;
        for (const pId in room.players) {
          if (waitingRoomsByUser.get(pId) === rId) {
            waitingRoomsByUser.delete(pId);
          }
        }
        room.status = "lobby";
      }

      const playerNames = Object.values(room.players).map((pl) => pl.username);
      return routeOk({
        success: true,
        roomId: room.roomId,
        status: room.status,
        players: playerNames,
        questionCount: room.questions.length,
      });
    }, username);
    return sendRouteResult(res, result);
  });

  router.post("/api/trivia/duel/start", requireAuth, async (req, res) => {
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

  router.post("/api/trivia/duel/answer", requireAuth, async (req, res) => {
    const { userId, username } = resolveUser(req);
    if (!userId) return res.status(400).json({ error: "userId required" });
    const result = await withPlayerLock(userId, async (_p) => {
      const { roomId, answer, timeMs } = req.body;
      const room = duelRooms.get(roomId);
      if (!room) return routeFail(404, { error: "Room not found" });
      const dp = room.players[userId];
      if (!dp) return routeFail(403, { error: "Not in this room" });
      if (dp.finished) return routeFail(400, { error: "Already finished" });

      const qIndex = dp.answers.length;
      const q = room.questions[qIndex];
      if (!q) return routeFail(400, { error: "No more questions" });

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
          // Push (O(1)) instead of unshift (O(N)); reverse on read
          duelHistory.push({
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

      return routeOk({
        correct,
        points,
        timeBonus,
        correctAnswer: q.correctAnswer,
        sessionScore: dp.score,
        streak: dp.streak,
        isComplete,
        nextQuestion,
      });
    }, username);
    return sendRouteResult(res, result);
  });

  router.get("/api/trivia/duel/status/:roomId", (req, res) => {
    const room = duelRooms.get(req.params.roomId);
    if (!room) return res.status(404).json({ error: "Room not found" });

    // Lazy expiry check
    if (
      room.status === "waiting" &&
      Date.now() - room.createdAt > DUEL_WAIT_EXPIRY_MS
    ) {
      // Sync v10.1: Remove waiting room player from index if it matches
      const rId = room.roomId;
      for (const pId in room.players) {
        if (waitingRoomsByUser.get(pId) === rId) {
          waitingRoomsByUser.delete(pId);
        }
      }
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

  router.post("/api/trivia/duel/leave", requireAuth, async (req, res) => {
    const { userId } = resolveUser(req);
    const { roomId } = req.body;
    if (!roomId) return res.status(400).json({ error: "roomId required" });
    const room = duelRooms.get(roomId);
    if (!room) return res.json({ success: true }); // already gone

    // Sync v10.1: Remove user from waiting room index if leaving their own waiting room
    if (room.status === "waiting" && waitingRoomsByUser.get(userId) === roomId) {
      waitingRoomsByUser.delete(userId);
    }

    delete room.players[userId];
    // Delete room if empty
    if (Object.keys(room.players).length === 0) {
      duelRooms.delete(roomId);
    }
    res.json({ success: true });
  });

  /* ─── Duel Ready-Up ─── */
  router.post("/api/trivia/duel/ready", requireAuth, async (req, res) => {
    const { userId, username } = resolveUser(req);
    if (!userId) return res.status(400).json({ error: "userId required" });
    const result = await withPlayerLock(userId, async (_p) => {
      const { roomId } = req.body;
      const room = duelRooms.get(roomId);
      if (!room) return routeFail(404, { error: "Room not found" });
      const dp = room.players[userId];
      if (!dp) return routeFail(403, { error: "Not in this room" });

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

      return routeOk({
        success: true,
        status: room.status,
        players: playersInfo,
      });
    }, username);
    return sendRouteResult(res, result);
  });

  /* ─── Duel History ─── */
  router.get("/api/trivia/duel/history", (req, res) => {
    const userId = req.query.userId || "";
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(20, Math.max(1, parseInt(req.query.limit) || 5));

    // Filter by user if specified, otherwise return all
    // Reverse so newest entries are first (push() appends to end)
    let filtered = userId
      ? duelHistory.filter((d) => d.players.some((p) => p.userId === userId))
      : [...duelHistory];
    filtered.reverse();

    const total = filtered.length;
    const totalPages = Math.ceil(total / limit) || 1;
    const offset = (page - 1) * limit;
    const entries = filtered.slice(offset, offset + limit);

    res.json({ entries, page, totalPages, total });
  });

  // Expose duelRooms for health endpoint
  router._duelRooms = duelRooms;
  router._waitingRoomsByUser = waitingRoomsByUser;
  router._duelHistory = duelHistory;
  router._duelRoomScope = "process-local";

  return router;
}

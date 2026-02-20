/**
 * ═══════════════════════════════════════════════════════
 *  Game Hub — Match-3 Routes
 *  Game state, start, move, end, mode sync
 * ═══════════════════════════════════════════════════════
 */
import { Router } from "express";
import {
  ECONOMY,
  BOARD_SIZE,
  calcRegen,
  calcGoldReward,
  randomGem,
  generateBoard,
  findMatches,
} from "../game-logic.js";
import { getPlayer, players, debouncedSaveDb } from "../playerManager.js";

export default function match3Routes(requireAuth, resolveUser) {
  const router = Router();

  router.post("/api/game/state", requireAuth, (req, res) => {
    const { userId, username } = resolveUser(req);
    if (!userId) return res.status(400).json({ error: "userId required" });
    const p = getPlayer(userId, username);
    if (p.match3.currentGame) {
      res.json({
        game: p.match3.currentGame,
        highScore: p.match3.highScore,
        savedModes: p.match3.savedModes || {},
      });
    } else {
      res.json({
        game: null,
        highScore: p.match3.highScore,
        savedModes: p.match3.savedModes || {},
      });
    }
  });

  // v4.11.1: Sync all saved mode states from client to server
  router.post("/api/game/sync-modes", requireAuth, (req, res) => {
    const { userId } = resolveUser(req);
    const { savedModes } = req.body;
    if (!userId) return res.status(400).json({ error: "userId required" });
    const p = getPlayer(userId);
    if (savedModes && typeof savedModes === "object") {
      p.match3.savedModes = savedModes;
      debouncedSaveDb();
    }
    res.json({ success: true });
  });

  router.post("/api/game/start", requireAuth, (req, res) => {
    const { userId, username } = resolveUser(req);
    if (!userId) return res.status(400).json({ error: "userId required" });
    const p = getPlayer(userId, username);
    calcRegen(p);

    // Energy check
    if (p.resources.energy.current < ECONOMY.COST_MATCH3) {
      return res.status(400).json({
        error: "NOT_ENOUGH_ENERGY",
        required: ECONOMY.COST_MATCH3,
        current: p.resources.energy.current,
      });
    }
    p.resources.energy.current -= ECONOMY.COST_MATCH3;

    const { mode = "classic" } = req.body;
    const game = {
      board: generateBoard(),
      score: 0,
      movesLeft: 30,
      combo: 0,
      mode,
    };
    p.match3.currentGame = game;
    p.match3.totalGames++;
    debouncedSaveDb();
    res.json({
      success: true,
      resources: p.resources,
      game,
      highScore: p.match3.highScore,
    });
  });

  router.post("/api/game/move", requireAuth, (req, res) => {
    const { userId } = resolveUser(req);
    const { fromX, fromY, toX, toY } = req.body;
    const p = getPlayer(userId);
    if (!p.match3.currentGame)
      return res.status(400).json({ error: "no active game" });

    const game = p.match3.currentGame;
    const board = game.board.map((r) => [...r]);

    if (Math.abs(fromX - toX) + Math.abs(fromY - toY) !== 1)
      return res.status(400).json({ error: "not adjacent" });

    [board[fromY][fromX], board[toY][toX]] = [
      board[toY][toX],
      board[fromY][fromX],
    ];
    let matches = findMatches(board);
    if (matches.length === 0) return res.json({ valid: false });

    let totalPoints = 0,
      combo = 0;
    while (matches.length > 0) {
      combo++;
      for (const m of matches) {
        totalPoints += m.gems.length * 10 * Math.min(combo, 5);
        for (const g of m.gems) board[g.y][g.x] = null;
      }
      for (let x = 0; x < BOARD_SIZE; x++) {
        let wy = BOARD_SIZE - 1;
        for (let y = BOARD_SIZE - 1; y >= 0; y--) {
          if (board[y][x]) {
            board[wy][x] = board[y][x];
            if (wy !== y) board[y][x] = null;
            wy--;
          }
        }
        for (let y = wy; y >= 0; y--) board[y][x] = randomGem();
      }
      matches = findMatches(board);
    }

    game.board = board;
    game.score += totalPoints;
    game.movesLeft--;
    game.combo = combo;

    if (game.movesLeft <= 0) {
      p.match3.highScore = Math.max(p.match3.highScore, game.score);
      p.match3.currentGame = null;
      debouncedSaveDb();
      return res.json({
        valid: true,
        game: { ...game, isGameOver: true },
        points: totalPoints,
        combo,
        highScore: p.match3.highScore,
      });
    }
    res.json({ valid: true, game, points: totalPoints, combo });
  });

  /* ─── Game End (dedicated endpoint for highScore save + gold reward) ─── */
  router.post("/api/game/end", requireAuth, (req, res) => {
    const { userId } = resolveUser(req);
    const { score } = req.body;
    const p = getPlayer(userId);
    // Gold reward based on score (progressive tiers)
    const goldReward = calcGoldReward(score);
    p.resources.gold += goldReward;
    if (typeof score === "number" && score > 0) {
      p.match3.highScore = Math.max(p.match3.highScore, score);
    }
    p.match3.currentGame = null;
    debouncedSaveDb();

    // Compute rank
    const allScores = [...players.values()]
      .filter((pl) => pl.match3.highScore > 0)
      .sort((a, b) => b.match3.highScore - a.match3.highScore);
    const rank = allScores.findIndex((pl) => pl.id === p.id) + 1;

    res.json({
      success: true,
      resources: p.resources,
      goldReward,
      highScore: p.match3.highScore,
      rank: rank || allScores.length + 1,
    });
  });

  return router;
}

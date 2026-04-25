import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  GEM_TYPES,
  GEM_ICONS,
  BOARD_SIZE,
  DROP_TYPES,
  SPECIAL_TYPES,
  calcGoldReward,
  cloneBoard,
  cloneDropStars,
  serializeBoard,
  deserializeBoard,
  hydrateBoard,
  hydrateArray,
  hydrateSavedModes,
  generateBoard,
  hasAnyMatch,
  findMatches,
  hasValidMoves,
  resolveBoard,
  attemptMatch3Move,
  isSpecialType,
  seedDropTokens,
} from "../src/game-core/match3/engine.js";

describe("Match-3 Engine Tests", () => {
  describe("Constants", () => {
    it("exports correct GEM_TYPES", () => {
      assert.deepEqual(GEM_TYPES, ["fire", "water", "earth", "air", "light", "dark"]);
    });

    it("exports correct GEM_ICONS", () => {
      assert.equal(GEM_ICONS.fire, "🔥");
      assert.equal(Object.keys(GEM_ICONS).length, 6);
    });

    it("exports correct BOARD_SIZE", () => {
      assert.equal(BOARD_SIZE, 8);
    });

    it("exports correct DROP_TYPES", () => {
      assert.deepEqual(DROP_TYPES, ["drop_gold", "drop_seeds", "drop_energy"]);
    });

    it("exports upstream-style special piece types", () => {
      assert.deepEqual(SPECIAL_TYPES, ["special_row", "special_column", "special_blast", "special_colour"]);
    });
  });

  describe("calcGoldReward", () => {
    it("returns REWARD_LOSE (5) for invalid or zero score", () => {
      assert.equal(calcGoldReward(0), 5);
      assert.equal(calcGoldReward(-10), 5);
      assert.equal(calcGoldReward(null), 5);
      assert.equal(calcGoldReward(undefined), 5);
      assert.equal(calcGoldReward("100"), 5);
    });

    it("scales correctly for score < 1000", () => {
      assert.equal(calcGoldReward(100), 5);
      assert.equal(calcGoldReward(500), 20);
      assert.equal(calcGoldReward(999), 39);
    });

    it("calculates correctly for 1000 <= score < 2000", () => {
      assert.equal(calcGoldReward(1000), 40);
      assert.equal(calcGoldReward(1500), 50);
      assert.equal(calcGoldReward(1999), 58);
    });

    it("calculates correctly for 2000 <= score < 3000", () => {
      assert.equal(calcGoldReward(2000), 60);
      assert.equal(calcGoldReward(2500), 80);
    });

    it("calculates correctly for 3000 <= score < 4000", () => {
      assert.equal(calcGoldReward(3000), 100);
      assert.equal(calcGoldReward(3500), 140);
    });

    it("calculates correctly for score >= 4000 (exponential scaling)", () => {
      assert.equal(calcGoldReward(4000), 180);
      assert.equal(calcGoldReward(4500), 260);
      assert.equal(calcGoldReward(5000), 340);
      assert.equal(calcGoldReward(6000), 660);
      assert.equal(calcGoldReward(7000), 1300);
      assert.equal(calcGoldReward(8000), 2100);
    });
  });

  describe("Cloning and Serialization", () => {
    describe("cloneBoard", () => {
      it("creates a deep copy of a 2D array", () => {
        const board = [["fire", "water"], ["earth", "air"]];
        const cloned = cloneBoard(board);
        assert.deepEqual(cloned, board);
        assert.notEqual(cloned, board);
        assert.notEqual(cloned[0], board[0]);
        cloned[0][0] = "dark";
        assert.equal(board[0][0], "fire");
      });
    });

    describe("cloneDropStars", () => {
      it("creates a deep copy of an array of objects", () => {
        const stars = [{ x: 1, y: 2, type: "drop_gold" }, { x: 3, y: 4, type: "drop_seeds" }];
        const cloned = cloneDropStars(stars);
        assert.deepEqual(cloned, stars);
        assert.notEqual(cloned, stars);
        assert.notEqual(cloned[0], stars[0]);
        cloned[0].x = 9;
        assert.equal(stars[0].x, 1);
      });
    });

    describe("serializeBoard and deserializeBoard", () => {
      it("serializes and deserializes a board correctly", () => {
        const board = [
          ["fire", "water", "earth"],
          ["air", "light", "dark"],
          ["drop_gold", "drop_seeds", "drop_energy"]
        ];
        const serialized = serializeBoard(board);
        assert.equal(serialized, "FWEALDGSN");
        const deserialized = deserializeBoard(serialized, 3);
        assert.deepEqual(deserialized, board);
      });

      it("handles null strings for serialize and deserialize", () => {
        assert.equal(serializeBoard(null), null);
        assert.equal(deserializeBoard(null), null);
      });

      it("handles unmatched characters in deserialization with empty string", () => {
         const board = deserializeBoard(".", 1);
         assert.deepEqual(board, [[""]]);
         const board2 = deserializeBoard("X", 1);
         assert.deepEqual(board2, [[""]]);
      });
    });

    describe("hydrateBoard", () => {
      it("hydrates from flat string format", () => {
        const serialized = "FWEALDGSN" + ".".repeat(55);
        const hydrated = hydrateBoard(serialized);
        assert.equal(hydrated[0][0], "fire");
      });

      it("hydrates from object format", () => {
        const persistedBoard = { "0": ["fire", "water"], "1": { "0": "earth", "1": "air" } };
        const hydrated = hydrateBoard(persistedBoard);
        assert.deepEqual(hydrated, [["fire", "water"], ["earth", "air"]]);
      });

      it("returns null for null input", () => {
         assert.equal(hydrateBoard(null), null);
      });

      it("returns array as is if already array", () => {
         const b = [["fire"]];
         assert.equal(hydrateBoard(b), b);
      });
    });

    describe("hydrateArray", () => {
      it("hydrates from object format", () => {
        const persistedArray = { "0": "item1", "1": "item2" };
        const hydrated = hydrateArray(persistedArray);
        assert.deepEqual(hydrated, ["item1", "item2"]);
      });

      it("returns empty array for falsy input", () => {
         assert.deepEqual(hydrateArray(null), []);
      });

      it("returns array as is if already array", () => {
         const arr = ["item"];
         assert.equal(hydrateArray(arr), arr);
      });
    });

    describe("hydrateSavedModes", () => {
      it("hydrates boards and dropStars in savedModes object", () => {
        const savedModes = {
          "mode1": { board: { "0": ["fire"] }, dropStars: { "0": { x: 1, type: "drop_gold" } } },
          "mode2": { score: 100 }
        };
        const hydrated = hydrateSavedModes(savedModes);
        assert.deepEqual(hydrated.mode1.board, [["fire"]]);
        assert.deepEqual(hydrated.mode1.dropStars, [{ x: 1, type: "drop_gold" }]);
        assert.equal(hydrated.mode2.score, 100);
      });
    });
  });

  describe("Core Engine Logic", () => {
    describe("generateBoard", () => {
      it("generates a board of correct size with valid gems", () => {
        const board = generateBoard();
        assert.equal(board.length, BOARD_SIZE);
        for (let y = 0; y < BOARD_SIZE; y++) {
          assert.equal(board[y].length, BOARD_SIZE);
          for (let x = 0; x < BOARD_SIZE; x++) {
            assert.ok(GEM_TYPES.includes(board[y][x]));
          }
        }
      });

      it("generates a board with no initial matches", () => {
        for (let i = 0; i < 10; i++) {
          const board = generateBoard();
          assert.equal(hasAnyMatch(board), false, "Generated board should have no initial matches");
        }
      });
    });

    describe("hasAnyMatch", () => {
      it("returns true for horizontal match", () => {
        const board = Array.from({ length: 8 }, () => Array(8).fill("fire"));
        board[0][0] = "water"; board[0][1] = "water"; board[0][2] = "water";
        assert.equal(hasAnyMatch(board), true);
      });

      it("returns true for vertical match", () => {
        const board = Array.from({ length: 8 }, () => Array(8).fill("fire"));
        board[0][0] = "water"; board[1][0] = "water"; board[2][0] = "water";
        assert.equal(hasAnyMatch(board), true);
      });

      it("returns false for no matches", () => {
         const board = generateBoard();
         assert.equal(hasAnyMatch(board), false);
      });

      it("ignores drop tokens", () => {
        const board = Array.from({ length: 8 }, () => Array(8).fill("fire"));
        board[0][0] = "drop_gold"; board[0][1] = "drop_gold"; board[0][2] = "drop_gold";
        for (let y = 1; y < 8; y++) {
            for(let x = 0; x < 8; x++) {
                board[y][x] = (x + y) % 2 === 0 ? "fire" : "water";
            }
        }
        for (let x = 3; x < 8; x++) {
            board[0][x] = x % 2 === 0 ? "fire" : "water";
        }

        assert.equal(hasAnyMatch(board), false);
      });

      it("ignores null/empty cells", () => {
         const board = Array.from({ length: 8 }, () => Array(8).fill("fire"));
         for (let y = 1; y < 8; y++) {
             for(let x = 0; x < 8; x++) {
                 board[y][x] = (x + y) % 2 === 0 ? "fire" : "water";
             }
         }
         board[0][0] = null; board[0][1] = null; board[0][2] = null;
         for (let x = 3; x < 8; x++) {
             board[0][x] = x % 2 === 0 ? "fire" : "water";
         }
         assert.equal(hasAnyMatch(board), false);
      });
    });

    describe("findMatches", () => {
      it("finds indices of matched gems", () => {
        const board = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill("fire"));
        board[0][0] = "water"; board[0][1] = "water"; board[0][2] = "water";
        for (let y = 1; y < BOARD_SIZE; y++) {
            for(let x = 0; x < BOARD_SIZE; x++) {
                board[y][x] = (x + y) % 3 === 0 ? "fire" : (x + y) % 3 === 1 ? "water" : "earth";
            }
        }
        for (let x = 3; x < BOARD_SIZE; x++) {
             board[0][x] = (x) % 3 === 0 ? "fire" : (x) % 3 === 1 ? "water" : "earth";
         }

        const matches = findMatches(board);
        assert.deepEqual(matches, [0, 1, 2]);
      });

      it("returns empty array for no matches", () => {
        const board = generateBoard();
        const matches = findMatches(board);
        assert.deepEqual(matches, []);
      });

      it("uses dirtyMask optimization correctly", () => {
         const board = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill("fire"));
         board[0][0] = "water"; board[0][1] = "water"; board[0][2] = "water";
         board[2][0] = "earth"; board[2][1] = "earth"; board[2][2] = "earth";

         for (let y = 0; y < BOARD_SIZE; y++) {
             if (y === 0 || y === 2) {
                 for (let x = 3; x < BOARD_SIZE; x++) {
                     board[y][x] = (x) % 3 === 0 ? "fire" : (x) % 3 === 1 ? "water" : "earth";
                 }
             } else {
                 for(let x = 0; x < BOARD_SIZE; x++) {
                     board[y][x] = (x + y) % 3 === 0 ? "fire" : (x + y) % 3 === 1 ? "water" : "earth";
                 }
             }
         }

         const dirtyMask = {
             rows: new Uint8Array(BOARD_SIZE),
             cols: new Uint8Array(BOARD_SIZE)
         };
         dirtyMask.rows[0] = 1;

         const matches = findMatches(board, dirtyMask);
         assert.deepEqual(matches, [0, 1, 2]);
      });
    });

    describe("hasValidMoves", () => {
      it("returns true when a move can create a match", () => {
        const board = Array.from({ length: 8 }, () => Array(8).fill("fire"));
        for (let y = 0; y < 8; y++) {
            for(let x = 0; x < 8; x++) {
                board[y][x] = (x + y) % 3 === 0 ? "fire" : (x + y) % 3 === 1 ? "water" : "earth";
            }
        }
        board[0][0] = "water"; board[0][1] = "fire"; board[0][2] = "water";
        board[1][0] = "fire"; board[1][1] = "fire"; board[1][2] = "water";

        assert.equal(hasValidMoves(board), true);
      });

      it("returns false for unplayable board", () => {
        const board = Array.from({ length: 8 }, () => Array(8).fill("fire"));
        for (let y = 0; y < 8; y++) {
            for(let x = 0; x < 8; x++) {
                board[y][x] = (x + y) % 3 === 0 ? "fire" : (x + y) % 3 === 1 ? "water" : "earth";
            }
        }
        assert.equal(hasValidMoves(board), false);
      });
    });

    describe("resolveBoard", () => {
      it("resolves board and returns steps, points, and combo", () => {
        const board = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill("fire"));
        board[0][0] = "water"; board[0][1] = "water"; board[0][2] = "water";
        for (let y = 1; y < BOARD_SIZE; y++) {
            for(let x = 0; x < BOARD_SIZE; x++) {
                board[y][x] = (x + y) % 3 === 0 ? "fire" : (x + y) % 3 === 1 ? "water" : "earth";
            }
        }
        for (let x = 3; x < BOARD_SIZE; x++) {
             board[0][x] = (x) % 3 === 0 ? "fire" : (x) % 3 === 1 ? "water" : "earth";
         }

        let stepCalled = false;
        const result = resolveBoard(board, () => {
            stepCalled = true;
        });

        assert.ok(result.steps.length >= 1);
        assert.ok(result.totalPoints > 0);
        assert.ok(result.combo >= 1);
        assert.equal(stepCalled, true);

        for (let y = 0; y < BOARD_SIZE; y++) {
            for(let x = 0; x < BOARD_SIZE; x++) {
                assert.notEqual(board[y][x], null);
            }
        }
      });

      it("does not clear drop tokens", () => {
         const board = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill("fire"));
         board[7][0] = "water"; board[7][1] = "water"; board[7][2] = "water";
         board[6][0] = "drop_gold";

         for (let y = 0; y < BOARD_SIZE - 2; y++) {
             for(let x = 0; x < BOARD_SIZE; x++) {
                 board[y][x] = (x + y) % 2 === 0 ? "fire" : "water";
             }
         }
         board[6][1] = "fire"; board[6][2] = "water";
         for (let x = 3; x < BOARD_SIZE; x++) {
             board[7][x] = x % 2 === 0 ? "fire" : "water";
             board[6][x] = x % 2 === 0 ? "water" : "fire";
         }

         resolveBoard(board);

         let foundDrop = false;
         for (let y = 0; y < BOARD_SIZE; y++) {
             if (board[y][0] === "drop_gold") {
                 foundDrop = true;
             }
         }
         assert.ok(foundDrop, "Drop token should not be cleared");
       });

      it("spawns a special piece from longer matches", () => {
        const board = generateBoard();
        board[0][0] = "fire";
        board[0][1] = "fire";
        board[0][2] = "fire";
        board[0][3] = "fire";

        const result = resolveBoard(board);

        assert.ok(result.steps.some((step) => step.specials?.length), "Expected at least one spawned special");
        assert.ok(board.some((row) => row.some((cell) => isSpecialType(cell))), "Expected special piece to remain on board");
      });

      it("resolves a special-piece move without clearing drop tokens", () => {
        const board = generateBoard();
        board[2][2] = "special_row";
        board[2][3] = "drop_gold";
        board[2][4] = "water";

        const result = attemptMatch3Move(board, { x: 2, y: 2 }, { x: 2, y: 3 });

        assert.equal(result.valid, true);
        assert.ok(result.totalPoints > 0);
        assert.ok(result.board.some((row) => row.includes("drop_gold")), "Drop token should survive special clearing");
      });

      it("keeps invalid swaps from mutating or scoring", () => {
        let candidate = null;
        for (let i = 0; i < 30 && !candidate; i++) {
          const board = generateBoard();
          for (let y = 0; y < BOARD_SIZE && !candidate; y++) {
            for (let x = 0; x < BOARD_SIZE - 1 && !candidate; x++) {
              const result = attemptMatch3Move(board, { x, y }, { x: x + 1, y });
              if (!result.valid) candidate = { board, result };
            }
          }
        }

        assert.ok(candidate, "Expected at least one invalid adjacent swap candidate");
        assert.equal(candidate.result.totalPoints, 0);
        assert.deepEqual(candidate.result.steps, []);
        assert.deepEqual(candidate.result.board, candidate.board);
      });

      it("returns cascade step snapshots that end at the final board", () => {
        const board = generateBoard();
        let result = null;
        for (let y = 0; y < BOARD_SIZE && !result; y++) {
          for (let x = 0; x < BOARD_SIZE - 1 && !result; x++) {
            const candidate = attemptMatch3Move(board, { x, y }, { x: x + 1, y });
            if (candidate.valid) result = candidate;
          }
        }

        assert.ok(result, "Expected at least one valid adjacent swap candidate");
        assert.ok(result.steps.length >= 1);
        for (const step of result.steps) {
          assert.ok(Array.isArray(step.cleared));
          assert.ok(Array.isArray(step.fallen));
          assert.ok(Array.isArray(step.filled));
          assert.ok(Array.isArray(step.boardSnapshot));
        }
        assert.deepEqual(result.steps.at(-1).boardSnapshot, result.board);
      });

      it("seeds drop tokens for Star Drop mode", () => {
        const board = seedDropTokens(generateBoard(), 4);
        const count = board.flat().filter((cell) => DROP_TYPES.includes(cell)).length;
        assert.equal(count, 4);
      });
    });
  });
});

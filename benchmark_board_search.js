import { performance } from "node:perf_hooks";

const ROWS = 7;
const COLS = 9;

function generateBoard() {
  const board = [];
  for (let i = 0; i < ROWS; i++) {
    const row = [];
    for (let j = 0; j < COLS; j++) {
      row.push({ id: `item_${Math.floor(Math.random() * 10)}` });
    }
    board.push(row);
  }
  return board;
}

const p = { merge: { board: generateBoard() } };

const requirements = [
  { type: "merge", id: "item_1", qty: 2 },
  { type: "merge", id: "item_2", qty: 1 },
  { type: "merge", id: "item_3", qty: 1 },
  { type: "merge", id: "item_4", qty: 1 },
  { type: "merge", id: "item_5", qty: 1 }
];

function runBenchmark() {
  const ITERATIONS = 1_000_000;

  const startOld = performance.now();
  for (let i = 0; i < ITERATIONS; i++) {
    for (const req of requirements) {
      if (req.type === "merge") {
        let _found = 0;
        for (const row of p.merge.board) {
          for (const cell of row) {
            if (cell && cell.id === req.id) _found++;
          }
        }
      }
    }
  }
  const timeOld = performance.now() - startOld;
  console.log(`Old Method (5 reqs): ${timeOld.toFixed(2)}ms`);

  const startInventoryPlain = performance.now();
  for (let i = 0; i < ITERATIONS; i++) {
    let inventory = null;

    for (const req of requirements) {
      if (req.type === "merge") {
        if (!inventory) {
          inventory = {};
          for (let r = 0; r < ROWS; r++) {
            const row = p.merge.board[r];
            for (let c = 0; c < COLS; c++) {
              const cell = row[c];
              if (cell) {
                inventory[cell.id] = (inventory[cell.id] || 0) + 1;
              }
            }
          }
        }

        const _found = inventory[req.id] || 0;
      }
    }
  }
  const timeInventoryPlain = performance.now() - startInventoryPlain;
  console.log(`Inventory Method Plain Object (5 reqs): ${timeInventoryPlain.toFixed(2)}ms`);
}

runBenchmark();

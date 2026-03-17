import { getDb } from "../db.js";
import { createDefaultPlayer } from "../game-logic.js";

/**
 * Injects a player directly into the PostgreSQL database for testing.
 * This bypasses the API layer for arranging test data, making tests faster and less brittle.
 * 
 * @param {string} userId - The Discord user ID or custom test ID.
 * @param {string} username - The cleartext username.
 * @param {Function} stateModifier - Optional callback to modify the default state before insertion.
 * @returns {Object} The inserted player state.
 */
export async function injectTestPlayer(userId, username = "TestPlayer", stateModifier = null) {
  const db = getDb();
  if (!db) throw new Error("Database not initialized");

  const now = Date.now();
  const playerState = createDefaultPlayer(userId, username, now);

  if (stateModifier) {
    stateModifier(playerState);
  }

  await db`
    INSERT INTO players (id, data) 
    VALUES (${userId}, ${playerState})
    ON CONFLICT (id) DO UPDATE SET data = ${playerState}
  `;

  return playerState;
}

/**
 * Helper to clear all players from the database.
 */
export async function clearAllPlayers() {
  const db = getDb();
  if (db) {
    await db`DELETE FROM players`;
  }
}

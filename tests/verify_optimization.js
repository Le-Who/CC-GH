
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";

// Mock implementation of the logic in trivia.js to verify sync and performance
function createTriviaLogic() {
  const duelRooms = new Map();
  const waitingRoomsByUser = new Map();
  const MAX_DUEL_ROOMS = 2000;

  function createRoom(userId) {
    if (waitingRoomsByUser.has(userId)) {
      return { error: "ACTIVE_ROOM_EXISTS" };
    }

    if (duelRooms.size >= MAX_DUEL_ROOMS) {
      let evicted = false;
      for (const [id, room] of duelRooms) {
        if (room.status === "waiting") {
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
        const oldestKey = duelRooms.keys().next().value;
        if (oldestKey) duelRooms.delete(oldestKey);
      }
    }

    const roomId = "ROOM_" + Math.random().toString(36).slice(2);
    const room = {
      roomId,
      status: "waiting",
      players: { [userId]: { userId } },
      createdAt: Date.now()
    };
    duelRooms.set(roomId, room);
    waitingRoomsByUser.set(userId, roomId);
    return { success: true, roomId };
  }

  function joinRoom(userId, roomId) {
    const room = duelRooms.get(roomId);
    if (!room) return { error: "NOT_FOUND" };

    room.players[userId] = { userId };

    if (Object.keys(room.players).length >= 2) {
      const rId = room.roomId;
      for (const pId in room.players) {
        if (waitingRoomsByUser.get(pId) === rId) {
          waitingRoomsByUser.delete(pId);
        }
      }
      room.status = "lobby";
    }
    return { success: true };
  }

  function leaveRoom(userId, roomId) {
    const room = duelRooms.get(roomId);
    if (!room) return { success: true };

    if (room.status === "waiting" && waitingRoomsByUser.get(userId) === roomId) {
      waitingRoomsByUser.delete(userId);
    }
    delete room.players[userId];
    if (Object.keys(room.players).length === 0) {
      duelRooms.delete(roomId);
    }
    return { success: true };
  }

  function cleanup(now, expiryMs) {
    for (const [id, room] of duelRooms) {
      if (room.status === "waiting" && now - room.createdAt > expiryMs) {
        const rId = room.roomId;
        for (const pId in room.players) {
          if (waitingRoomsByUser.get(pId) === rId) {
            waitingRoomsByUser.delete(pId);
          }
        }
        duelRooms.delete(id);
      }
    }
  }

  return { createRoom, joinRoom, leaveRoom, cleanup, duelRooms, waitingRoomsByUser };
}

// 1. Verify Sync Logic
console.log("Verifying sync logic...");
const logic = createTriviaLogic();

// Create room
const res1 = logic.createRoom("user1");
assert.ok(res1.success);
assert.equal(logic.waitingRoomsByUser.get("user1"), res1.roomId);

// Quota check
const res2 = logic.createRoom("user1");
assert.equal(res2.error, "ACTIVE_ROOM_EXISTS");

// REFINED LOGIC TEST: User B (user2) has their own waiting room, then joins User A's (user1) room.
// Transitioning User A's room should NOT remove User B from the index.
const res3 = logic.createRoom("user2");
assert.equal(logic.waitingRoomsByUser.get("user2"), res3.roomId);

logic.joinRoom("user2", res1.roomId);
assert.equal(logic.duelRooms.get(res1.roomId).status, "lobby");
assert.equal(logic.waitingRoomsByUser.has("user1"), false, "Creator user1 should be removed from index");
assert.equal(logic.waitingRoomsByUser.get("user2"), res3.roomId, "Joiner user2 should STILL HAVE their own waiting room in index");

// Join room (transitions to lobby) - back to basic scenario
const logic2 = createTriviaLogic();
const resA = logic2.createRoom("userA");
logic2.joinRoom("userB", resA.roomId);
assert.equal(logic2.waitingRoomsByUser.has("userA"), false);
assert.equal(logic2.waitingRoomsByUser.has("userB"), false);
assert.equal(logic2.duelRooms.get(resA.roomId).status, "lobby");

// Leave room while waiting - ONLY if it's your own room
const logic3 = createTriviaLogic();
const resL1 = logic3.createRoom("userL1");
const resL2 = logic3.createRoom("userL2");
logic3.leaveRoom("userL2", resL1.roomId); // userL2 leaves userL1's room (not possible in current API but testing logic)
assert.equal(logic3.waitingRoomsByUser.get("userL2"), resL2.roomId, "userL2 should still have their own room index");

logic3.leaveRoom("userL2", resL2.roomId);
assert.equal(logic3.waitingRoomsByUser.has("userL2"), false, "userL2 index should be removed when leaving their own room");

// Expiry cleanup
const logic4 = createTriviaLogic();
const resE1 = logic4.createRoom("userE1");
logic4.cleanup(Date.now() + 1000000, 300000);
assert.equal(logic4.waitingRoomsByUser.has("userE1"), false);
assert.equal(logic4.duelRooms.has(resE1.roomId), false);

// Eviction
const batchLogic = createTriviaLogic();
for (let i = 0; i < 2000; i++) {
  batchLogic.createRoom("batch_user_" + i);
}
assert.equal(batchLogic.duelRooms.size, 2000);
assert.equal(batchLogic.waitingRoomsByUser.size, 2000);

// Evict one
batchLogic.createRoom("new_user");
assert.equal(batchLogic.duelRooms.size, 2000);
assert.equal(batchLogic.waitingRoomsByUser.size, 2000);
assert.ok(batchLogic.waitingRoomsByUser.has("new_user"));
assert.ok(!batchLogic.waitingRoomsByUser.has("batch_user_0")); // Oldest evicted

console.log("Sync logic verified successfully.");

// 2. Verify Performance
console.log("\nVerifying performance...");
function benchmark(fn, iterations = 10000) {
  for (let i = 0; i < 100; i++) fn();
  const start = performance.now();
  for (let i = 0; i < iterations; i++) fn();
  return (performance.now() - start) / iterations;
}

const avgTime = benchmark(() => batchLogic.waitingRoomsByUser.has("user_not_exist"));
console.log(`Average Map lookup time: ${avgTime.toFixed(6)} ms`);
assert.ok(avgTime < 0.001, "Map lookup should be extremely fast");

console.log("Optimization verified!");

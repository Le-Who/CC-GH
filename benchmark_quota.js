
import { performance } from "node:perf_hooks";

function benchmark(fn, iterations = 1000) {
  // Warmup
  for (let i = 0; i < 100; i++) fn();

  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    fn();
  }
  const end = performance.now();
  return (end - start) / iterations;
}

const duelRooms = new Map();
const userToWaitingRoom = new Map();

const MAX_ROOMS = 2000;
for (let i = 0; i < MAX_ROOMS; i++) {
  const roomId = 'ROOM_' + i;
  const userId = 'USER_' + i;
  const room = {
    roomId,
    status: 'waiting',
    players: {
      [userId]: { userId, username: 'user_' + i }
    },
    createdAt: Date.now()
  };
  duelRooms.set(roomId, room);
  userToWaitingRoom.set(userId, roomId);
}

function quotaCheckFullIteration(userId) {
  for (const [, room] of duelRooms) {
    if (room.status === 'waiting' && room.players[userId]) {
      return true;
    }
  }
  return false;
}

function quotaCheckOptimized(userId) {
  return userToWaitingRoom.has(userId);
}

const userIdToFind = 'USER_1999';
const userIdNotToFind = 'USER_NOT_EXIST';

console.log('Benchmarking quota check with ' + MAX_ROOMS + ' rooms...');

const avgTimeFound = benchmark(() => quotaCheckFullIteration(userIdToFind), 10000);
console.log(`[Baseline] Average time (user found at the end): ${avgTimeFound.toFixed(6)} ms`);

const avgTimeNotFound = benchmark(() => quotaCheckFullIteration(userIdNotToFind), 10000);
console.log(`[Baseline] Average time (user not found): ${avgTimeNotFound.toFixed(6)} ms`);

const avgTimeOptimizedFound = benchmark(() => quotaCheckOptimized(userIdToFind), 10000);
console.log(`[Optimized] Average time (user found): ${avgTimeOptimizedFound.toFixed(6)} ms`);

const avgTimeOptimizedNotFound = benchmark(() => quotaCheckOptimized(userIdNotToFind), 10000);
console.log(`[Optimized] Average time (user not found): ${avgTimeOptimizedNotFound.toFixed(6)} ms`);

#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";

const build = spawnSync("pnpm run build", {
  stdio: "inherit",
  shell: true,
  env: {
    ...process.env,
    NODE_ENV: "production",
  },
});

if (build.status !== 0) process.exit(build.status ?? 1);

const server = spawn(process.execPath, ["server.js"], {
  stdio: "inherit",
  env: process.env,
});

function stop(signal) {
  if (!server.killed) server.kill(signal);
}

process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));
server.on("exit", (code, signal) => {
  process.exit(code ?? (signal ? 0 : 1));
});

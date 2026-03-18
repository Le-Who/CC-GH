import fs from "fs";
const code = fs.readFileSync("src/vanilla/shared.js", "utf-8");
console.log(code.split("\n").findIndex(line => line.includes("export function apiBatched")));

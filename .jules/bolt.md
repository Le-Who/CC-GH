
## 2024-05-20 - Object.values() Overhead
**Learning:** In hot rendering paths or frequent computations (like `getUnlockedSeeds`), `Object.values(obj).reduce(...)` and `Object.values(obj).some(...)` create unnecessary intermediate arrays before iteration begins, leading to increased memory pressure and Garbage Collection pauses in V8.
**Action:** Replace these patterns with equivalent `for...in` loops. Not only does this avoid full array creation, but it also allows for immediate early exits (e.g. `break` or `return true`) in cases previously using `.some()`. Add a comment like `// ⚡ Bolt: Replaced Object.values().[method] with for...in for memory efficiency` for clarity.


## 2025-02-13 - [Trivia Question Shuffling Anti-Pattern]
**Learning:** Using `Array.prototype.sort(() => Math.random() - 0.5)` to shuffle and select items from a large pool introduces an $O(n \log n)$ performance bottleneck, and it's statistically biased. This becomes an issue when fetching random subsets, as the entire array is unnecessarily shuffled.
**Action:** Always use a partial Fisher-Yates shuffle to pick $k$ random elements from an array in $O(k)$ time.

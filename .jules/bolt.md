## 2024-03-16 - [Object values filtering optimization]
**Learning:** For single-item lookups on object value sets, `Object.values().find()` or manual loops are significantly faster (~10x for loops, ~1.4x for find) and more memory efficient than `Object.values().filter().map()[0]` because they enable early exit and minimize intermediate array creation.
**Action:** Replace `Object.values(obj).filter(cond).map(transform)[0]` with `Object.values(obj).find(cond)?.transformedField` or a manual loop for better performance, especially in hot paths.

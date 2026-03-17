const bench = (name, fn) => {
  const start = performance.now();
  for(let i=0; i<1000000; i++) fn();
  const end = performance.now();
  console.log(`${name}: ${end-start}ms`);
}

const entries = [
  ['apple', 10], ['banana', 20], ['cherry', 30], ['date', 40], ['elderberry', 50], ['fig', 60], ['grape', 70]
];

bench('entries.reduce', () => {
  return entries.reduce((sum, [, qty]) => sum + qty, 0);
});

bench('for...of loop', () => {
  let sum = 0;
  for (let i = 0; i < entries.length; i++) {
    sum += entries[i][1];
  }
  return sum;
});

bench('for...of loop 2', () => {
  let sum = 0;
  for (const entry of entries) {
    sum += entry[1];
  }
  return sum;
});

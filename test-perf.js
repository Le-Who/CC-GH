const bench = (name, fn) => {
  const start = performance.now();
  for(let i=0; i<1000000; i++) fn();
  const end = performance.now();
  console.log(`${name}: ${end-start}ms`);
}
const harvested = { apple: 10, banana: 20, cherry: 30, date: 40, elderberry: 50, fig: 60, grape: 70 };

bench('Object.values().reduce', () => {
  return Object.values(harvested).reduce((a, b) => a + b, 0);
});

bench('for...in loop', () => {
  let sum = 0;
  for(const k in harvested) sum += harvested[k];
  return sum;
});

bench('Object.keys().reduce', () => {
  return Object.keys(harvested).reduce((a, k) => a + harvested[k], 0);
});

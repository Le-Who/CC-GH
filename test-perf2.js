const bench = (name, fn) => {
  const start = performance.now();
  for(let i=0; i<1000000; i++) fn();
  const end = performance.now();
  console.log(`${name}: ${end-start}ms`);
}

const farmInventory = { apple: 0, banana: 0, cherry: 0, date: 0, elderberry: 1, fig: 0, grape: 0 };

bench('Object.values().some', () => {
  return Object.values(farmInventory).some(qty => qty > 0);
});

bench('for...in loop', () => {
  for(const k in farmInventory) {
    if (farmInventory[k] > 0) return true;
  }
  return false;
});

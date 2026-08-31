// Deterministic pseudo "live" price per symbol so quantity math is stable across renders.
export function getPrice(symbol = '') {
  let h = 0;
  for (let i = 0; i < symbol.length; i++) h = (h * 31 + symbol.charCodeAt(i)) % 100000;
  // spread prices roughly between ₹40 and ₹4000
  const base = 40 + (h % 3960);
  const cents = (h % 100) / 100;
  return Number((base + cents).toFixed(2));
}

// Compute per-constituent order rows for a given rupee amount + weights.
// quantity = floor(amount * weight% / price). Returns rows + the adjusted invested total.
export function computeOrders(constituents = [], amount = 0) {
  const rows = constituents.map((c) => {
    const price = getPrice(c.symbol);
    const alloc = (amount * (c.weight || 0)) / 100;
    const quantity = Math.max(0, Math.floor(alloc / price));
    return {
      symbol: c.symbol,
      name: c.name,
      weight: c.weight,
      price,
      quantity,
      value: Number((quantity * price).toFixed(2)),
      type: c.type,
    };
  });
  const adjusted = rows.reduce((s, r) => s + r.value, 0);
  return { rows, adjusted: Number(adjusted.toFixed(2)) };
}

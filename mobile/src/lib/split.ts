/**
 * Split amountCents by weights. The shares always add up exactly to amountCents.
 *
 * weights: one whole number per person. [1, 1, 1] = equal split,
 * [2, 1, 1] = the first person was involved twice as much.
 *
 * Leftover centavos go to the largest remainders, ties to whoever is earlier in the list.
 * ₱500 / 3 -> [16667, 16667, 16666]. Must stay identical to backend/expenses/split.py.
 */
export function splitAmount(amountCents: number, weights: number[]): number[] {
  if (!Number.isSafeInteger(amountCents) || amountCents < 0) {
    throw new Error('Amount must be zero or more whole centavos.');
  }
  if (weights.some((w) => !Number.isInteger(w) || w < 0)) {
    throw new Error('Weights must be whole numbers, zero or more.');
  }
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) throw new Error('Pick at least one person for this expense.');

  const remainders = weights.map((w) => (amountCents * w) % total);
  const shares = weights.map((w, i) => (amountCents * w - remainders[i]) / total);
  const leftover = amountCents - shares.reduce((a, b) => a + b, 0);
  const order = weights.map((_, i) => i).sort((a, b) => remainders[b] - remainders[a] || a - b);
  for (let k = 0; k < leftover; k++) shares[order[k]] += 1;
  return shares;
}

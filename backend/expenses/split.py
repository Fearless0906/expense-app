"""Splitting money between people.

All money is stored as whole centavos (₱500.00 -> 50000) so there are no
floating-point rounding errors. This must stay identical to mobile/src/split.ts.
"""


def split_amount(amount_cents: int, weights: list[int]) -> list[int]:
    """Split amount_cents by weights. The shares always add up exactly to amount_cents.

    weights: one whole number per person. [1, 1, 1] = equal split,
    [2, 1, 1] = the first person was involved twice as much.

    Leftover centavos go to the people with the largest remainder, ties going to
    whoever is earlier in the list. ₱500 / 3 -> [16667, 16667, 16666].
    """
    if not isinstance(amount_cents, int) or amount_cents < 0:
        raise ValueError("Amount must be zero or more whole centavos.")
    if any(not isinstance(w, int) or w < 0 for w in weights):
        raise ValueError("Weights must be whole numbers, zero or more.")
    total = sum(weights)
    if total <= 0:
        raise ValueError("Pick at least one person for this expense.")

    remainders = [amount_cents * w % total for w in weights]
    shares = [(amount_cents * w - r) // total for w, r in zip(weights, remainders)]
    leftover = amount_cents - sum(shares)
    order = sorted(range(len(weights)), key=lambda i: (-remainders[i], i))
    for i in order[:leftover]:
        shares[i] += 1
    return shares

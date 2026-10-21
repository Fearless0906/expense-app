/** "1,250.5" or "₱1250.50" -> 125050 centavos. Returns null if it isn't a valid amount. */
export function toCents(input: string): number | null {
  const cleaned = input.replace(/[₱,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, frac = ''] = cleaned.split('.');
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  return Number.isSafeInteger(cents) ? cents : null;
}

/** 125050 -> "₱1,250.50" */
export function peso(cents: number): string {
  const sign = cents < 0 ? '−' : '';
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}₱${whole}.${String(abs % 100).padStart(2, '0')}`;
}

export function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** "Due today" / "Due Oct 25, 2026" for an expense's due date. */
export function dueLabel(iso: string): string {
  return new Date(iso).toDateString() === new Date().toDateString() ? 'Due today' : `Due ${formatDay(iso)}`;
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
}

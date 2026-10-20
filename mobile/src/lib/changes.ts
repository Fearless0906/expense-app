type Listener = () => void;
const listeners = new Set<Listener>();

/** Screens subscribe here and re-run their queries whenever local data changes. */
export function subscribeData(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notifyChanged(): void {
  listeners.forEach((l) => l());
}

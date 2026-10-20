import { DependencyList, useEffect, useState } from 'react';

import { subscribeData } from './changes';

/** Runs a local SQLite query and re-runs it after any local edit or sync. */
export function useQuery<T>(query: () => Promise<T>, deps: DependencyList): T | undefined {
  const [data, setData] = useState<T>();
  useEffect(() => {
    let alive = true;
    const run = () => {
      query()
        .then((d) => alive && setData(d))
        .catch((e) => console.warn('Query failed', e));
    };
    run();
    const unsubscribe = subscribeData(run);
    return () => {
      alive = false;
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return data;
}

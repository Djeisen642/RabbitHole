import { useCallback, useEffect, useState } from 'react';
import { getJson } from '../lib/http';
import type {
  InitResponse,
  IncrementResponse,
  DecrementResponse,
} from '../../shared/api';

type CounterState = {
  count: number;
  username: string | null;
  loading: boolean;
};

export const useCounter = () => {
  const [state, setState] = useState<CounterState>({
    count: 0,
    username: null,
    loading: true,
  });
  const [postId, setPostId] = useState<string | null>(null);

  // fetch initial data
  useEffect(() => {
    const init = async () => {
      try {
        const res = await fetch('/api/init');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await getJson<InitResponse>(res);
        setState({
          count: data.count,
          username: data.username,
          loading: false,
        });
        setPostId(data.postId);
      } catch (err) {
        console.error('Failed to init counter', err);
        setState((prev) => ({ ...prev, loading: false }));
      }
    };
    void init();
  }, []);

  const update = useCallback(
    async (action: 'increment' | 'decrement') => {
      if (!postId) {
        console.error('No postId – cannot update counter');
        return;
      }
      try {
        const res = await fetch(`/api/${action}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await getJson<IncrementResponse | DecrementResponse>(res);
        setState((prev) => ({ ...prev, count: data.count }));
      } catch (err) {
        console.error(`Failed to ${action}`, err);
      }
    },
    [postId]
  );

  const increment = useCallback(() => {
    void update('increment');
  }, [update]);
  const decrement = useCallback(() => {
    void update('decrement');
  }, [update]);

  return {
    ...state,
    increment,
    decrement,
  } as const;
};

import { useSyncExternalStore } from 'react';

export interface Store<T> {
  get: () => T;
  set: (fn: (s: T) => T) => void;
  use: () => T;
}

export function createStore<T>(initial: T, onChange?: (s: T) => void): Store<T> {
  let state = initial;
  const listeners = new Set<() => void>();
  const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
  const get = () => state;
  return {
    get,
    set: fn => {
      state = fn(state);
      onChange?.(state);
      listeners.forEach(l => l());
    },
    use: () => useSyncExternalStore(subscribe, get)
  };
}

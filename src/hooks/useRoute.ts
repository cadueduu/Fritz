import { useSyncExternalStore } from 'react';

export const ROUTES = ['hoje', 'registrar', 'analise', 'diario', 'progresso', 'agente', 'plano'] as const;
export type Route = (typeof ROUTES)[number];

const read = (): Route => {
  const h = location.hash.replace(/^#\/?/, '') as Route;
  return ROUTES.includes(h) ? h : 'hoje';
};

const subscribe = (l: () => void) => {
  window.addEventListener('hashchange', l);
  return () => window.removeEventListener('hashchange', l);
};

export const useRoute = () => useSyncExternalStore(subscribe, read);

/** `replace` swaps the current history entry, for automatic hops that shouldn't add a back step. */
export const navigate = (r: Route, replace = false) => {
  if (read() === r && location.hash) return;
  if (replace) location.replace('#/' + r);
  else location.hash = '/' + r;
};

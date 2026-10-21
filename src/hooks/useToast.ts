import { useCallback, useEffect, useRef, useState } from 'react';

/** A single auto-dismissing message. */
export function useToast() {
  const [text, setText] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const show = useCallback((t: string, ms = 3000) => {
    setText(t);
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setText(null), ms);
  }, []);
  const hide = useCallback(() => { clearTimeout(timer.current); setText(null); }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  return [text, show, hide] as const;
}

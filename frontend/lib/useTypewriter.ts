"use client";

import { useCallback, useState } from "react";
import { reducedMotion } from "./effects";

export function useTypewriter() {
  const [text, setText] = useState("");
  const [typing, setTyping] = useState(false);

  const start = useCallback((full: string) => {
    const reduce = reducedMotion();
    setText("");
    setTyping(true);
    let i = 0;
    const step = () => {
      if (i <= full.length) {
        setText(full.slice(0, i));
        i += reduce ? full.length : 2;
        setTimeout(step, reduce ? 0 : 16);
      } else {
        setTyping(false);
      }
    };
    step();
  }, []);

  const reset = useCallback(() => {
    setText("");
    setTyping(false);
  }, []);

  return { text, typing, start, reset };
}

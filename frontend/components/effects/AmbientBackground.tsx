"use client";

import { useEffect, useRef } from "react";
import Starfield from "./Starfield";

export default function AmbientBackground() {
  const violetRef = useRef<HTMLDivElement>(null);
  const plasmaRef = useRef<HTMLDivElement>(null);
  const springRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const handleMove = (e: MouseEvent) => {
      const x = e.clientX / window.innerWidth - 0.5;
      const y = e.clientY / window.innerHeight - 0.5;
      if (violetRef.current) {
        violetRef.current.style.transform = `translate(${x * 30}px, ${y * 30}px)`;
      }
      if (plasmaRef.current) {
        plasmaRef.current.style.transform = `translate(${-x * 30}px, ${-y * 30}px)`;
      }
      if (springRef.current) {
        springRef.current.style.transform = `translate(${x * 18}px, ${-y * 22}px)`;
      }
    };

    document.addEventListener("mousemove", handleMove);
    return () => document.removeEventListener("mousemove", handleMove);
  }, []);

  return (
    <>
      <Starfield />
      <div className="bg-grid" aria-hidden="true" />
      <div ref={violetRef} className="orb orb-violet" aria-hidden="true" />
      <div ref={plasmaRef} className="orb orb-plasma" aria-hidden="true" />
      <div ref={springRef} className="orb orb-spring" aria-hidden="true" />
      <div className="scan-lines" aria-hidden="true" />
    </>
  );
}

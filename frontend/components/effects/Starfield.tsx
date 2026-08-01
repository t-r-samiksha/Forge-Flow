"use client";

import { useEffect, useRef } from "react";

interface Star {
  x: number;
  y: number;
  r: number;
  a: number;
  tw: number;
  vy: number;
}

export default function Starfield() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    let stars: Star[] = [];
    let width = 0;
    let height = 0;
    let rafId = 0;
    let phase = 0;

    const resize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
      stars = Array.from(
        { length: Math.min(90, Math.floor((width * height) / 16000)) },
        () => ({
          x: Math.random() * width,
          y: Math.random() * height,
          r: Math.random() * 1.3 + 0.3,
          a: Math.random() * 0.5 + 0.15,
          tw: Math.random() * 0.02 + 0.004,
          vy: Math.random() * 0.08 + 0.02,
        })
      );
    };

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      for (const s of stars) {
        const tw = reduce ? s.a : s.a + Math.sin(phase * s.tw * 60) * 0.15;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(180,180,220,${Math.max(0, tw)})`;
        ctx.fill();
        if (!reduce) {
          s.y += s.vy;
          if (s.y > height) {
            s.y = 0;
            s.x = Math.random() * width;
          }
        }
      }
      phase++;
      rafId = requestAnimationFrame(draw);
    };

    resize();
    window.addEventListener("resize", resize);
    draw();

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(rafId);
    };
  }, []);

  return <canvas ref={canvasRef} className="starfield" aria-hidden="true" />;
}

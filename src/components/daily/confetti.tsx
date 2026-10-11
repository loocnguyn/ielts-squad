"use client";

import { useEffect, useRef } from "react";

const COLORS = ["--skill-reading", "--skill-listening", "--skill-writing", "--skill-speaking", "--streak"];

/**
 * A short burst of paper when the day's four skills are done. Fires once per
 * `storageKey`, and not at all for people who ask for reduced motion.
 */
export function Confetti({ storageKey }: { storageKey: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      if (localStorage.getItem(storageKey)) return;
      localStorage.setItem(storageKey, "1");
    } catch {
      // Storage blocked: celebrate anyway.
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const ratio = window.devicePixelRatio || 1;
    canvas.width = window.innerWidth * ratio;
    canvas.height = window.innerHeight * ratio;
    ctx.scale(ratio, ratio);

    const styles = getComputedStyle(document.documentElement);
    const palette = COLORS.map((name) => styles.getPropertyValue(name).trim() || "#fff");
    const pieces = Array.from({ length: 140 }, () => ({
      x: window.innerWidth / 2 + (Math.random() - 0.5) * 120,
      y: window.innerHeight * 0.35,
      vx: (Math.random() - 0.5) * 14,
      vy: -Math.random() * 13 - 4,
      size: 5 + Math.random() * 6,
      spin: Math.random() * Math.PI,
      spinSpeed: (Math.random() - 0.5) * 0.4,
      color: palette[Math.floor(Math.random() * palette.length)],
    }));

    let frame = 0;
    let raf = 0;
    const tick = () => {
      frame += 1;
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      for (const p of pieces) {
        p.vy += 0.32;
        p.vx *= 0.99;
        p.x += p.vx;
        p.y += p.vy;
        p.spin += p.spinSpeed;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.spin);
        ctx.globalAlpha = Math.max(0, 1 - frame / 170);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      }
      if (frame < 170) raf = requestAnimationFrame(tick);
      else ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [storageKey]);

  return <canvas ref={canvasRef} aria-hidden className="pointer-events-none fixed inset-0 z-50 size-full" />;
}

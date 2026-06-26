"use client";

import { useEffect, useRef } from "react";

// solari split-flap cell. shows a value in a dark mono tile and does one subtle
// flip when the value changes. flips run through the web animations api (not a
// css transition) so the global reduced-motion neutralizer cannot reach them,
// which is why we also branch on matchMedia here and just swap with no flip.

interface SplitFlapProps {
  value: string;
  className?: string;
}

function wantsReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export default function SplitFlap({ value, className }: SplitFlapProps) {
  const cellRef = useRef<HTMLSpanElement>(null);
  const prevValue = useRef<string>(value);

  useEffect(() => {
    if (prevValue.current === value) return;
    prevValue.current = value;

    const el = cellRef.current;
    if (!el || wantsReducedMotion() || typeof el.animate !== "function") return;

    const anim = el.animate(
      [
        { transform: "rotateX(92deg)", opacity: 0, offset: 0 },
        { transform: "rotateX(-6deg)", opacity: 1, offset: 0.7 },
        { transform: "rotateX(0deg)", opacity: 1, offset: 1 },
      ],
      { duration: 300, easing: "cubic-bezier(0.2, 0.75, 0.25, 1)" },
    );
    return () => anim.cancel();
  }, [value]);

  return (
    <span
      className={`inline-flex ${className ?? ""}`}
      style={{ perspective: "320px" }}
    >
      <span
        ref={cellRef}
        className="relative inline-flex min-w-[4.75rem] items-center justify-center overflow-hidden rounded-[3px] px-2 py-[3px] font-mono text-[11px] font-semibold uppercase leading-none tracking-[0.12em]"
        style={{
          transformOrigin: "center top",
          backgroundColor: "#070B14",
          backgroundImage:
            "linear-gradient(to bottom, rgba(255,255,255,0.05), rgba(0,0,0,0.35))",
          boxShadow:
            "inset 0 0 0 1px rgba(30,39,64,0.85), 0 1px 1px rgba(0,0,0,0.5)",
        }}
      >
        {value}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-[0.5px] bg-black/55"
        />
      </span>
    </span>
  );
}

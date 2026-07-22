"use client";

import type { ReactNode } from "react";

// All wrappers here are CSS-driven — no framer-motion. Mount animations use
// CSS @keyframes so they complete even in hidden tabs (rAF throttling froze
// the old Framer variants), and press feedback is a CSS transform gated on
// motion-safe so prefers-reduced-motion users get none.

// ── SlideUp — CSS-driven for hidden-tab resilience ──

export function SlideUp({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <div
      className={`motion-slide-up ${className ?? ""}`}
      style={delay > 0 ? { animationDelay: `${delay}s` } : undefined}
    >
      {children}
    </div>
  );
}

// ── StaggerChildren — CSS-driven for hidden-tab resilience ──

export function StaggerChildren({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      {children}
    </div>
  );
}

/** Wrap each list item with this inside a StaggerChildren parent. */
export function StaggerItem({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`motion-slide-up ${className ?? ""}`}
    >
      {children}
    </div>
  );
}

// ── PressScale — tap feedback for interactive cards ─

export function PressScale({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`motion-safe:active:scale-[0.97] motion-safe:transition-transform motion-safe:duration-quick ${className ?? ""}`}
    >
      {children}
    </div>
  );
}

// ── PageTransition — CSS-driven mount ──

export function PageTransition({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`motion-page-transition ${className ?? ""}`}
    >
      {children}
    </div>
  );
}

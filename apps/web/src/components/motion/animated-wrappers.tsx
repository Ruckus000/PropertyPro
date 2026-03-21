"use client";

import { motion, useReducedMotion, type Variants } from "framer-motion";
import { semanticMotion } from "@propertypro/ui/tokens";
import type { ReactNode } from "react";

// ── Shared token-driven values ──────────────────────

const orientation = {
  duration: semanticMotion.orientation.duration / 1000,
  ease: [0, 0, 0.2, 1] as const, // enter easing
};

const feedback = {
  duration: semanticMotion.feedback.duration / 1000,
  ease: [0.4, 0, 0.2, 1] as const, // standard easing
};

// ── FadeIn ──────────────────────────────────────────

const fadeInVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

export function FadeIn({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      variants={fadeInVariants}
      initial="hidden"
      animate="visible"
      transition={reduced ? { duration: 0 } : { ...orientation, delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

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
  const reduced = useReducedMotion();
  return (
    <motion.div
      whileTap={reduced ? undefined : { scale: 0.97 }}
      transition={feedback}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// ── PageTransition — CSS-driven mount, Framer exit ──
//
// Mount animations use CSS @keyframes so they complete even when
// the browser tab is hidden (JS rAF is throttled in hidden tabs,
// which causes Framer Motion mount animations to freeze).
// Exit animations still use Framer Motion via AnimatePresence.

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

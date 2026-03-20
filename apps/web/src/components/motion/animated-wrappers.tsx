"use client";

import { motion, useReducedMotion, type Variants } from "framer-motion";
import { primitiveMotion, semanticMotion } from "@propertypro/ui/tokens";
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

// ── SlideUp ─────────────────────────────────────────

const slideUpVariants: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0 },
};

export function SlideUp({
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
      variants={reduced ? fadeInVariants : slideUpVariants}
      initial="hidden"
      animate="visible"
      transition={reduced ? { duration: 0 } : { ...orientation, delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// ── StaggerChildren ─────────────────────────────────

const staggerContainerVariants: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: primitiveMotion.duration.micro / 1000,
    },
  },
};

const staggerItemVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: orientation },
};

const staggerItemReducedVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0 } },
};

export function StaggerChildren({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      variants={staggerContainerVariants}
      initial="hidden"
      animate="visible"
      className={className}
    >
      {children}
    </motion.div>
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
  const reduced = useReducedMotion();
  return (
    <motion.div
      variants={reduced ? staggerItemReducedVariants : staggerItemVariants}
      className={className}
    >
      {children}
    </motion.div>
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

// ── PageTransition — for mobile route content ───────

const pageTransitionVariants: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
};

const pageTransitionReducedVariants: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

export function PageTransition({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      variants={reduced ? pageTransitionReducedVariants : pageTransitionVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={orientation}
      className={className}
    >
      {children}
    </motion.div>
  );
}

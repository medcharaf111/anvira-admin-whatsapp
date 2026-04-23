import type { Variants, Transition } from 'framer-motion';

// Unified motion tokens — every animation in the app pulls from here.

export const duration = {
  quick: 0.18, // micro-interactions, hover, toggle
  base: 0.28, // standard entrances
  slow: 0.4, // complex transitions (rare)
} as const;

export const easing = {
  out: [0.22, 1, 0.36, 1] as [number, number, number, number], // ease-out-quart
  in: [0.4, 0, 1, 1] as [number, number, number, number], // ease-in
};

export const spring: Transition = {
  type: 'spring',
  stiffness: 320,
  damping: 28,
  mass: 0.9,
};

export const softSpring: Transition = {
  type: 'spring',
  stiffness: 180,
  damping: 22,
};

export const pageVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: duration.base, ease: easing.out },
  },
  exit: {
    opacity: 0,
    y: -6,
    transition: { duration: duration.quick, ease: easing.in },
  },
};

export const staggerContainer: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.045, delayChildren: 0.05 },
  },
};

export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: spring },
};

export const bubbleVariants: Variants = {
  hidden: { opacity: 0, y: 10, scale: 0.96 },
  visible: { opacity: 1, y: 0, scale: 1, transition: spring },
};

export const fadeSwap: Variants = {
  hidden: { opacity: 0, y: 4 },
  visible: { opacity: 1, y: 0, transition: { duration: duration.quick, ease: easing.out } },
  exit: { opacity: 0, y: -4, transition: { duration: 0.12, ease: easing.in } },
};

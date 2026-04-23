'use client';
import { motion, MotionConfig } from 'framer-motion';
import { usePathname } from 'next/navigation';
import { pageVariants } from '@/lib/motion';

export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    // reducedMotion="user" makes every motion component respect prefers-reduced-motion
    <MotionConfig reducedMotion="user">
      <motion.div
        key={pathname}
        variants={pageVariants}
        initial="hidden"
        animate="visible"
      >
        {children}
      </motion.div>
    </MotionConfig>
  );
}

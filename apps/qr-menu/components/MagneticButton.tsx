'use client';

import { motion, useMotionValue, useSpring } from 'motion/react';
import { forwardRef, useRef } from 'react';
import { useFinePointer, useReducedMotion } from '@/lib/useMedia';

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & { strength?: number };

/**
 * Magnetic CTA: follows the pointer on fine-pointer devices and snaps back elastically.
 * Touch devices get no magnetism (just press feedback).
 */
export const MagneticButton = forwardRef<HTMLButtonElement, Props>(function MagneticButton(
  { strength = 0.28, className, children, onPointerMove, onPointerLeave, ...rest },
  forwarded,
) {
  const fine = useFinePointer();
  const reduced = useReducedMotion();
  const local = useRef<HTMLButtonElement | null>(null);
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const x = useSpring(mx, { stiffness: 260, damping: 14, mass: 0.6 });
  const y = useSpring(my, { stiffness: 260, damping: 14, mass: 0.6 });
  const active = fine && !reduced;

  return (
    <motion.button
      ref={(el) => {
        local.current = el;
        if (typeof forwarded === 'function') forwarded(el);
        else if (forwarded) forwarded.current = el;
      }}
      style={active ? { x, y } : undefined}
      whileTap={{ scale: 0.96 }}
      onPointerMove={(e) => {
        onPointerMove?.(e);
        if (!active || !local.current) return;
        const r = local.current.getBoundingClientRect();
        mx.set((e.clientX - (r.left + r.width / 2)) * strength);
        my.set((e.clientY - (r.top + r.height / 2)) * strength);
      }}
      onPointerLeave={(e) => {
        onPointerLeave?.(e);
        mx.set(0);
        my.set(0);
      }}
      className={className}
      {...(rest as React.ComponentProps<typeof motion.button>)}
    >
      {children}
    </motion.button>
  );
});

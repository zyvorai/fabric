import {useEffect, useRef} from 'react';
import type {ReactNode} from 'react';
import clsx from 'clsx';

type ParallaxImageProps = {
  children: ReactNode;
  className?: string;
  /** Max translateY in px applied at the edge of the scroll range. */
  strength?: number;
};

/**
 * Subtle scroll-linked translate/scale on its children, in the spirit of
 * apple.com product-page hero images. Disabled under prefers-reduced-motion
 * and when IntersectionObserver/rAF aren't available (SSR/build) — same
 * fallback approach as src/components/Reveal.
 */
export default function ParallaxImage({
  children,
  className,
  strength = 32,
}: ParallaxImageProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof window === 'undefined') {
      return;
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    let ticking = false;
    const update = () => {
      ticking = false;
      const rect = node.getBoundingClientRect();
      const viewportH = window.innerHeight || document.documentElement.clientHeight;
      const center = rect.top + rect.height / 2;
      const range = viewportH / 2 + rect.height / 2;
      const progress = range > 0 ? (center - viewportH / 2) / range : 0;
      const clamped = Math.max(-1, Math.min(1, progress));
      node.style.transform = `translateY(${clamped * strength}px) scale(${
        1 - Math.abs(clamped) * 0.015
      })`;
    };

    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    };

    update();
    window.addEventListener('scroll', onScroll, {passive: true});
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [strength]);

  return (
    <div ref={ref} className={clsx(className)} style={{willChange: 'transform'}}>
      {children}
    </div>
  );
}

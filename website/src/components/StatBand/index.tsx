import {useEffect, useRef, useState} from 'react';
import type {ReactNode} from 'react';
import styles from './styles.module.css';

type StatItem = {
  value: number;
  suffix?: string;
  label: string;
};

const STATS: StatItem[] = [
  {value: 780, suffix: '+', label: 'REST API endpoints behind one daemon'},
  {value: 194, suffix: '', label: 'security issues found — and fixed'},
  {value: 15, suffix: 'MB', label: 'single Rust binary'},
  {value: 31, suffix: '', label: 'rounds of independent security audit'},
];

function useCountUp(target: number, active: boolean, duration = 1200): number {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!active) {
      return;
    }
    if (
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      setValue(target);
      return;
    }

    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(target * eased));
      if (progress < 1) {
        raf = requestAnimationFrame(tick);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, target, duration]);

  return value;
}

function Stat({value, suffix, label}: StatItem) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      setActive(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setActive(true);
          observer.disconnect();
        }
      },
      {threshold: 0.4},
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const count = useCountUp(value, active);

  return (
    <div ref={ref} className={styles.stat}>
      <div className={styles.statValue}>
        {count}
        {suffix}
      </div>
      <p className={styles.statLabel}>{label}</p>
    </div>
  );
}

export default function StatBand(): ReactNode {
  return (
    <section className={styles.band}>
      <div className="container">
        <div className={styles.grid}>
          {STATS.map((stat) => (
            <Stat key={stat.label} {...stat} />
          ))}
        </div>
      </div>
    </section>
  );
}

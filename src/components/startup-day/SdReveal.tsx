import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

/** Intersection Observer: anima al entrar al viewport (una vez). */
export function SdReveal({
  children,
  className = '',
  delay = 0,
  as: Tag = 'div',
  style,
  id,
}: {
  children: ReactNode;
  className?: string;
  delay?: 0 | 1 | 2 | 3;
  as?: 'div' | 'section' | 'article' | 'li' | 'figure' | 'ol' | 'ul';
  style?: CSSProperties;
  id?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          obs.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const delayClass = delay ? ` sd-reveal-delay-${delay}` : '';
  return (
    <Tag
      ref={ref as never}
      id={id}
      className={`sd-reveal${inView ? ' is-in' : ''}${delayClass} ${className}`.trim()}
      style={style}
    >
      {children}
    </Tag>
  );
}

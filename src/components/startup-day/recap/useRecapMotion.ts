import { useLayoutEffect, type RefObject } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
gsap.registerPlugin(ScrollTrigger);

/** Scoped motion: native scrolling, no mobile pinning, no perpetual pointer loop. */
export function useRecapMotion(root: RefObject<HTMLElement>, ready = true) {
  useLayoutEffect(() => {
    if (!root.current) return;
    const media = gsap.matchMedia();
    media.add('(prefers-reduced-motion: no-preference)', () => {
      if (!ready) {
        // Set starting poses under the loader, so the reveal never flashes a finished hero first.
        const initial = gsap.context(() => {
          gsap.set('.sr-title-line > span', { yPercent: 110 });
          gsap.set('.sr-hero-meta, .sr-title-note, .sr-hero-bottom', { y: 12, opacity: 0 });
          gsap.set('.sr-hero-image', { scale: 1.07 });
          gsap.set('[data-sr-reveal]', { y: 24, opacity: .15 });
          gsap.set('.sr-story-word', { opacity: .22 });
        }, root);
        return () => initial.revert();
      }
      let revealObserver: IntersectionObserver | undefined;
      const ctx = gsap.context(() => {
        gsap.from('.sr-title-line > span', { yPercent: 110, duration: 1.05, stagger: .11, ease: 'power4.out', clearProps: 'transform' });
        gsap.from('.sr-hero-meta, .sr-title-note, .sr-hero-bottom', { y: 12, opacity: 0, duration: .7, delay: .4, clearProps: 'all' });
        gsap.fromTo('.sr-hero-image', { scale: 1.07 }, { scale: 1, duration: 1.6, ease: 'power3.out' });
        gsap.to('.sr-hero-image', { yPercent: 8, ease: 'none', scrollTrigger: { trigger: '.sr-hero', start: 'top top', end: 'bottom top', scrub: 1 } });
        // One observer owns section entrances; completed elements stop being observed.
        // Continuous parallax/reading motion below still uses ScrollTrigger for scroll progress.
        if ('IntersectionObserver' in window) {
          const sections = gsap.utils.toArray<HTMLElement>('[data-sr-reveal]');
          gsap.set(sections, { y: 24, opacity: .15 });
          revealObserver = new IntersectionObserver(entries => {
            for (const entry of entries) {
              if (!entry.isIntersecting) continue;
              ctx.add(() => {
                gsap.to(entry.target, { y: 0, opacity: 1, duration: .85, ease: 'power3.out', clearProps: 'transform,opacity' });
              });
              revealObserver?.unobserve(entry.target);
            }
          }, { threshold: .06, rootMargin: '0px 0px -6% 0px' });
          sections.forEach(section => revealObserver?.observe(section));
        }
        gsap.utils.toArray<HTMLElement>('.sr-story-word').forEach(el => {
          gsap.fromTo(el, { opacity: .22 }, { opacity: 1, scrollTrigger: { trigger: el, start: 'top 88%', end: 'top 55%', scrub: true } });
        });
        gsap.fromTo('.sr-film-frame', { clipPath: 'inset(0 4% 0 4%)' }, { clipPath: 'inset(0 0% 0 0%)', ease: 'none', scrollTrigger: { trigger: '.sr-film', start: 'top 85%', end: 'top 25%', scrub: .7 } });
      }, root);
      document.fonts.ready.then(() => { if (root.current) ScrollTrigger.refresh(); });
      return () => { revealObserver?.disconnect(); ctx.revert(); };
    });
    return () => media.revert();
  }, [root, ready]);
}

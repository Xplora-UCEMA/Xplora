import { useEffect, useRef, useState } from "react";
import { DEFAULT_LOGO_URL } from "../../lib/defaultsMedia";

const REST_POSE =
  "translateY(0%) rotateX(18deg) rotateY(-36deg) rotateZ(-8deg)";
const between = (min: number, max: number) => min + Math.random() * (max - min);

/** The Points coin: original artwork, CSS depth and endlessly varying, bounded motion. */
export function PointMark({ large = false }: { large?: boolean }) {
  const root = useRef<HTMLSpanElement>(null);
  const body = useRef<HTMLSpanElement>(null);
  const [running, setRunning] = useState(false);
  useEffect(() => {
    const element = root.current;
    const coin = body.current;
    if (!element || !coin) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let visible = false;
    let disposed = false;
    let animation: Animation | undefined;
    let previousPose = REST_POSE;
    let direction = 1;
    const canRun = () => visible && !document.hidden && !reducedMotion.matches;

    const advance = () => {
      if (disposed || reducedMotion.matches) return;
      const nextPose = `translateY(${between(-8, -1).toFixed(2)}%) rotateX(${between(-20, 20).toFixed(2)}deg) rotateY(${(direction * between(18, 38)).toFixed(2)}deg) rotateZ(${between(-12, 12).toFixed(2)}deg)`;
      direction *= -1;
      const previousAnimation = animation;
      animation = coin.animate(
        [{ transform: previousPose }, { transform: nextPose }],
        { duration: between(3200, 5200), easing: "ease-in-out", fill: "both" },
      );
      // Retire the completed segment so no finished effects accumulate.
      previousAnimation?.cancel();
      animation.onfinish = () => {
        previousPose = nextPose;
        advance();
      };
      if (!canRun()) animation.pause();
    };

    const update = () => {
      const active = canRun();
      setRunning(active);
      if (reducedMotion.matches) {
        animation?.cancel();
        animation = undefined;
        previousPose = REST_POSE;
        direction = 1;
      } else if (active) {
        if (animation) animation.play();
        else advance();
      } else animation?.pause();
    };
    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting && entry.intersectionRatio >= 0.1;
        update();
      },
      { threshold: 0.1 },
    );
    observer.observe(element);
    document.addEventListener("visibilitychange", update);
    reducedMotion.addEventListener("change", update);
    return () => {
      disposed = true;
      if (animation) {
        animation.onfinish = null;
        animation.cancel();
      }
      observer.disconnect();
      document.removeEventListener("visibilitychange", update);
      reducedMotion.removeEventListener("change", update);
    };
  }, []);
  return (
    <span
      ref={root}
      className={`xp-mark${large ? " xp-mark--large" : ""}`}
      data-running={running}
      aria-hidden="true"
    >
      <span ref={body} className="xp-mark__body">
        {Array.from({ length: 18 }, (_, layer) => (
          <img
            key={layer}
            className="xp-mark__edge"
            src={DEFAULT_LOGO_URL}
            alt=""
            width={160}
            height={160}
            draggable={false}
            style={{
              transform: `translateZ(calc(var(--xp-mark-depth) * ${layer / 18}))`,
            }}
          />
        ))}
        <img
          className="xp-mark__face"
          src={DEFAULT_LOGO_URL}
          alt=""
          width={160}
          height={160}
          draggable={false}
          decoding="async"
        />
      </span>
    </span>
  );
}

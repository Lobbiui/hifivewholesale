"use client";

import { useCallback, useEffect, useState } from "react";

export function CinematicIntro() {
  const [visible, setVisible] = useState(true);
  const close = useCallback(() => {
    sessionStorage.setItem("hifive-intro-seen", "1");
    setVisible(false);
  }, []);

  useEffect(() => {
    const hydrateTimer = window.setTimeout(() => {
      if (sessionStorage.getItem("hifive-intro-seen") || window.matchMedia("(prefers-reduced-motion: reduce)").matches) close();
    }, 0);
    const exitTimer = window.setTimeout(close, 6000);
    return () => {
      window.clearTimeout(hydrateTimer);
      window.clearTimeout(exitTimer);
    };
  }, [close]);

  if (!visible) return null;
  return (
    <div className="cinematic-intro" aria-label="Hi-Five cinematic introduction">
      <div className="intro-logo-wave-stage">
        <video
          className="intro-logo-wave"
          src="/videos/hifive-logo-wave.mp4"
          poster="/images/hifive-logo.png"
          autoPlay
          muted
          playsInline
          preload="auto"
          onEnded={close}
          aria-hidden="true"
        >
          Your browser does not support the Hi-Five animated introduction.
        </video>
      </div>
      <button className="intro-skip" onClick={close}>Enter site <span>↗</span></button>
      <div className="intro-progress" />
      <button className="intro-hitarea" aria-label="Continue to website" onClick={close} />
    </div>
  );
}

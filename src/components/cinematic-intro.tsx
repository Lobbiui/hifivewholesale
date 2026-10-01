"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";

export function CinematicIntro() {
  const [visible, setVisible] = useState(true);
  const close = useCallback(() => {
    sessionStorage.setItem("hifive-intro-seen", "1");
    setVisible(false);
  }, []);

  useEffect(() => {
    const hydrateTimer = window.setTimeout(() => {
      if (
        sessionStorage.getItem("hifive-intro-seen") ||
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
      )
        close();
    }, 0);
    const exitTimer = window.setTimeout(close, 6000);
    return () => {
      window.clearTimeout(hydrateTimer);
      window.clearTimeout(exitTimer);
    };
  }, [close]);

  if (!visible) return null;
  return (
    <div className="cinematic-intro" aria-label="HiFive cinematic introduction">
      <div className="intro-logo-wave-stage">
        <Image
          className="intro-logo-wave"
          src="/images/hifive-logo-black-banner.png"
          alt=""
          width={1254}
          height={1254}
          priority
        />
      </div>
      <button className="intro-skip" onClick={close}>
        Enter site <span>↗</span>
      </button>
      <div className="intro-progress" />
      <button
        className="intro-hitarea"
        aria-label="Continue to website"
        onClick={close}
      />
    </div>
  );
}

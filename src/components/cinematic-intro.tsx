"use client";

import { Player, PlayerRef } from "@remotion/player";
import { useEffect, useRef, useState } from "react";
import { CinematicOpener } from "@/remotion/CinematicOpener";

export function CinematicIntro() {
  const [visible, setVisible] = useState(true);
  const player = useRef<PlayerRef>(null);
  useEffect(() => {
    const hydrateTimer = window.setTimeout(() => {
      if (sessionStorage.getItem("hifive-intro-seen")) setVisible(false);
    }, 0);
    const exitTimer = window.setTimeout(() => {
      sessionStorage.setItem("hifive-intro-seen", "1");
      setVisible(false);
    }, 5200);
    return () => {
      window.clearTimeout(hydrateTimer);
      window.clearTimeout(exitTimer);
    };
  }, []);
  const close = () => { sessionStorage.setItem("hifive-intro-seen", "1"); setVisible(false); };
  if (!visible) return null;
  return (
    <div className="cinematic-intro" aria-label="Hi-Five cinematic introduction">
      <Player ref={player} component={CinematicOpener} durationInFrames={150} compositionWidth={1920} compositionHeight={1080} fps={30} autoPlay initiallyMuted controls={false} style={{ width: "100%", height: "100%" }} acknowledgeRemotionLicense />
      <button className="intro-skip" onClick={close}>Enter site <span>↗</span></button>
      <div className="intro-progress" />
      <button className="intro-hitarea" aria-label="Continue to website" onClick={close} />
    </div>
  );
}

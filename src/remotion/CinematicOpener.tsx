import { AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";

export function CinematicOpener() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ backgroundColor: "#050408", overflow: "hidden" }}>
      <Img
        src={staticFile("images/cinematic-warehouse.png")}
        style={{
          position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover",
          opacity: interpolate(frame, [0, fps * 0.6, fps * 4.2, fps * 5], [0, 0.82, 0.82, 0.35], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
          scale: interpolate(frame, [0, fps * 5], [1.09, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.bezier(0.16, 1, 0.3, 1), output: "perceptual-scale" }),
        }}
      />
      <AbsoluteFill style={{ background: "linear-gradient(90deg, rgba(5,4,8,.72), transparent 45%, rgba(5,4,8,.45)), radial-gradient(circle at 50% 58%, transparent, rgba(5,4,8,.55))" }} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", padding: "8%" }}>
        <Img
          src={staticFile("images/hifive-logo.png")}
          style={{
            width: "min(620px, 50vw)", objectFit: "contain",
            opacity: interpolate(frame, [fps * 0.5, fps * 1.4, fps * 4.2, fps * 4.8], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.bezier(0.16, 1, 0.3, 1) }),
            scale: interpolate(frame, [fps * 0.5, fps * 1.8], [0.82, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.spring({ damping: 200 }), output: "perceptual-scale" }),
          }}
        />
        <div style={{ marginTop: 24, color: "white", fontFamily: "Arial, sans-serif", fontSize: "clamp(22px, 2.5vw, 44px)", fontWeight: 900, letterSpacing: ".32em", textTransform: "uppercase", opacity: interpolate(frame, [fps * 1.4, fps * 2.2, fps * 4.1, fps * 4.7], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
          Wholesale. Elevated.
        </div>
      </AbsoluteFill>
      <div style={{ position: "absolute", left: 0, right: 0, top: "50%", height: 2, background: "#9b4dff", boxShadow: "0 0 32px #9b4dff", scale: interpolate(frame, [0, fps * 0.5], [0, 1], { extrapolateRight: "clamp", easing: Easing.bezier(0.16, 1, 0.3, 1) }), opacity: interpolate(frame, [0, fps * 0.6], [1, 0], { extrapolateRight: "clamp" }) }} />
    </AbsoluteFill>
  );
}


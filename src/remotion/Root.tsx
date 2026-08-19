import { Composition } from "remotion";
import { CinematicOpener } from "./CinematicOpener";

export function RemotionRoot() {
  return <Composition id="HiFiveOpener" component={CinematicOpener} durationInFrames={150} fps={30} width={1920} height={1080} />;
}


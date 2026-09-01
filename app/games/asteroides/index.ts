import type { GameModule } from "../types";
import { createEngine } from "./engine";
import { H, W } from "./entities";

const asteroides: GameModule = {
  width: W,
  height: H,
  create: createEngine,
};

export default asteroides;

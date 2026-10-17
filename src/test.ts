import { _, Data, DataVariable, MCFunction, NBT, random, say, tellraw } from "sandstone";
import { FloatVar } from "./floatVar";

MCFunction('test', () => {
  const a = new FloatVar(1.009, 3);
  tellraw('@p', FloatVar.random(5)["+"](a).show());
});
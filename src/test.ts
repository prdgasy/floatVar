import { _, Data, DataVariable, MCFunction, NBT, say, tellraw } from "sandstone";
import { FloatVar } from "./floatVar";

MCFunction('test', () => {
  const a = new FloatVar(1.009);
  const b = new FloatVar(-4);

  tellraw('@p', b.show());
});
import { _, comment, Data, DataVariable, MCFunction, NBT, random, say, tellraw } from "sandstone";
import { FloatVar } from "./floatVar";

MCFunction('test', () => {
  const d = DataVariable(1.2);
  const a = new FloatVar(d, 4);
  tellraw('@p', a.show());

  comment("============");

  a["+="](d);
});
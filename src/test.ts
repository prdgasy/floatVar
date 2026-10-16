import { _, Data, DataVariable, MCFunction, NBT, say, tellraw } from "sandstone";
import { FloatVar } from "./floatVar";

MCFunction('test', () => {
  const a = new FloatVar(1.009);
  const b = new FloatVar(2.04);

  _.if(a['>='](b), () => {
    say('a_greater_than_b');
  })
});
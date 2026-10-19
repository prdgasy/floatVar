import { comment, DataVariable, MCFunction, tellraw } from "sandstone";
import { FloatVar } from "./floatVar";

MCFunction('test', () => {
	const a = new FloatVar(DataVariable(1.2), 5);
	tellraw('@p', a.toData());

	comment("============");

	a["+="](new FloatVar(2.5));
});
import { comment, DataVariable, MCFunction, tellraw } from "sandstone";
import { Float } from "./float";

MCFunction('test', () => {
	const a = Float.variable(1.5);
	tellraw('@p', a.toData());

	const xp = Float.objective('xp')
	const player1 = xp('@p');
	const player2 = xp('player_2');

	player1.set(0.1);
	player2.set(Float.random());

	a["+="](player1);
});
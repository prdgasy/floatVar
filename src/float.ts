import {
	_,
	Data,
	DataPointClass,
	defaultNamespace,
	execute,
	MCFunction,
	Objective,
	ObjectiveClass,
	Score,
	Variable,
	Macro as $
} from "sandstone";
import { NotNode } from "sandstone/flow";
import { ConditionClass } from "sandstone/variables";
import { SelectorArgument } from "sandstone/arguments";

/**
 * Accepted operand types.
 * - `number`         : real value (1.5)
 * - `Score`          : INTEGER value (a Score of 3 means 3.0)
 * - `DataPointClass` : NBT number read as a real value
 * - `FloatVar`       : another fixed-point value (any precision)
 */
export type Values = Float | Score | number | DataPointClass;

export type FloatObjectiveType = (selector: SelectorArgument) => Float;
/** Max precision. Above 4, 1/scale is printed in scientific notation by JS, which Minecraft cannot parse. */
const MAX_PRECISION = 4;

/**
 * Fixed-point number stored in a scoreboard (value * 10^precision).
 *
 * Range: ±2 147 483 647 / 10^precision (precision 2 → ±21 474 836.47, precision 4 → ±214 748.3647).
 * Rounding: round-half-up (toward +∞ on ties) everywhere a rounding is needed.
 * Scoreboard division by zero is a no-op in Minecraft; Float division by zero returns 0.
 */
export class Float {
	public static ns = defaultNamespace.toString();
	public static storage = Data('storage', `${Float.ns}:prodigelib`, 'Float');
	public static nextId = 0;

	public score: Score;
	private precision: number;
	private scale: number;

	private out: DataPointClass;

	private constructor(name: string, precision: number, selector: SelectorArgument, out: string) {
		Float.checkPrecision(precision);
		this.precision = precision;
		this.scale = 10 ** precision;
		this.out = Float.storage.select(out);
		this.score = Objective.create(name)(selector);
	}

	public static objective(name: string, precision = 1): FloatObjectiveType {
		return (selector: SelectorArgument) => new Float(name, precision, selector, `${name}.out`);;
	}

	public static variable(value?: Values, precision = 1, raw = false): Float {
		const id = Float.nextId++;
		const f = new Float('prodigelib.float', precision, `var_${id}`, `var_${id}.out`);

		if (value !== undefined) f.set(value, raw);
		return f;
	}

	public set(value: Values, raw = false): Float {
		raw ?
			this.score.set(Float.valuesToScore(value)) : this.score.set(this.toScaled(value));

		return this;
	}

	private static valuesToScore(value: Values): Score {
		if (value instanceof Score) return value;
		else if (value instanceof DataPointClass) return Variable(value);
		else if (value instanceof Float) return value.score;
		else return Variable(Math.round(value));
	}


	/**
	 * Generates a random float in [min, max] (default [0, 1]).
	 * @example
	 * ```typescript
	 * FloatVar.random(3)          // 0.254
	 * FloatVar.random(1, -5, 5)   // -3.2
	 * ```
	 */
	public static random(precision: number = 2, min: number = 0, max: number = 1): Float {
		Float.checkPrecision(precision);
		const s = 10 ** precision;
		const v = Float.variable(undefined, precision);
		execute.store.result(v.score).run.
			random.value([Math.round(min * s), Math.round(max * s)]);

		return v;
	}

	/** Round-half-up division by a compile-time positive integer. Returns a new Score. */
	private static roundDiv(score: Score, d: number): Score {
		const r = Variable(score);
		if (d === 1) return r;
		r['+='](Math.floor(d / 2));
		r['/='](d);
		return r;
	}

	/**
	 * Any operand → score at THIS precision (or a constant).
	 */
	private toScaled(other: Values): Score {
		if (typeof other === 'number') return Variable(Math.round(other * this.scale));

		if (other instanceof Float) {
			const diff = this.precision - other.precision;
			if (diff === 0) return other.score;
			if (diff > 0) {
				const t = Variable(other.score);
				t['*='](10 ** diff);
				return t;
			}
			return Float.roundDiv(other.score, 10 ** -diff);
		}

		if (other instanceof Score) {
			if (this.scale === 1) return other;
			const t = Variable(other);
			t['*='](this.scale);
			return t;
		}

		const v = Variable();
		execute.store.result(v).run.data.get(other, this.scale);
		return v;
	}

	public clone(): Float {
		return Float.variable(this.score, this.precision, true);
	}

	/**
	 * Integer score. `mode`: 'floor' (default), 'round' (half up) or 'ceil'.
	 * The floating part is lost.
	 */
	public toScore(mode: 'floor' | 'round' | 'ceil' = 'floor'): Score {
		if (this.scale === 1) return Variable(this.score);
		if (mode === 'round') return Float.roundDiv(this.score, this.scale);
		const r = Variable(this.score);
		if (mode === 'floor') {
			r['/='](this.scale);
		} else {
			r['*='](-1);
			r['/='](this.scale);
			r['*='](-1);
		}
		return r;
	}

	/**
	 * Writes the value as a real NBT number into storage (for teleport, attributes, entity data...).
	 * @param type 'double' (default) or 'float'
	 * @param target Destination path (default: a unique path per instance)
	 */
	public toData(type: 'float' | 'double' = 'double', target?: DataPointClass): DataPointClass {
		const dest = target ?? this.out;
		execute.store.result(dest, type, 1 / this.scale).run.scoreboard.players.get(this.score);
		return dest;
	}

	/** Displays the float value with correct precision point. */
	public show(): DataPointClass {
		const st = Float.storage;
		const sign = st.select('sign');
		const unit = st.select('unit');
		const temp = st.select('temp');
		const p = this.precision;

		const abs = Variable(this.score);
		_.if(abs['<'](0), () => {
			abs['*='](-1);
			sign.set('-');
		}).else(() => {
			sign.set('');
		});

		const unitScore = Variable(abs);
		unitScore['/='](this.scale);
		unit.set(unitScore);

		const args: DataPointClass[] = [sign, unit];
		for (let i = p - 1; i >= 0; i--) {
			const decimal = Variable(abs);
			if (i > 0) decimal['/='](10 ** i);
			decimal['%='](10);
			const d_i = st.select(`d${i}`);
			d_i.set(decimal);
			args.push(d_i);
		}

		const setValue = MCFunction(`__lib/floatvar/set_value_${p}`, args, () => {
			// ${sign}${unit}.${d(p-1)}...${d0}
			const strings: string[] = new Array(args.length + 1).fill('');
			if (p > 0) strings[2] = '.';
			const tag = $ as unknown as (s: TemplateStringsArray, ...v: unknown[]) => any;
			const text = tag(Object.assign(strings, { raw: strings }) as unknown as TemplateStringsArray, ...args);

			$.data.modify(temp).set.value(text);
		}, { onConflict: 'ignore' });
		setValue();

		return this.out.set(temp);
	}



	// ---------------------------------------------------------------- comparisons
	private compare(other: Values, op: '>=' | '>' | '<=' | '<'): ConditionClass {
		return this.score[op](this.toScaled(other));
	}

	public greaterThan(other: Values) { return this.compare(other, '>'); }
	public greaterOrEqualThan(other: Values) { return this.compare(other, '>='); }
	public lessThan(other: Values) { return this.compare(other, '<'); }
	public lessOrEqualThan(other: Values) { return this.compare(other, '<='); }
	public equalTo(other: Values): ConditionClass { return this.score.equalTo(this.toScaled(other)); }
	public notEqualTo(other: Values): NotNode { return this.score.notEqualTo(this.toScaled(other)); }

	// ---------------------------------------------------------------- +, -
	private additive(other: Values, op: '+=' | '-=', inPlace: boolean): Float {
		const o = this.toScaled(other);
		if (inPlace) {
			this.score[op](o);
			return this;
		}
		const r = this.clone();
		r.score[op](o);
		return r;
	}

	public plus(other: Values) { return this.additive(other, '+=', false); }
	public minus(other: Values) { return this.additive(other, '-=', false); }
	public add(other: Values) { return this.additive(other, '+=', true); }
	public sub(other: Values) { return this.additive(other, '-=', true); }

	// ---------------------------------------------------------------- *, /
	private mulScore(other: Values, inPlace: boolean): Score {
		const result = inPlace ? this.score : Variable(this.score);
		result['*='](this.toScaled(other))['/='](this.scale);
		return result;
	}

	private divScore(other: Values, inPlace: boolean): Score {
		if (typeof other === 'number' && other === 0) throw new RangeError('FloatVar: division by constant zero');

		const divisor = this.toScaled(other);          // lu AVANT de modifier result
		const result = inPlace ? this.score : Variable(this.score);
		result['*='](this.scale);                      // (a_s * scale) ...
		result['/='](divisor);                         // ... / b_s
		return result;
	}

	/** a * b. An integer (number or Score) is applied directly; a real goes through fixed-point multiplication. */
	public times(other: Values) { return Float.variable(this.mulScore(other, false), this.precision, true); }
	public mult(other: Values) { this.mulScore(other, true); return this; }

	/** a / b. Division by zero gives 0. */
	public dividedBy(other: Values) { return Float.variable(this.divScore(other, false), this.precision, true); }
	public div(other: Values) { this.divScore(other, true); return this; }

	/** a % b (result takes the sign of b, like the scoreboard). */
	public mod(other: Values): Float {
		const r = this.clone();
		r.score['%='](this.toScaled(other));
		return r;
	}

	// ---------------------------------------------------------------- math
	public neg(): Float {
		const r = this.clone();
		r.score['*='](-1);
		return r;
	}

	public abs(): Float {
		const r = this.clone();
		_.if(r.score['<'](0), () => {
			r.score['*='](-1);
		});
		return r;
	}

	/** Score: -1, 0 or 1. */
	public sign(): Score {
		const s = Variable(0);
		_.if(this.score['>'](0), () => {
			s.set(1);
		});
		_.if(this.score['<'](0), () => {
			s.set(-1);
		});
		return s;
	}

	public min(other: Values): Float {
		const o = this.toScaled(other);
		const r = this.clone();
		_.if(r.score['>'](o), () => {
			r.score.set(o);
		});
		return r;
	}

	public max(other: Values): Float {
		const o = this.toScaled(other);
		const r = this.clone();
		_.if(r.score['<'](o), () => {
			r.score.set(o);
		});
		return r;
	}

	/** Largest integer value <= this (still a FloatVar). */
	public floor(): Float {
		const r = this.toScore('floor');
		r['*='](this.scale);
		return Float.variable(r, this.precision, true);
	}

	public ceil(): Float {
		const r = this.toScore('ceil');
		r['*='](this.scale);
		return Float.variable(r, this.precision, true);
	}

	public round(): Float {
		const r = this.toScore('round');
		r['*='](this.scale);
		return Float.variable(r, this.precision, true);
	}


	private static checkPrecision(p: number) {
		if (!Number.isInteger(p) || p < 0 || p > MAX_PRECISION) {
			throw new RangeError(`FloatVar: precision must be an integer between 0 and ${MAX_PRECISION}, got ${p}.`);
		}
	}

	/** Removes the whole lib storage. */
	public static uninstall() {
		Float.storage.remove();
	}
}

// -------------------------------------------------------------------- operator aliases
// Declared once on the prototype instead of one closure per instance.
export interface Float {
	'>'(other: Values): ConditionClass;
	'>='(other: Values): ConditionClass;
	'<'(other: Values): ConditionClass;
	'<='(other: Values): ConditionClass;
	'=='(other: Values): ConditionClass;
	'!='(other: Values): NotNode;
	'+'(other: Values): Float;
	'-'(other: Values): Float;
	'*'(other: Values): Float;
	'/'(other: Values): Float;
	'%'(other: Values): Float;
	'+='(other: Values): Float;
	'-='(other: Values): Float;
	'*='(other: Values): Float;
	'/='(other: Values): Float;
}

const proto = Float.prototype;
proto['>'] = proto.greaterThan;
proto['>='] = proto.greaterOrEqualThan;
proto['<'] = proto.lessThan;
proto['<='] = proto.lessOrEqualThan;
proto['=='] = proto.equalTo;
proto['!='] = proto.notEqualTo;
proto['+'] = proto.plus;
proto['-'] = proto.minus;
proto['*'] = proto.times;
proto['/'] = proto.dividedBy;
proto['%'] = proto.mod;
proto['+='] = proto.add;
proto['-='] = proto.sub;
proto['*='] = proto.mult;
proto['/='] = proto.div;
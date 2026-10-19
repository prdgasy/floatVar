import {
	_,
	Data,
	DataPointClass,
	defaultNamespace,
	execute,
	Score,
	Variable
} from "sandstone";
import { NotNode } from "sandstone/flow";
import { ConditionClass } from "sandstone/variables";

/**
 * Accepted operand types.
 * - `number`         : real value (1.5)
 * - `Score`          : INTEGER value (a Score of 3 means 3.0)
 * - `DataPointClass` : NBT number read as a real value
 * - `FloatVar`       : another fixed-point value (any precision)
 */
export type numberLike = FloatVar | Score | number | DataPointClass;

/** Max precision. Above 4, 1/scale is printed in scientific notation by JS, which Minecraft cannot parse. */
const MAX_PRECISION = 4;

/**
 * Fixed-point number stored in a scoreboard (value * 10^precision).
 *
 * Range: ±2 147 483 647 / 10^precision (precision 2 → ±21 474 836.47, precision 4 → ±214 748.3647).
 * Rounding: round-half-up (toward +∞ on ties) everywhere a rounding is needed.
 * Scoreboard division by zero is a no-op in Minecraft; FloatVar division by zero returns 0.
 */
export class FloatVar {
	private static nextId = 0;
	private static ns = defaultNamespace.toString();
	private static storage = Data('storage', `${FloatVar.ns}:prodigelib`, 'FloatVar');

	private score: Score;
	private id: number;
	private precision: number;
	private scale: number;

	private out: DataPointClass;

	/**
 * @param value Real value (see numberLike), or an already-scaled value if `raw` is true.
 * @param precision Number of decimals, 0..6.
 * @param raw If true, `value` is already multiplied by 10^precision and is taken as is.
 *            A raw Score is NOT copied: the instance takes ownership of it, so pass a fresh one.
 */
	constructor(value: numberLike = 0, precision: number = 2, raw: boolean = false) {
		FloatVar.checkPrecision(precision);
		this.precision = precision;
		this.scale = 10 ** precision;
		this.id = FloatVar.nextId++;
		this.out = FloatVar.storage.select(`out_${this.id}`);

		this.score = raw ? this.toRaw(value) : this.toScaled(value);
	}
	/** raw = true: the value is already scaled. */
	private toRaw(value: numberLike): Score {
		if (typeof value === 'number') return Variable(value);
		if (value instanceof FloatVar) return Variable(value.score);
		if (value instanceof Score) return Variable(value);
		return Variable(value);
	}

	private static checkPrecision(p: number) {
		if (!Number.isInteger(p) || p < 0 || p > MAX_PRECISION) {
			throw new RangeError(`FloatVar: precision must be an integer between 0 and ${MAX_PRECISION}, got ${p}`);
		}
	}

	/**
	 * Generates a random float in [min, max] (default [0, 1]).
	 * @example
	 * ```typescript
	 * FloatVar.random(3)          // 0.254
	 * FloatVar.random(1, -5, 5)   // -3.2
	 * ```
	 */
	public static random(precision: number = 2, min: number = 0, max: number = 1): FloatVar {
		FloatVar.checkPrecision(precision);
		const s = 10 ** precision;
		const v = Variable();
		execute.store.result(v).run.random.value([Math.round(min * s), Math.round(max * s)]);
		return new FloatVar(v, precision, true);
	}

	/** Removes the whole lib storage. */
	public static uninstall() {
		FloatVar.storage.remove();
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
	private toScaled(other: numberLike): Score {
		if (typeof other === 'number') return Variable(Math.round(other * this.scale));

		if (other instanceof FloatVar) {
			const diff = this.precision - other.precision;
			if (diff === 0) return other.score;
			if (diff > 0) {
				const t = Variable(other.score);
				t['*='](10 ** diff);
				return t;
			}
			return FloatVar.roundDiv(other.score, 10 ** -diff);
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

	public clone(): FloatVar {
		return new FloatVar(this.score, this.precision, true);
	}

	public getRawScore(): Score {
		return this.score;
	}

	/**
	 * Integer score. `mode`: 'floor' (default), 'round' (half up) or 'ceil'.
	 * The floating part is lost.
	 */
	public toScore(mode: 'floor' | 'round' | 'ceil' = 'floor'): Score {
		if (this.scale === 1) return Variable(this.score);
		if (mode === 'round') return FloatVar.roundDiv(this.score, this.scale);
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

	public set(value: numberLike) {
		this.score.set(this.toScaled(value));
		return this;
	}

	// ---------------------------------------------------------------- comparisons
	private compare(other: numberLike, op: '>=' | '>' | '<=' | '<'): ConditionClass {
		return this.score[op](this.toScaled(other));
	}

	public greaterThan(other: numberLike) { return this.compare(other, '>'); }
	public greaterOrEqualThan(other: numberLike) { return this.compare(other, '>='); }
	public lessThan(other: numberLike) { return this.compare(other, '<'); }
	public lessOrEqualThan(other: numberLike) { return this.compare(other, '<='); }
	public equalTo(other: numberLike): ConditionClass { return this.score.equalTo(this.toScaled(other)); }
	public notEqualTo(other: numberLike): NotNode { return this.score.notEqualTo(this.toScaled(other)); }

	// ---------------------------------------------------------------- +, -
	private additive(other: numberLike, op: '+=' | '-=', inPlace: boolean): FloatVar {
		const o = this.toScaled(other);
		if (inPlace) {
			this.score[op](o);
			return this;
		}
		const r = this.clone();
		r.score[op](o);
		return r;
	}

	public plus(other: numberLike) { return this.additive(other, '+=', false); }
	public minus(other: numberLike) { return this.additive(other, '-=', false); }
	public add(other: numberLike) { return this.additive(other, '+=', true); }
	public sub(other: numberLike) { return this.additive(other, '-=', true); }

	// ---------------------------------------------------------------- *, /
	private mulScore(other: numberLike, inPlace: boolean): Score {
		const result = inPlace ? this.score : Variable(this.score);
		result['*='](this.toScaled(other))['/='](this.scale);
		return result;
	}

	private divScore(other: numberLike, inPlace: boolean): Score {
		if (typeof other === 'number' && other === 0) throw new RangeError('FloatVar: division by constant zero');

		const divisor = this.toScaled(other);          // lu AVANT de modifier result
		const result = inPlace ? this.score : Variable(this.score);
		result['*='](this.scale);                      // (a_s * scale) ...
		result['/='](divisor);                         // ... / b_s
		return result;
	}

	/** a * b. An integer (number or Score) is applied directly; a real goes through fixed-point multiplication. */
	public times(other: numberLike) { return new FloatVar(this.mulScore(other, false), this.precision, true); }
	public mult(other: numberLike) { this.mulScore(other, true); return this; }

	/** a / b. Division by zero gives 0. */
	public dividedBy(other: numberLike) { return new FloatVar(this.divScore(other, false), this.precision, true); }
	public div(other: numberLike) { this.divScore(other, true); return this; }

	/** a % b (result takes the sign of b, like the scoreboard). */
	public mod(other: numberLike): FloatVar {
		const r = this.clone();
		r.score['%='](this.toScaled(other));
		return r;
	}

	// ---------------------------------------------------------------- math
	public neg(): FloatVar {
		const r = this.clone();
		r.score['*='](-1);
		return r;
	}

	public abs(): FloatVar {
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

	public min(other: numberLike): FloatVar {
		const o = this.toScaled(other);
		const r = this.clone();
		_.if(r.score['>'](o), () => {
			r.score.set(o);
		});
		return r;
	}

	public max(other: numberLike): FloatVar {
		const o = this.toScaled(other);
		const r = this.clone();
		_.if(r.score['<'](o), () => {
			r.score.set(o);
		});
		return r;
	}

	/** Largest integer value <= this (still a FloatVar). */
	public floor(): FloatVar {
		const r = this.toScore('floor');
		r['*='](this.scale);
		return new FloatVar(r, this.precision, true);
	}

	public ceil(): FloatVar {
		const r = this.toScore('ceil');
		r['*='](this.scale);
		return new FloatVar(r, this.precision, true);
	}

	public round(): FloatVar {
		const r = this.toScore('round');
		r['*='](this.scale);
		return new FloatVar(r, this.precision, true);
	}
}

// -------------------------------------------------------------------- operator aliases
// Declared once on the prototype instead of one closure per instance.
export interface FloatVar {
	'>'(other: numberLike): ConditionClass;
	'>='(other: numberLike): ConditionClass;
	'<'(other: numberLike): ConditionClass;
	'<='(other: numberLike): ConditionClass;
	'=='(other: numberLike): ConditionClass;
	'!='(other: numberLike): NotNode;
	'+'(other: numberLike): FloatVar;
	'-'(other: numberLike): FloatVar;
	'*'(other: numberLike): FloatVar;
	'/'(other: numberLike): FloatVar;
	'%'(other: numberLike): FloatVar;
	'+='(other: numberLike): FloatVar;
	'-='(other: numberLike): FloatVar;
	'*='(other: numberLike): FloatVar;
	'/='(other: numberLike): FloatVar;
}

const proto = FloatVar.prototype;
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
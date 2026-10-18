import { _, Data, DataPointClass, DataVariable, defaultNamespace, Macro as $, Score, Variable, MCFunction, execute, random } from "sandstone";
import { FinalCommandOutput } from "sandstone/commands";
import { ConditionClass } from "sandstone/variables";

type numberLike = FloatVar | Score | number | DataPointClass;

export class FloatVar {
  private static ns = defaultNamespace.toString();
  private static storage = Data('storage', `${this.ns}:prodigelib`, 'FloatVar');
  private static id = 0;

  private out = FloatVar.storage.select('out');

  private score: Score;
  private id = FloatVar.id++;
  private precision: number;
  private scale: number;

  constructor(value: numberLike = 0, precision: number = 2, raw: boolean = false) {
    this.precision = precision;
    this.scale = 10 ** this.precision;
    if (typeof value === 'number') this.score = Variable(raw ? value : Math.round(value * this.scale));
    else if (value instanceof Score) this.score = raw ? value : this.normalize(value);
    else if (value instanceof DataPointClass) {
      const scale = raw ? 1 : this.scale;
      const v = DataVariable();
      execute.store.result(v, 'int', scale).run.data.get(value);
      this.score = Variable(v);
    }
    else this.score = raw ? value.getScore() : this.normalize(value);

  }

  public set(value: numberLike) {
    if (typeof value === 'number') this.score = Variable(Math.round(value * this.scale));
    else if (value instanceof Score) this.score = Variable(value);
    else if (value instanceof DataPointClass) {
      const v = DataVariable();
      execute.store.result(v, 'int', this.scale).run.data.get(value);
      this.score = Variable(v);
    }
    else this.score = value.score;
    return this;
  }

  public abs(): FloatVar {
    const a = new FloatVar(undefined, this.precision);

    _.if(this['<'](0), () => {
      a.set(this['*'](-1));
    }).else(() => {
      a.set(this);
    });

    return a;
  }

  private compare(other: numberLike, op: '>=' | '>' | '<=' | '<'): ConditionClass {
    return this.getScore()[op](this.normalize(other));
  }

  private normalize(other: numberLike): Score {
    if (typeof other === 'number') return new FloatVar(other, this.precision).getScore();
    else if (other instanceof Score) return other['*'](this.scale);
    else if (other instanceof DataPointClass) {
      const v = DataVariable();
      execute.store.result(v, 'int', this.scale).run.data.get(other);
      return Variable(v);
    }
    else {
      if (this.precision == other.precision) return other.getScore();
      const powDiff = this.precision - other.precision;

      if (powDiff > 0) return other.score["*"](10 ** powDiff);
      return Variable(other.score["/"](10 ** -powDiff));
    }
  }

  private affectOp(other: numberLike, op: '+=' | '-=' | '*=' | '/='): FloatVar {
    if (other instanceof FloatVar) this.score[op](this.normalize(other));
    else if (other instanceof Score) this.score[op](other["*"](this.scale));
    else if (other instanceof DataPointClass) this.score[op](this.normalize(other));
    else this.score[op](other * this.scale);

    return this;
  }

  private anonOp(other: numberLike, op: '+' | '-' | '*' | '/'): FloatVar {
    let newV: Score;

    if (other instanceof FloatVar) newV = this.score[op](this.normalize(other));
    else if (other instanceof Score) newV = this.score[op](other["*"](this.scale));
    else if (other instanceof DataPointClass) newV = this.score[op](this.normalize(other));
    else newV = this.score[op](other * this.scale);

    return new FloatVar(newV, this.precision);
  }

  public getScore(): Score {
    return this.score;
  }

  public show(): DataPointClass {

    const unit = this.score['/'](this.scale)
    const frac = this.score['-'](unit['*'](this.scale));

    const l = FloatVar.storage.select('unit').set(unit);
    const r = FloatVar.storage.select('frac').set(FloatVar.scoreAbs(frac));

    const setValue = MCFunction('__lib/floatvar/set_value', [l, r], () => {
      $.data.modify(this.out).set.value($`${l}.${r}`);
    }, { onConflict: 'ignore' });
    setValue();

    return this.out;
  }

  private static scoreAbs(s: Score) {
    _.if(s['<'](0), () => s['*'](-1));
    return s;
  }

  /**
   * Generates a random float between [0, 1]
   * @example
   * ```typescript
   * FloatVar.random(3).show() >> 0.254
   * FloatVar.random(1).show() >> 0.4
   * ```
   */
  public static random(precision: number = 2): FloatVar {
    const v = Variable();
    execute.store.result(v).run.random.value([0, 10 ** precision]);
    return new FloatVar(v, precision, true);
  }

  public greaterThan(other: numberLike) {
    return this.compare(other, '>');
  }
  public ['>'] = this.greaterThan;

  public greaterOrEqualThan(other: numberLike) {
    return this.compare(other, '>=');
  }
  public ['>='] = this.greaterOrEqualThan;

  public lessThan(other: numberLike) {
    return this.compare(other, '<');
  }
  public ['<'] = this.lessThan;

  public lessOrEqualThan(other: numberLike) {
    return this.compare(other, '<=');
  }
  public ['<='] = this.lessOrEqualThan;

  public plus(other: numberLike) {
    return this.anonOp(other, '+');
  }
  public ["+"] = this.plus;

  public minus(other: numberLike) {
    return this.anonOp(other, '-');
  }
  public ["-"] = this.minus;

  public times(other: numberLike) {
    return this.anonOp(other, '*');
  }
  public ["*"] = this.times;

  public dividedBy(other: numberLike) {
    return this.anonOp(other, '/');
  }
  public ["/"] = this.dividedBy;

  public add(other: numberLike) {
    return this.affectOp(other, '+=');
  }
  public ["+="] = this.add;

  public sub(other: numberLike) {
    return this.affectOp(other, '-=');
  }
  public ["-="] = this.sub;

  public mult(other: numberLike) {
    return this.affectOp(other, '*=');
  }
  public ["*="] = this.mult;

  public div(other: numberLike) {
    return this.affectOp(other, '/=');
  }
  public ["/="] = this.div;

  public static uninstall() {
    this.storage.remove();
  }
}
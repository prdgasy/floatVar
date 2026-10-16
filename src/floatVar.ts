import { _, Data, DataPointClass, DataVariable, defaultNamespace, Macro as $, Score, Variable, MCFunction } from "sandstone";
import { ConditionClass } from "sandstone/variables";

type numberLike = FloatVar | Score | number;

export class FloatVar {
  private static ns = defaultNamespace.toString();
  private static storage = Data('storage', `${this.ns}:prodigelib`, 'FloatVar');
  private static id = 0;

  private out = FloatVar.storage.select('out');

  private score: Score;
  private id = FloatVar.id++;
  private precision: number;
  private pow: number;

  constructor(value?: numberLike, precision: number = 2) {
    this.precision = precision;
    this.pow = 10 ** this.precision;
    if (value && typeof value === 'number') this.score = Variable(Math.round(value * this.pow));
    else if (value && value instanceof Score) this.score = Variable(value);
    else if (value && value instanceof FloatVar) this.score = value.score;
    else this.score = Variable(0);
  }

  public set(value: numberLike) {
    if (typeof value === 'number') this.score = Variable(Math.round(value * this.pow));
    else if (value instanceof Score) this.score = Variable(value);
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

  public normalize(other: numberLike): Score {
    if (typeof other === 'number') return new FloatVar(other, this.precision).getScore();
    if (other instanceof Score) return other['*'](this.pow);
    if (this.precision == other.precision) return other.getScore();
    const powDiff = this.precision - other.precision;

    if (powDiff > 0) return other.score["*"](10 ** powDiff);
    return other.score["/"](10 ** -powDiff);
  }

  private affectOp(other: numberLike, op: '+=' | '-=' | '*=' | '/='): FloatVar {
    if (other instanceof FloatVar) this.score[op](this.normalize(other));
    else if (other instanceof Score) this.score[op](other["*"](this.pow));
    else this.score[op](other * this.pow);

    return this;
  }

  private anonOp(other: numberLike, op: '+' | '-' | '*' | '/'): FloatVar {
    let arg: Score;

    if (other instanceof FloatVar) arg = this.score[op](this.normalize(other));
    else if (other instanceof Score) arg = this.score[op](other["*"](this.pow));
    else arg = this.score[op](other * this.pow);

    return new FloatVar(arg, this.precision);
  }

  public getScore(): Score {
    return this.score;
  }

  public show(): DataPointClass {

    const unit = this.score['/'](this.pow)
    const frac = this.score['-'](unit['*'](this.pow));

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
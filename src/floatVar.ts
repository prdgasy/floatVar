import { _, Data, DataPointClass, DataVariable, defaultNamespace, Macro as $, Score, Variable, MCFunction } from "sandstone";
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
  private pow: number;

  constructor(value: numberLike, precision: number = 2) {
    this.precision = precision;
    this.pow = 10 ** this.precision;
    if (typeof value === 'number') this.score = Variable(Math.round(value * this.pow));
    else if (value instanceof DataPointClass) this.score = Variable(value);
    else if (value instanceof Score) this.score = Variable(value);
    else this.score = value.score;
  }

  private compare(other: FloatVar, op: '>=' | '>' | '<=' | '<'): ConditionClass {
    return this.getScore()[op](this.normalize(other));
  }

  private normalize(other: FloatVar): Score {
    if (this.precision == other.precision) return other.getScore();
    const powDiff = this.precision - other.precision;

    if (powDiff > 0) return other.score["*"](10 ** powDiff);
    return other.score["/"](10 ** -powDiff);
  }

  private affectOp(other: numberLike, op: '+=' | '-=' | '*=' | '/=') {
    if (other instanceof FloatVar) this.score[op](this.normalize(other));
    else if (other instanceof Score) this.score[op](other["*"](this.pow));
    else if (other instanceof DataPointClass) this.score[op](Variable(other)["*"](this.pow));
    else this.score[op](other * this.pow);

    return this;
  }

  private anonOp(other: numberLike, op: '+' | '-' | '*' | '/') {
    let arg: Score;

    if (other instanceof FloatVar) arg = this.score[op](this.normalize(other));
    else if (other instanceof Score) arg = this.score[op](other["*"](this.pow));
    else if (other instanceof DataPointClass) arg = this.score[op](Variable(other)["*"](this.pow));
    else arg = this.score[op](other * this.pow);

    return new FloatVar(arg, this.precision);
  }

  public getScore(): Score {
    return this.score;
  }

  public show(): DataPointClass {
    const point = DataVariable('.');

    const lScore = this.score['/'](this.pow)
    const rScore = this.score['-'](lScore['*'](this.pow));

    const left = DataVariable(lScore);
    const right = DataVariable(rScore);

    const setValue = MCFunction('__lib/floatvar/set_value', [left, point, right], () => {
      $.data.modify(this.out).set.value($`${left}${point}${right}`);
    }, { onConflict: 'ignore' });

    setValue();

    return this.out;
  }

  public greaterThan(other: FloatVar) {
    return this.compare(other, '>');
  }
  public ['>'] = this.greaterThan;

  public greaterOrEqualThan(other: FloatVar) {
    return this.compare(other, '>=');
  }
  public ['>='] = this.greaterOrEqualThan;

  public lessThan(other: FloatVar) {
    return this.compare(other, '<');
  }
  public ['<'] = this.lessThan;

  public lessOrEqualThan(other: FloatVar) {
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
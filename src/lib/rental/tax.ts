function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function splitTaxInclusiveAmount(amountTotal: number, taxRate: number) {
  const total = roundMoney(amountTotal);
  const rate = Math.max(0, Number(taxRate));
  const amountUntaxed = rate > 0
    ? roundMoney(total / (1 + rate / 100))
    : total;

  return {
    amountUntaxed,
    amountTax: roundMoney(total - amountUntaxed),
    amountTotal: total,
  };
}

/** Apply VAT on top of an untaxed amount (Ejar-style annual pricing). */
export function applyTaxExclusiveAmount(amountUntaxedInput: number, taxRate: number) {
  const amountUntaxed = roundMoney(amountUntaxedInput);
  const rate = Math.max(0, Number(taxRate));
  const amountTax = rate > 0 ? roundMoney(amountUntaxed * (rate / 100)) : 0;

  return {
    amountUntaxed,
    amountTax,
    amountTotal: roundMoney(amountUntaxed + amountTax),
  };
}

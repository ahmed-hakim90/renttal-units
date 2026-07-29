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

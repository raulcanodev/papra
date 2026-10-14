// Tools talk in human units (euros, percentages, 2.5 hours) because that is what a model, and the person behind it,
// reason with. The API stores integers: minor units (cents), basis points and thousandths. These convert at the edge.

export function amountToMinor(amount: number): number {
  return Math.round(amount * 100);
}

export function percentToBps(percent: number): number {
  return Math.round(percent * 100);
}

export function quantityToMillis(quantity: number): number {
  return Math.round(quantity * 1_000);
}

export function minorToAmount(minor: number): number {
  return minor / 100;
}

export function bpsToPercent(bps: number): number {
  return bps / 100;
}

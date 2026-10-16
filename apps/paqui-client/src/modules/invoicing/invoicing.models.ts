// What the customer actually pays the issuer: the total minus the IRPF withholding it pays to the tax agency instead
export function getInvoicePayableMinor({ totalMinor, withholdingMinor }: { totalMinor: number; withholdingMinor?: number }) {
  return totalMinor - (withholdingMinor ?? 0);
}

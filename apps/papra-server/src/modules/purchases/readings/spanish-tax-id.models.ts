const DNI_LETTERS = 'TRWAGMYFPDXBNJZSQVHLCKE';
const CIF_CONTROL_LETTERS = 'JABCDEFGHI';

// Spanish tax ids carry a control character: a misread digit on a photo almost always breaks it.
// Returns null when the id is not Spanish-shaped (foreign VAT numbers are not checked here).
export function isValidSpanishTaxId({ taxId }: { taxId: string }): boolean | null {
  const value = taxId.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^ES(?=[A-Z0-9]{9}$)/, '');

  // DNI: 8 digits and a letter
  if (/^\d{8}[A-Z]$/.test(value)) {
    return DNI_LETTERS[Number(value.slice(0, 8)) % 23] === value[8];
  }

  // NIE: X, Y or Z, 7 digits and a letter
  if (/^[XYZ]\d{7}[A-Z]$/.test(value)) {
    const number = `${'XYZ'.indexOf(value[0]!)}${value.slice(1, 8)}`;
    return DNI_LETTERS[Number(number) % 23] === value[8];
  }

  // CIF: an organization letter, 7 digits and a control digit or letter
  if (/^[A-HJNP-SUVW]\d{7}[0-9A-J]$/.test(value)) {
    const digits = value.slice(1, 8).split('').map(Number);
    const sum = digits.reduce((total, digit, index) => {
      if (index % 2 === 1) {
        return total + digit;
      }
      const doubled = digit * 2;
      return total + Math.floor(doubled / 10) + (doubled % 10);
    }, 0);
    const control = (10 - (sum % 10)) % 10;
    const expected = value[8]!;

    // Some organization types use a letter, others a digit, a few accept both
    if ('PQRSNW'.includes(value[0]!)) {
      return expected === CIF_CONTROL_LETTERS[control];
    }
    if ('ABEH'.includes(value[0]!)) {
      return expected === String(control);
    }
    return expected === String(control) || expected === CIF_CONTROL_LETTERS[control];
  }

  return null;
}

const MONEY_DECIMAL_DIGITS = 2;

/**
 * Keeps money inputs easy to scan while the user types.
 * Commas are always thousands separators and the dot is the decimal separator.
 */
export function formatMoneyInput(value: string) {
  const sanitized = value.replace(/,/g, "").replace(/[^\d.]/g, "");
  const decimalIndex = sanitized.indexOf(".");
  const hasDecimalSeparator = decimalIndex >= 0;

  let integerPart = hasDecimalSeparator
    ? sanitized.slice(0, decimalIndex)
    : sanitized;
  const decimalPart = hasDecimalSeparator
    ? sanitized
        .slice(decimalIndex + 1)
        .replace(/\./g, "")
        .slice(0, MONEY_DECIMAL_DIGITS)
    : "";

  if (!integerPart && !hasDecimalSeparator) return "";

  integerPart = integerPart.replace(/^0+(?=\d)/, "") || "0";
  const groupedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

  return hasDecimalSeparator
    ? `${groupedInteger}.${decimalPart}`
    : groupedInteger;
}

export function parseMoneyInput(value: string) {
  const normalized = value.replace(/,/g, "").trim();

  if (!/^\d+(?:\.\d{0,2})?$/.test(normalized)) return null;

  const parsedValue = Number(normalized);
  return Number.isFinite(parsedValue) ? parsedValue : null;
}

export function formatDateInput(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  const day = digits.slice(0, 2);
  const month = digits.slice(2, 4);
  const year = digits.slice(4, 8);

  if (digits.length <= 2) return day;
  if (digits.length <= 4) return `${day}/${month}`;
  return `${day}/${month}/${year}`;
}

export function parseDateInputToIso(value: string) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (!match) return null;

  const [, day, month, year] = match;
  const parsedDate = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    12,
    0,
    0
  );

  const isValidDate =
    parsedDate.getFullYear() === Number(year) &&
    parsedDate.getMonth() === Number(month) - 1 &&
    parsedDate.getDate() === Number(day);

  return isValidDate ? `${year}-${month}-${day}` : null;
}

export function formatIsoDateForInput(value?: string | null) {
  if (!value) return "";

  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return "";

  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
}

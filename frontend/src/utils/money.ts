const formatInr = (amount: number): string =>
  new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);

export const formatPaiseAsInr = (amountPaise: number): string =>
  formatInr(amountPaise / 100);

export const formatRupeesAsInr = (amountRupees: number): string =>
  formatInr(amountRupees);

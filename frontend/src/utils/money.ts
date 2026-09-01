const inrFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
});

export const formatPaiseAsInr = (amountPaise: number): string =>
  inrFormatter.format(amountPaise / 100);

export const formatRupeesAsInr = (amountRupees: number): string =>
  inrFormatter.format(amountRupees);

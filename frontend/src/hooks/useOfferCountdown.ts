import { useEffect, useState } from "react";

export const useOfferCountdown = (expiresAt?: string) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!expiresAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [expiresAt]);
  const expiry = expiresAt ? new Date(expiresAt).getTime() : Infinity;
  const seconds = Math.max(0, Math.ceil((expiry - now) / 1000));
  return {
    expired: seconds <= 0 || Number.isNaN(seconds),
    nearExpiry: seconds > 0 && seconds <= 120,
    label: Number.isFinite(seconds)
      ? `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`
      : "Unavailable",
  };
};

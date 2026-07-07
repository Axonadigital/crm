export function percentDelta(
  current?: number | null,
  previous?: number | null,
): number | null {
  if (
    typeof current !== "number" ||
    typeof previous !== "number" ||
    previous === 0
  ) {
    return null;
  }
  return ((current - previous) / previous) * 100;
}

export function absoluteDelta(
  current?: number | null,
  previous?: number | null,
): number | null {
  if (typeof current !== "number" || typeof previous !== "number") return null;
  return current - previous;
}

export function trendTextWithAbsolute(
  delta: number | null,
  absolute: number | null,
  noun: string,
): string {
  if (delta == null || absolute == null) {
    return "Ingen jämförbar föregående period";
  }
  if (Math.abs(absolute) < 0.5) return "Oförändrat mot föregående period";
  const roundedAbsolute = Math.abs(Math.round(absolute)).toLocaleString(
    "sv-SE",
  );
  return `${absolute > 0 ? "Förbättring" : "Försämring"} ${roundedAbsolute} ${noun} (${absolute > 0 ? "+" : "-"}${Math.abs(Math.round(delta))} %)`;
}

export function percentagePointTrendText(delta: number | null): string {
  if (delta == null) return "Ingen jämförbar föregående period";
  if (Math.abs(delta) < 0.05) return "Oförändrat mot föregående period";
  return `${delta > 0 ? "Förbättring" : "Försämring"} ${Math.abs(delta).toLocaleString("sv-SE", { maximumFractionDigits: 1 })} procentenheter`;
}

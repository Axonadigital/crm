/**
 * När på dygnet får utkorgen skicka?
 *
 * Bakgrund (2026-09-11): sekvensmotorn skickade så fort ett steg var
 * förfallet. Ett mejl som blev förfallet 03:14 en söndag gick 03:14 en
 * söndag. Det är inte bara illa mottaget — tidpunkten är en av de tydligaste
 * signalerna på att avsändaren är en maskin, och det påverkar både hur
 * mottagaren läser mejlet och hur filtren bedömer det.
 *
 * Dygnstaket räknades dessutom från UTC-midnatt, alltså 02:00 svensk
 * sommartid. Ett utskick 01:30 hamnade på gårdagens kvot.
 *
 * Allt här är RENT och tidszonsäkert via Intl — ingen egen sommartidsmatte.
 * Europe/Stockholm är UTC+1 på vintern och UTC+2 på sommaren, och den
 * skillnaden går inte att hårdkoda.
 */

export interface SendWindow {
  /** Veckodagar som tillåts. 1 = måndag … 7 = söndag (ISO). */
  days: number[];
  /** Första tillåtna timmen, lokal tid. 8 = mejl får gå från 08:00. */
  startHour: number;
  /** Sista tillåtna timmen, EXKLUSIV. 17 = sista mejlet går 16:59. */
  endHour: number;
  timeZone: string;
}

/** Vardagar 08–17 svensk tid. Axona jobbar 08–18, marginalen är medveten. */
export const DEFAULT_SEND_WINDOW: SendWindow = {
  days: [1, 2, 3, 4, 5],
  startHour: 8,
  endHour: 17,
  timeZone: "Europe/Stockholm",
};

const WEEKDAY_TO_ISO: Record<string, number> = {
  Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7,
};

interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  /** ISO-veckodag, 1 = måndag. */
  weekday: number;
}

/**
 * Bryter ned ett ögonblick till lokal tid i en tidszon. Intl sköter
 * sommartiden, vilket är hela poängen — 2026-03-29 02:00 finns inte i
 * Stockholm, och 2026-10-25 02:00 finns två gånger.
 */
export function localParts(date: Date, timeZone: string): LocalParts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hour12: false,
  });
  const parts: Record<string, string> = {};
  for (const p of fmt.formatToParts(date)) parts[p.type] = p.value;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    // "24" förekommer i vissa körtider för midnatt.
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    weekday: WEEKDAY_TO_ISO[parts.weekday] ?? 1,
  };
}

/** Får vi skicka just nu? */
export function withinSendWindow(
  date: Date,
  window: SendWindow = DEFAULT_SEND_WINDOW,
): boolean {
  const { weekday, hour } = localParts(date, window.timeZone);
  if (!window.days.includes(weekday)) return false;
  return hour >= window.startHour && hour < window.endHour;
}

/** Läsbar orsak till att det inte går, för loggen. */
export function outsideWindowReason(
  date: Date,
  window: SendWindow = DEFAULT_SEND_WINDOW,
): string {
  const { weekday, hour, minute } = localParts(date, window.timeZone);
  const klocka = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  if (!window.days.includes(weekday)) {
    const namn = ["", "måndag", "tisdag", "onsdag", "torsdag", "fredag", "lördag", "söndag"];
    return `${namn[weekday]} är utanför sändningsdagarna`;
  }
  return `${klocka} är utanför fönstret ${String(window.startHour).padStart(2, "0")}–${String(window.endHour).padStart(2, "0")}`;
}

/**
 * Midnatt lokal tid, som ISO-tidpunkt. Dygnstaket ska räknas från svensk
 * midnatt, inte UTC-midnatt — annars nollställs kvoten 02:00 på sommaren.
 */
export function startOfLocalDay(date: Date, timeZone: string): string {
  const { year, month, day } = localParts(date, timeZone);
  // Gissa UTC-midnatt och justera med den faktiska förskjutningen.
  const guess = Date.UTC(year, month - 1, day, 0, 0, 0);
  const offsetMs = offsetAt(new Date(guess), timeZone);
  return new Date(guess - offsetMs).toISOString();
}

/** Tidszonens förskjutning mot UTC i millisekunder vid en given tidpunkt. */
function offsetAt(date: Date, timeZone: string): number {
  const p = localParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  // Sekunder spelar ingen roll för hela timmars förskjutning.
  return asUtc - Math.floor(date.getTime() / 60_000) * 60_000;
}

/** Läser fönstret ur mc_settings. Trasig eller saknad config → standard. */
export function parseSendWindow(raw: unknown): SendWindow {
  if (!raw || typeof raw !== "object") return DEFAULT_SEND_WINDOW;
  const cfg = raw as Record<string, unknown>;
  const days = Array.isArray(cfg.days)
    ? cfg.days.filter((d): d is number => typeof d === "number" && d >= 1 && d <= 7)
    : null;
  const startHour = typeof cfg.start_hour === "number" ? cfg.start_hour : null;
  const endHour = typeof cfg.end_hour === "number" ? cfg.end_hour : null;
  const timeZone = typeof cfg.timezone === "string" ? cfg.timezone : null;

  const window: SendWindow = {
    days: days && days.length > 0 ? days : DEFAULT_SEND_WINDOW.days,
    startHour:
      startHour !== null && startHour >= 0 && startHour <= 23
        ? startHour
        : DEFAULT_SEND_WINDOW.startHour,
    endHour:
      endHour !== null && endHour >= 1 && endHour <= 24
        ? endHour
        : DEFAULT_SEND_WINDOW.endHour,
    timeZone: timeZone || DEFAULT_SEND_WINDOW.timeZone,
  };
  // Ett bakvänt fönster hade stängt av utkorgen helt utan att någon förstod
  // varför. Falla tillbaka hellre än att tiga.
  if (window.endHour <= window.startHour) {
    window.startHour = DEFAULT_SEND_WINDOW.startHour;
    window.endHour = DEFAULT_SEND_WINDOW.endHour;
  }
  return window;
}

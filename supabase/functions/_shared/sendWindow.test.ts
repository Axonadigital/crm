import { describe, expect, it } from "vitest";
import {
  DEFAULT_SEND_WINDOW,
  localParts,
  outsideWindowReason,
  parseSendWindow,
  startOfLocalDay,
  withinSendWindow,
} from "./sendWindow";

const SE = "Europe/Stockholm";

describe("localParts", () => {
  // Sommartid: Stockholm är UTC+2.
  it("räknar om till svensk sommartid", () => {
    const p = localParts(new Date("2026-07-15T10:00:00Z"), SE);
    expect(p.hour).toBe(12);
    expect(p.weekday).toBe(3); // onsdag
  });

  // Vintertid: UTC+1. Skillnaden går inte att hårdkoda.
  it("räknar om till svensk vintertid", () => {
    const p = localParts(new Date("2026-01-15T10:00:00Z"), SE);
    expect(p.hour).toBe(11);
  });

  it("hanterar midnatt utan att ge timme 24", () => {
    const p = localParts(new Date("2026-07-14T22:00:00Z"), SE);
    expect(p.hour).toBe(0);
    expect(p.day).toBe(15);
  });
});

describe("withinSendWindow", () => {
  it("släpper igenom mitt på en vardag", () => {
    // Onsdag 2026-07-15, 12:00 svensk tid.
    expect(withinSendWindow(new Date("2026-07-15T10:00:00Z"))).toBe(true);
  });

  // Det här är hela poängen med ändringen.
  it("stoppar mitt i natten", () => {
    // Söndag 03:14 svensk tid.
    expect(withinSendWindow(new Date("2026-07-12T01:14:00Z"))).toBe(false);
    // Onsdag 03:00 svensk tid.
    expect(withinSendWindow(new Date("2026-07-15T01:00:00Z"))).toBe(false);
  });

  it("stoppar på helgen även mitt på dagen", () => {
    // Lördag 12:00 svensk tid.
    expect(withinSendWindow(new Date("2026-07-11T10:00:00Z"))).toBe(false);
    // Söndag 12:00 svensk tid.
    expect(withinSendWindow(new Date("2026-07-12T10:00:00Z"))).toBe(false);
  });

  it("öppnar 08:00 och stänger 17:00 svensk tid", () => {
    // 07:59 → nej, 08:00 → ja.
    expect(withinSendWindow(new Date("2026-07-15T05:59:00Z"))).toBe(false);
    expect(withinSendWindow(new Date("2026-07-15T06:00:00Z"))).toBe(true);
    // 16:59 → ja, 17:00 → nej.
    expect(withinSendWindow(new Date("2026-07-15T14:59:00Z"))).toBe(true);
    expect(withinSendWindow(new Date("2026-07-15T15:00:00Z"))).toBe(false);
  });

  // Samma UTC-timme ger olika svar sommar och vinter. Utan tidszonshantering
  // hade fönstret glidit en timme två gånger om året.
  it("följer med i sommartidsomställningen", () => {
    // 06:30 UTC = 08:30 sommartid (inne) men 07:30 vintertid (ute).
    expect(withinSendWindow(new Date("2026-07-15T06:30:00Z"))).toBe(true);
    expect(withinSendWindow(new Date("2026-01-14T06:30:00Z"))).toBe(false);
  });

  it("respekterar ett eget fönster", () => {
    const kvall = { days: [1, 2, 3, 4, 5, 6, 7], startHour: 18, endHour: 22, timeZone: SE };
    expect(withinSendWindow(new Date("2026-07-12T17:00:00Z"), kvall)).toBe(true); // sö 19:00
    expect(withinSendWindow(new Date("2026-07-15T10:00:00Z"), kvall)).toBe(false); // on 12:00
  });
});

describe("outsideWindowReason", () => {
  it("säger vilken dag som stoppade", () => {
    expect(outsideWindowReason(new Date("2026-07-11T10:00:00Z"))).toContain("lördag");
  });

  it("säger vilken tid som stoppade", () => {
    const skal = outsideWindowReason(new Date("2026-07-15T01:00:00Z"));
    expect(skal).toContain("03:00");
    expect(skal).toContain("08–17");
  });
});

describe("startOfLocalDay", () => {
  // Dygnstaket räknades från UTC-midnatt = 02:00 svensk sommartid.
  it("ger svensk midnatt på sommaren, inte UTC-midnatt", () => {
    const start = startOfLocalDay(new Date("2026-07-15T10:00:00Z"), SE);
    expect(start).toBe("2026-07-14T22:00:00.000Z");
  });

  it("ger svensk midnatt på vintern", () => {
    const start = startOfLocalDay(new Date("2026-01-15T10:00:00Z"), SE);
    expect(start).toBe("2026-01-14T23:00:00.000Z");
  });

  // Ett utskick 01:30 svensk tid hamnade tidigare på gårdagens kvot.
  it("lägger ett utskick 01:30 på RÄTT dygn", () => {
    const natt = new Date("2026-07-14T23:30:00Z"); // 01:30 svensk tid den 15:e
    expect(localParts(natt, SE).day).toBe(15);
    expect(startOfLocalDay(natt, SE)).toBe("2026-07-14T22:00:00.000Z");
  });
});

describe("parseSendWindow", () => {
  it("läser en komplett config", () => {
    const w = parseSendWindow({
      days: [1, 2, 3], start_hour: 9, end_hour: 16, timezone: SE,
    });
    expect(w).toEqual({ days: [1, 2, 3], startHour: 9, endHour: 16, timeZone: SE });
  });

  it("faller tillbaka på standard vid saknad eller trasig config", () => {
    expect(parseSendWindow(null)).toEqual(DEFAULT_SEND_WINDOW);
    expect(parseSendWindow("nonsens")).toEqual(DEFAULT_SEND_WINDOW);
    expect(parseSendWindow({})).toEqual(DEFAULT_SEND_WINDOW);
    expect(parseSendWindow({ days: [] })).toEqual(DEFAULT_SEND_WINDOW);
  });

  // Ett bakvänt fönster hade stängt av utkorgen helt, tyst.
  it("rättar ett bakvänt fönster i stället för att tiga", () => {
    const w = parseSendWindow({ start_hour: 18, end_hour: 8 });
    expect(w.startHour).toBe(8);
    expect(w.endHour).toBe(17);
  });

  it("ignorerar orimliga timmar", () => {
    const w = parseSendWindow({ start_hour: -5, end_hour: 99 });
    expect(w.startHour).toBe(DEFAULT_SEND_WINDOW.startHour);
    expect(w.endHour).toBe(DEFAULT_SEND_WINDOW.endHour);
  });
});

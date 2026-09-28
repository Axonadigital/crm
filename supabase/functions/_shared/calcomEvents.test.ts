import { describe, expect, it } from "vitest";
import {
  bookingStopsOutreach,
  getEventType,
  isCancellation,
  mapStatus,
} from "./calcomEvents";

describe("getEventType", () => {
  it("läser triggerEvent och gemenar", () => {
    expect(getEventType({ triggerEvent: "BOOKING_CREATED" })).toBe(
      "booking_created",
    );
  });

  it("faller tillbaka på type", () => {
    expect(getEventType({ type: "BOOKING_CANCELLED" })).toBe(
      "booking_cancelled",
    );
  });

  it("ger tom sträng för skräp i stället för att kasta", () => {
    expect(getEventType(null)).toBe("");
    expect(getEventType({})).toBe("");
  });
});

describe("isCancellation", () => {
  it("räknar avbokning och avvisning som samma sak", () => {
    expect(isCancellation("booking_cancelled")).toBe(true);
    expect(isCancellation("booking_rejected")).toBe(true);
  });

  it("en vanlig bokning är ingen avbokning", () => {
    expect(isCancellation("booking_created")).toBe(false);
  });
});

describe("mapStatus", () => {
  it("avbokning blir cancelled, allt annat scheduled", () => {
    expect(mapStatus("booking_cancelled")).toBe("cancelled");
    expect(mapStatus("booking_rescheduled")).toBe("scheduled");
  });
});

describe("bookingStopsOutreach", () => {
  it("stoppar utkorgen på riktiga bokningar", () => {
    for (const e of [
      "booking_created",
      "booking_rescheduled",
      "booking_requested",
      "booking_paid",
      "meeting_started",
      "meeting_ended",
    ]) {
      expect(bookingStopsOutreach(e), e).toBe(true);
    }
  });

  it("stoppar INTE på avbokning — och återupptar inte heller", () => {
    expect(bookingStopsOutreach("booking_cancelled")).toBe(false);
    expect(bookingStopsOutreach("booking_rejected")).toBe(false);
  });

  it("ignorerar händelser som inte är ett möte", () => {
    expect(bookingStopsOutreach("booking_payment_initiated")).toBe(false);
    expect(bookingStopsOutreach("recording_ready")).toBe(false);
    expect(bookingStopsOutreach("form_submitted")).toBe(false);
    expect(bookingStopsOutreach("")).toBe(false);
  });
});

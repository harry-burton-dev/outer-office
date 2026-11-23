// @vitest-environment node
import { describe, expect, test } from "vitest";
import { addDays, dateIn, formatDay, formatTime, instantIn, relativeDay, todayIn, weekdayOf } from "./dates";

const LONDON = "Europe/London";

describe("formatDay and formatTime", () => {
  test("show a summer instant in British Summer Time", () => {
    expect(formatDay("2026-11-24T14:00:00Z", LONDON)).toBe("Tue 24 Nov");
    expect(formatTime("2026-07-01T13:00:00Z", LONDON)).toBe("14:00");
  });

  test("a late UTC evening before the clocks go back is already the next day in London", () => {
    expect(formatDay("2026-10-24T23:30:00Z", LONDON)).toBe("Sun 25 Oct");
    expect(formatTime("2026-10-24T23:30:00Z", LONDON)).toBe("00:30");
  });

  test("the repeated hour on 25 October shows 01:30 twice, an hour apart in UTC", () => {
    expect(formatTime("2026-10-25T00:30:00Z", LONDON)).toBe("01:30");
    expect(formatTime("2026-10-25T01:30:00Z", LONDON)).toBe("01:30");
  });

  test("after the change London and UTC agree", () => {
    expect(formatTime("2026-10-26T09:00:00Z", LONDON)).toBe("09:00");
    expect(formatDay("2026-10-25T23:30:00Z", LONDON)).toBe("Sun 25 Oct");
  });

  test("midnight shows as 00:00, not 24:00", () => {
    expect(formatTime("2026-11-24T00:00:00Z", LONDON)).toBe("00:00");
  });
});

describe("todayIn and dateIn", () => {
  test("give the local date either side of the clock change", () => {
    expect(todayIn(LONDON, "2026-10-24T22:59:00Z")).toBe("2026-10-24");
    expect(todayIn(LONDON, "2026-10-24T23:00:00Z")).toBe("2026-10-25");
    expect(dateIn("2026-10-25T23:59:00Z", LONDON)).toBe("2026-10-25");
    expect(dateIn("2026-10-26T00:00:00Z", LONDON)).toBe("2026-10-26");
  });

  test("works in another zone", () => {
    expect(todayIn("America/New_York", "2026-11-24T03:00:00Z")).toBe("2026-11-23");
  });
});

describe("relativeDay", () => {
  const now = "2026-10-25T10:00:00Z";

  test("compares a plain date with today in the zone", () => {
    expect(relativeDay("2026-10-24", now, LONDON)).toBe("past");
    expect(relativeDay("2026-10-25", now, LONDON)).toBe("today");
    expect(relativeDay("2026-10-26", now, LONDON)).toBe("future");
  });

  test("compares an instant by its local date", () => {
    expect(relativeDay("2026-10-24T23:30:00Z", now, LONDON)).toBe("today");
    expect(relativeDay("2026-10-24T22:30:00Z", now, LONDON)).toBe("past");
  });

  test("returns undefined for something that is not a date", () => {
    expect(relativeDay("soon", now, LONDON)).toBeUndefined();
    expect(relativeDay("", now, LONDON)).toBeUndefined();
  });
});

describe("addDays and weekdayOf", () => {
  test("step over a month end and the clock change without drifting", () => {
    expect(addDays("2026-10-24", 1)).toBe("2026-10-25");
    expect(addDays("2026-10-25", 1)).toBe("2026-10-26");
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  test("name the weekday of a date, Sunday as 0", () => {
    expect(weekdayOf("2026-10-25")).toBe(0);
    expect(weekdayOf("2026-11-24")).toBe(2);
  });
});

describe("instantIn", () => {
  test("reads a wall-clock time in the zone, either side of the clocks changing", () => {
    expect(instantIn("2026-11-24", "14:00", "Europe/London")).toBe("2026-11-24T14:00:00.000Z");
    expect(instantIn("2026-07-01", "09:30", "Europe/London")).toBe("2026-07-01T08:30:00.000Z");
    expect(instantIn("2026-07-01", "09:30", "America/New_York")).toBe("2026-07-01T13:30:00.000Z");
  });
});

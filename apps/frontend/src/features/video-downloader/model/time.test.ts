import { describe, expect, it } from "vitest";
import { formatDuration, parseTimeToSeconds } from "./time";

describe("time utils", () => {
  it("parses mm:ss", () => {
    expect(parseTimeToSeconds("01:50")).toBe(110);
  });

  it("parses hh:mm:ss", () => {
    expect(parseTimeToSeconds("01:00:10")).toBe(3610);
  });

  it("formats duration", () => {
    expect(formatDuration(110)).toBe("01:50");
  });
});


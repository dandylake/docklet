import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  checkRateLimit,
  getClientIp,
  RateLimitError,
  __resetRateLimits,
} from "./rate-limit";

describe("checkRateLimit", () => {
  beforeEach(() => {
    __resetRateLimits();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-01T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("when called up to the max within the window — does not throw", () => {
    for (let i = 0; i < 5; i++) {
      expect(() => checkRateLimit("k", 5, 60_000)).not.toThrow();
    }
  });

  it("when called max+1 times within the window — throws RateLimitError", () => {
    for (let i = 0; i < 5; i++) checkRateLimit("k", 5, 60_000);
    expect(() => checkRateLimit("k", 5, 60_000)).toThrow(RateLimitError);
  });

  it("when the window advances past the limit — allows requests again", () => {
    for (let i = 0; i < 5; i++) checkRateLimit("k", 5, 60_000);
    vi.advanceTimersByTime(60_001);
    expect(() => checkRateLimit("k", 5, 60_000)).not.toThrow();
  });

  it("when two different keys are used — tracks them independently", () => {
    for (let i = 0; i < 5; i++) checkRateLimit("a", 5, 60_000);
    expect(() => checkRateLimit("b", 5, 60_000)).not.toThrow();
    expect(() => checkRateLimit("a", 5, 60_000)).toThrow(RateLimitError);
  });
});

describe("getClientIp", () => {
  function makeReq(headers: Record<string, string>): Request {
    return new Request("http://x/", { headers });
  }

  it("when x-forwarded-for is present — returns the first entry", () => {
    expect(getClientIp(makeReq({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" }))).toBe("1.2.3.4");
  });

  it("when x-forwarded-for has surrounding whitespace — trims the returned address", () => {
    expect(getClientIp(makeReq({ "x-forwarded-for": "  1.2.3.4  , 5.6.7.8" }))).toBe("1.2.3.4");
  });

  it("when only x-real-ip is present — falls back to x-real-ip", () => {
    expect(getClientIp(makeReq({ "x-real-ip": "9.9.9.9" }))).toBe("9.9.9.9");
  });

  it("when x-forwarded-for is empty — falls back to x-real-ip", () => {
    expect(
      getClientIp(makeReq({ "x-forwarded-for": "", "x-real-ip": "9.9.9.9" }))
    ).toBe("9.9.9.9");
  });

  it("when no IP header is present — returns 'unknown'", () => {
    expect(getClientIp(makeReq({}))).toBe("unknown");
  });
});

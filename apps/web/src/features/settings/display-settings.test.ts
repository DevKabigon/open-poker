import { describe, expect, it } from "vitest";
import {
  formatChipAmountForDisplay,
  formatChipInputValue,
  parseChipInputAsCents,
} from "./display-settings";

describe("display settings", () => {
  it("formats chip values as dollars by default", () => {
    expect(formatChipAmountForDisplay(12_500, "usd", 200)).toBe("$125.00");
  });

  it("formats chip values as big blinds when the table blind is available", () => {
    expect(formatChipAmountForDisplay(12_500, "bb", 200)).toBe("62.5 BB");
    expect(formatChipAmountForDisplay(200, "bb", 200)).toBe("1 BB");
    expect(formatChipAmountForDisplay(100, "bb", 200)).toBe("0.5 BB");
  });

  it("falls back to dollars when big blind context is missing", () => {
    expect(formatChipAmountForDisplay(12_500, "bb", null)).toBe("$125.00");
  });

  it("parses wager input in the selected display unit", () => {
    expect(parseChipInputAsCents("12.5", "usd", 200)).toBe(1250);
    expect(parseChipInputAsCents("12.5", "bb", 200)).toBe(2500);
    expect(parseChipInputAsCents("0", "bb", 200)).toBeNull();
  });

  it("formats wager input in the selected display unit", () => {
    expect(formatChipInputValue(1250, "usd", 200)).toBe("12.50");
    expect(formatChipInputValue(2400, "bb", 200)).toBe("12");
  });
});

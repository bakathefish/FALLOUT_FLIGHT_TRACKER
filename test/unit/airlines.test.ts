import { describe, it, expect } from "vitest";
import { iataToIcao, hasAirline } from "@/lib/airlines";

describe("airline map", () => {
  it("maps the carriers the spec calls out", () => {
    expect(iataToIcao("CX")).toBe("CPA");
    expect(iataToIcao("6E")).toBe("IGO");
    expect(iataToIcao("UO")).toBe("HKE");
    expect(iataToIcao("AI")).toBe("AIC");
    expect(iataToIcao("MU")).toBe("CES");
  });

  it("is case-insensitive", () => {
    expect(iataToIcao("cx")).toBe("CPA");
  });

  it("returns undefined for unknown codes", () => {
    expect(iataToIcao("ZZ")).toBeUndefined();
    expect(hasAirline("ZZ")).toBe(false);
    expect(hasAirline("CX")).toBe(true);
  });
});

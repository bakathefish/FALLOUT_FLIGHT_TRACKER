import { describe, it, expect } from "vitest";
import {
  createBodySchema,
  editBodySchema,
  deleteBodySchema,
} from "@/lib/schema";

const valid = {
  passcode: "secret",
  name: "Fish",
  flightNumber: "cx 216",
  destination: "HKG",
};

describe("createBodySchema", () => {
  it("accepts valid input and normalizes the flight number", () => {
    const r = createBodySchema.safeParse(valid);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.flightNumber).toBe("CX216");
  });

  it("uppercases origin iata and drops empty optionals", () => {
    const r = createBodySchema.safeParse({
      ...valid,
      originIata: "del",
      originCity: "",
      slackHandle: "",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.originIata).toBe("DEL");
      expect(r.data.originCity).toBeUndefined();
      expect(r.data.slackHandle).toBeUndefined();
    }
  });

  it("rejects a bad flight number", () => {
    expect(
      createBodySchema.safeParse({ ...valid, flightNumber: "C" }).success,
    ).toBe(false);
    expect(
      createBodySchema.safeParse({ ...valid, flightNumber: "WAYTOOLONG9" })
        .success,
    ).toBe(false);
  });

  it("rejects a bad destination", () => {
    expect(
      createBodySchema.safeParse({ ...valid, destination: "LHR" }).success,
    ).toBe(false);
  });

  it("rejects an oversized name", () => {
    expect(
      createBodySchema.safeParse({ ...valid, name: "x".repeat(61) }).success,
    ).toBe(false);
  });

  it("rejects a malformed date", () => {
    expect(
      createBodySchema.safeParse({ ...valid, arrivalDate: "2026-13-40" })
        .success,
    ).toBe(false);
    expect(
      createBodySchema.safeParse({ ...valid, arrivalDate: "07/01/2026" })
        .success,
    ).toBe(false);
  });

  it("requires the passcode", () => {
    const { passcode: _omit, ...noPass } = valid;
    expect(createBodySchema.safeParse(noPass).success).toBe(false);
  });
});

describe("editBodySchema", () => {
  it("accepts a partial update with an edit token", () => {
    const r = editBodySchema.safeParse({
      name: "Fishy",
      editToken: "11111111-1111-1111-1111-111111111111",
    });
    expect(r.success).toBe(true);
  });

  it("accepts the admin passcode path", () => {
    expect(
      editBodySchema.safeParse({ name: "Fishy", passcode: "admin" }).success,
    ).toBe(true);
  });

  it("rejects when no auth is supplied", () => {
    expect(editBodySchema.safeParse({ name: "Fishy" }).success).toBe(false);
  });
});

describe("deleteBodySchema", () => {
  it("needs an edit token or passcode", () => {
    expect(deleteBodySchema.safeParse({}).success).toBe(false);
    expect(deleteBodySchema.safeParse({ passcode: "admin" }).success).toBe(
      true,
    );
  });
});

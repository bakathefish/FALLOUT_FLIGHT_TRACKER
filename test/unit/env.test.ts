import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// importing here at the top is itself part of the test: a lazy module must load
// without parsing env, so this import must never throw whatever the env holds.
import { getServerEnv, __resetEnvCache, type ServerEnv } from "@/lib/env";

// a fully valid set of server secrets we can stub per test.
const VALID_ENV = {
  DATABASE_URL: "postgresql://user:pass@db.example.com:6543/postgres",
  DIRECT_URL: "postgresql://user:pass@db.example.com:5432/postgres",
  WRITE_PASSCODE: "let-me-in",
  ADMIN_PASSCODE: "admin-please",
} as const;

// snapshot the real process.env once so every test can be restored to it.
const ORIGINAL_ENV = { ...process.env };

function resetEnv(): void {
  for (const key of Object.keys(process.env)) {
    delete process.env[key];
  }
  Object.assign(process.env, ORIGINAL_ENV);
}

describe("env", () => {
  beforeEach(() => {
    resetEnv();
    __resetEnvCache();
  });

  afterEach(() => {
    resetEnv();
    __resetEnvCache();
    vi.resetModules();
  });

  it("does not parse env at import time, even when the env is broken", async () => {
    // wipe required vars, then import a fresh copy of the module. if parsing
    // happened at import time this would reject; laziness means it resolves.
    delete process.env.DATABASE_URL;
    delete process.env.WRITE_PASSCODE;
    delete process.env.ADMIN_PASSCODE;
    vi.resetModules();
    await expect(import("@/lib/env")).resolves.toBeDefined();
  });

  it("parses and returns the typed env when everything is set", () => {
    Object.assign(process.env, VALID_ENV);
    const env: ServerEnv = getServerEnv();
    expect(env.DATABASE_URL).toBe(VALID_ENV.DATABASE_URL);
    expect(env.DIRECT_URL).toBe(VALID_ENV.DIRECT_URL);
    expect(env.WRITE_PASSCODE).toBe(VALID_ENV.WRITE_PASSCODE);
    expect(env.ADMIN_PASSCODE).toBe(VALID_ENV.ADMIN_PASSCODE);
  });

  it("treats DIRECT_URL as optional", () => {
    Object.assign(process.env, VALID_ENV);
    delete process.env.DIRECT_URL;
    const env = getServerEnv();
    expect(env.DIRECT_URL).toBeUndefined();
    expect(env.DATABASE_URL).toBe(VALID_ENV.DATABASE_URL);
  });

  it("memoizes after the first successful parse", () => {
    Object.assign(process.env, VALID_ENV);
    const first = getServerEnv();
    // change env after the first read; a memoized result should ignore it.
    process.env.WRITE_PASSCODE = "changed-but-ignored";
    const second = getServerEnv();
    expect(second).toBe(first);
    expect(second.WRITE_PASSCODE).toBe(VALID_ENV.WRITE_PASSCODE);
  });

  it("throws and names WRITE_PASSCODE when it is missing", () => {
    Object.assign(process.env, VALID_ENV);
    delete process.env.WRITE_PASSCODE;
    expect(() => getServerEnv()).toThrow(/WRITE_PASSCODE/);
  });

  it("throws and names DATABASE_URL when it is not a url", () => {
    Object.assign(process.env, VALID_ENV);
    process.env.DATABASE_URL = "not-a-url";
    expect(() => getServerEnv()).toThrow(/DATABASE_URL/);
  });

  it("never puts secret values in the error message", () => {
    Object.assign(process.env, VALID_ENV);
    process.env.WRITE_PASSCODE = "super-secret-passcode";
    // force a failure on a different var so we still throw with a secret present.
    process.env.DATABASE_URL = "not-a-url";
    try {
      getServerEnv();
      throw new Error("expected getServerEnv to throw");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      expect(message).toMatch(/DATABASE_URL/);
      expect(message).not.toContain("super-secret-passcode");
    }
  });
});

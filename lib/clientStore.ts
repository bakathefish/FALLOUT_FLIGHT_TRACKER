"use client";

// browser-side memory: the cohort passcode (remembered after first use) and the
// per-row edit tokens so a person can edit or remove their own entry later.
// every access is guarded; localStorage can throw in private mode.

const PASSCODE_KEY = "fallout.passcode";
const TOKENS_KEY = "fallout.editTokens";

function safeGet(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // ignore: storage full or blocked.
  }
}

export function getStoredPasscode(): string {
  return safeGet(PASSCODE_KEY) ?? "";
}

export function setStoredPasscode(passcode: string): void {
  safeSet(PASSCODE_KEY, passcode);
}

export function getEditTokens(): Record<string, string> {
  const raw = safeGet(TOKENS_KEY);
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, string>;
    }
  } catch {
    // fall through
  }
  return {};
}

export function getEditToken(id: string): string | undefined {
  return getEditTokens()[id];
}

export function rememberEditToken(id: string, token: string): void {
  const tokens = getEditTokens();
  tokens[id] = token;
  safeSet(TOKENS_KEY, JSON.stringify(tokens));
}

export function forgetEditToken(id: string): void {
  const tokens = getEditTokens();
  delete tokens[id];
  safeSet(TOKENS_KEY, JSON.stringify(tokens));
}

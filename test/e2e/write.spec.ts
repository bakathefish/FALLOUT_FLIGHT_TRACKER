import { test, expect } from "@playwright/test";

// the add/edit/persist flow needs a real database for `next start`, so it is
// gated on DATABASE_URL (CI provides a postgres service). it is skipped on a
// plain local run with no db.

const hasDb = Boolean(process.env.DATABASE_URL);

test.describe("add and edit a flight", () => {
  test.skip(!hasDb, "needs a database (set DATABASE_URL)");

  test("add with the passcode, it appears and persists, then edit it", async ({
    page,
  }) => {
    const name = `e2e flyer ${Date.now()}`;
    const passcode = process.env.WRITE_PASSCODE ?? "test-write";

    await page.goto("/");

    // open the dialog and fill the form.
    await page.getByRole("button", { name: /add your flight/i }).click();
    await page.getByLabel("name", { exact: true }).fill(name);
    await page.getByLabel("flight number").fill("CX216");
    await page.getByLabel("destination").selectOption("HKG");
    await page.getByLabel("passcode").fill(passcode);
    await page.getByRole("button", { name: "add flight", exact: true }).click();

    // it shows on the board.
    await expect(page.getByText(name)).toBeVisible({ timeout: 15_000 });

    // it survives a reload (stored in the db, edit token in localStorage).
    await page.reload();
    await expect(page.getByText(name)).toBeVisible({ timeout: 15_000 });

    // we own it, so we can edit it.
    const edited = `${name} edited`;
    await page.getByRole("button", { name: `edit ${name}` }).click();
    await page.getByLabel("name", { exact: true }).fill(edited);
    await page
      .getByRole("button", { name: "save changes", exact: true })
      .click();
    await expect(page.getByText(edited)).toBeVisible({ timeout: 15_000 });
  });
});

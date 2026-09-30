import { expect, test } from "@playwright/test"

test("privacy policy explains connected sites and off-device processing", async ({ page }) => {
  await page.goto("/privacy")
  await expect(page).toHaveTitle("Privacy Policy | Burrito")
  await expect(page.getByRole("heading", { name: "Privacy Policy", exact: true })).toBeVisible()

  const policy = page.locator("main article")
  const extension = policy.locator("section").filter({
    has: page.getByRole("heading", { name: "Chrome extension", exact: true })
  })
  await extension.scrollIntoViewIfNeeded()
  for (const host of ["app.burrito.money", "dex.burrito.money", "ai.burrito.money", "studio.burrito.money"]) {
    await expect(extension).toContainText(host)
  }
  await expect(extension).toContainText("its own connection approval")
  await expect(extension).toContainText("off-chain messages")
  await expect(extension).toContainText("revoke")
  await expect(extension).toContainText("extension-page local storage")

  const diagnostics = policy.locator("section").filter({
    has: page.getByRole("heading", { name: "Performance and error reporting", exact: true })
  })
  await diagnostics.scrollIntoViewIfNeeded()
  await expect(diagnostics).toContainText("Reporting does not require a connected wallet")
  await expect(diagnostics).toContainText("inside the mobile app")
  await expect(diagnostics).toContainText("runtime-error reporting")
  await expect(policy).toContainText("public address to the relevant blockchain data service")
  await expect(policy).toContainText("Connected external wallets apply their own")

  const contact = policy.getByRole("link", { name: "hello@burritolabs.ca", exact: true })
  await contact.scrollIntoViewIfNeeded()
  await expect(contact).toBeVisible()
  await expect(contact).toHaveAttribute("href", "mailto:hello@burritolabs.ca")
})

test("privacy distinguishes local custody from lookup and deletion boundaries", async ({ page }) => {
  await page.goto("/privacy")
  const policy = page.locator("main article")
  await expect(policy.locator("time")).toHaveAttribute("datetime", "2026-09-30")

  const custody = policy.locator("section").filter({
    has: page.getByRole("heading", { name: "Non-custodial wallet", exact: true })
  })
  await custody.scrollIntoViewIfNeeded()
  await expect(custody).toContainText("password-encrypted local vaults")
  await expect(custody).toContainText("using or displaying them")

  const services = policy.locator("section").filter({
    has: page.getByRole("heading", { name: "Blockchain and service providers", exact: true })
  })
  await services.scrollIntoViewIfNeeded()
  await expect(services).toContainText("identifiers of the assets being priced")
  await expect(services).toContainText("does not require connecting")
  await expect(services).toContainText("before signing approval")
  await expect(services).toContainText("Explorer navigation is separate")
  await expect(services).toContainText("their own browser cookies")

  const retention = policy.locator("section").filter({
    has: page.getByRole("heading", { name: "Retention and your choices", exact: true })
  })
  await retention.scrollIntoViewIfNeeded()
  await expect(retention).toContainText("Other stored wallets and the shared theme preference remain")
  await expect(retention).toContainText("physically erased")
  await expect(retention).toContainText("Uninstalling the app alone is not a guarantee")
  await expect(retention).toContainText("separate website storage or cache")
  await expect(retention).toContainText("retained by their operators")
  await expect(page.locator("vite-error-overlay")).toHaveCount(0)
})

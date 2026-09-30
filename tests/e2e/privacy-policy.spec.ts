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

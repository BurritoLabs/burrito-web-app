import { readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { chromium } from "playwright"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const publicDir = path.join(root, "public")

const asDataUrl = async (file, mime) => {
  const bytes = await readFile(file)
  return `data:${mime};base64,${bytes.toString("base64")}`
}

const brandIcon = await asDataUrl(path.join(publicDir, "brand", "icon.png"), "image/png")
const luncIcon = await asDataUrl(path.join(publicDir, "system", "lunc.svg"), "image/svg+xml")
const lunaIcon = await asDataUrl(path.join(publicDir, "system", "luna.svg"), "image/svg+xml")

const browser = await chromium.launch({ headless: true })

try {
  const iconPage = await browser.newPage({ viewport: { width: 192, height: 192 } })
  await iconPage.setContent(`
    <style>
      html, body { margin: 0; width: 192px; height: 192px; background: transparent; overflow: hidden; }
      img { display: block; width: 192px; height: 192px; }
    </style>
    <img src="${brandIcon}" alt="" />
  `)
  await iconPage.screenshot({
    path: path.join(publicDir, "brand", "icon-192.png"),
    omitBackground: true
  })

  const previewPage = await browser.newPage({ viewport: { width: 1200, height: 630 } })
  await previewPage.setContent(`
    <!doctype html>
    <html>
      <head>
        <style>
          * { box-sizing: border-box; }
          html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; }
          body {
            position: relative;
            background: #07140f;
            color: #f5fff7;
            font-family: Arial, Helvetica, sans-serif;
          }
          .top-rule { position: absolute; inset: 0 0 auto; height: 8px; display: grid; grid-template-columns: 1fr 1fr; }
          .top-rule span:first-child { background: #38bdf8; }
          .top-rule span:last-child { background: #f97316; }
          .frame { position: absolute; inset: 44px; border: 1px solid #375248; }
          .layout { position: absolute; inset: 72px; display: grid; grid-template-columns: 1.65fr 0.85fr; }
          .copy { display: flex; flex-direction: column; justify-content: center; padding-right: 58px; }
          .brand { display: flex; align-items: center; gap: 22px; margin-bottom: 34px; }
          .brand img { width: 92px; height: 92px; display: block; }
          .brand-name { font-size: 74px; line-height: 1; font-weight: 760; letter-spacing: 0; }
          h1 { margin: 0; max-width: 660px; font-size: 43px; line-height: 1.12; font-weight: 720; letter-spacing: 0; }
          h1 span:first-child { color: #38bdf8; }
          h1 span:last-child { color: #f97316; }
          .features { margin-top: 28px; font-size: 22px; line-height: 1.4; color: #b9cbc2; letter-spacing: 0; }
          .domain { margin-top: 42px; color: #68d83f; font-size: 22px; font-weight: 700; letter-spacing: 0; }
          .chains { border-left: 1px solid #375248; display: grid; grid-template-rows: 1fr 1fr; }
          .chain { display: flex; align-items: center; gap: 22px; padding-left: 44px; }
          .chain:first-child { border-bottom: 1px solid #375248; background: #0a1d24; }
          .chain:last-child { background: #21150d; }
          .chain img { width: 78px; height: 78px; display: block; }
          .symbol { font-size: 34px; line-height: 1; font-weight: 760; letter-spacing: 0; }
          .network { margin-top: 10px; color: #aebeb6; font-size: 17px; letter-spacing: 0; }
        </style>
      </head>
      <body>
        <div class="top-rule"><span></span><span></span></div>
        <div class="frame"></div>
        <main class="layout">
          <section class="copy">
            <div class="brand">
              <img src="${brandIcon}" alt="" />
              <div class="brand-name">Burrito</div>
            </div>
            <h1><span>Terra Classic</span> &amp; <span>Terra</span> Web App</h1>
            <div class="features">Wallet · Swap · Market · Stake · Governance · Launchpad</div>
            <div class="domain">app.burrito.money</div>
          </section>
          <section class="chains">
            <div class="chain">
              <img src="${luncIcon}" alt="" />
              <div><div class="symbol">LUNC</div><div class="network">columbus-5</div></div>
            </div>
            <div class="chain">
              <img src="${lunaIcon}" alt="" />
              <div><div class="symbol">LUNA</div><div class="network">phoenix-1</div></div>
            </div>
          </section>
        </main>
      </body>
    </html>
  `)
  await previewPage.screenshot({
    path: path.join(publicDir, "social-preview-v2.png")
  })
} finally {
  await browser.close()
}

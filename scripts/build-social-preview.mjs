import fs from "node:fs/promises"
import path from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"
import { chromium } from "playwright"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const publicDir = path.join(root, "public")
const outputPath = path.join(publicDir, "social-preview-v3.png")

const asDataUrl = async (relativePath, mimeType) => {
  const bytes = await fs.readFile(path.join(publicDir, relativePath))
  return `data:${mimeType};base64,${bytes.toString("base64")}`
}

const [brandIcon, luncIcon, lunaIcon] = await Promise.all([
  asDataUrl("brand/icon.png", "image/png"),
  asDataUrl("system/lunc.svg", "image/svg+xml"),
  asDataUrl("system/luna.svg", "image/svg+xml")
])

const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1
  })
  await page.setContent(`<!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          * { box-sizing: border-box; }
          html, body {
            width: 1200px;
            height: 630px;
            margin: 0;
            overflow: hidden;
            font-family: Montserrat, Arial, sans-serif;
          }
          #preview {
            position: relative;
            width: 1200px;
            height: 630px;
            color: #f4f8f5;
            background: #05130f;
            overflow: hidden;
          }
          .accent {
            position: absolute;
            inset: 0 auto 0 0;
            width: 10px;
            background: #5ee234;
          }
          .frame {
            position: absolute;
            inset: 34px;
            border: 1px solid #24473b;
          }
          .brand {
            position: absolute;
            top: 68px;
            left: 72px;
            display: flex;
            align-items: center;
            gap: 20px;
          }
          .brand img {
            width: 72px;
            height: 72px;
            border-radius: 50%;
          }
          .brand-name {
            font-size: 46px;
            line-height: 1;
            font-weight: 760;
          }
          .eyebrow {
            position: absolute;
            left: 74px;
            top: 199px;
            color: #72d8ff;
            font-size: 17px;
            font-weight: 650;
            text-transform: uppercase;
          }
          h1 {
            position: absolute;
            left: 70px;
            top: 236px;
            width: 650px;
            margin: 0;
            font-size: 66px;
            line-height: 1.08;
            font-weight: 760;
          }
          .description {
            position: absolute;
            left: 74px;
            top: 405px;
            width: 610px;
            color: #aec0b8;
            font-size: 23px;
            line-height: 1.45;
            font-weight: 470;
          }
          .url {
            position: absolute;
            left: 74px;
            bottom: 72px;
            color: #62e43a;
            font-size: 22px;
            font-weight: 680;
          }
          .networks {
            position: absolute;
            top: 105px;
            right: 72px;
            width: 330px;
          }
          .network-label {
            margin-bottom: 25px;
            color: #789087;
            font-size: 14px;
            font-weight: 650;
            text-transform: uppercase;
          }
          .network {
            display: grid;
            grid-template-columns: 96px 1fr;
            align-items: center;
            min-height: 146px;
          }
          .network + .network {
            margin-top: 28px;
          }
          .network-icon {
            display: grid;
            width: 82px;
            height: 82px;
            place-items: center;
            border: 1px solid #315348;
            border-radius: 8px;
            background: #081a15;
          }
          .network-icon.classic { border-color: #287da0; }
          .network-icon.terra { border-color: #8e6435; }
          .network-icon img {
            width: 56px;
            height: 56px;
            object-fit: contain;
          }
          .network-name {
            font-size: 32px;
            font-weight: 740;
          }
          .network-chain {
            margin-top: 8px;
            color: #8da39a;
            font-size: 17px;
          }
          .network.classic .network-name { color: #69d4ff; }
          .network.terra .network-name { color: #f5cf62; }
        </style>
      </head>
      <body>
        <main id="preview">
          <div class="accent"></div>
          <div class="frame"></div>
          <div class="brand">
            <img src="${brandIcon}" alt="" />
            <div class="brand-name">Burrito</div>
          </div>
          <div class="eyebrow">Terra + Terra Classic</div>
          <h1>One app.<br />Two networks.</h1>
          <div class="description">Wallet, swap, markets, staking, launchpad and NFTs across the Terra ecosystem.</div>
          <div class="url">app.burrito.money</div>
          <section class="networks">
            <div class="network-label">Supported networks</div>
            <div class="network classic">
              <div class="network-icon classic"><img src="${luncIcon}" alt="" /></div>
              <div>
                <div class="network-name">LUNC</div>
                <div class="network-chain">Terra Classic · columbus-5</div>
              </div>
            </div>
            <div class="network terra">
              <div class="network-icon terra"><img src="${lunaIcon}" alt="" /></div>
              <div>
                <div class="network-name">LUNA</div>
                <div class="network-chain">Terra · phoenix-1</div>
              </div>
            </div>
          </section>
        </main>
      </body>
    </html>`)
  await page.locator("#preview").screenshot({ path: outputPath })
  console.log(`Wrote ${path.relative(root, outputPath)} (1200x630)`)
} finally {
  await browser.close()
}

process.exit(0)

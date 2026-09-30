import PageShell from "./PageShell"
import styles from "./Privacy.module.css"

const Privacy = () => (
  <PageShell title="Privacy Policy" small>
    <article className={styles.policy}>
      <header className={styles.intro}>
        <p className={styles.updated}>
          Last updated: <time dateTime="2026-09-29">September 29, 2026</time>
        </p>
        <p>
          Burrito is a non-custodial wallet and blockchain interface provided by
          Burrito Labs Ltd. This policy explains how the Burrito mobile app,
          Chrome extension, and web app process information.
        </p>
      </header>

      <section>
        <h2>Non-custodial wallet</h2>
        <p>
          Burrito does not take custody of your assets. A recovery phrase or
          private key created or imported in the mobile app or Chrome extension
          is encrypted and stored locally using device- or browser-protected
          storage. It is used locally to derive accounts and sign transactions
          and is not sent to the Burrito web app, Burrito Labs, or a backend
          service.
        </p>
        <p>
          You are responsible for keeping your recovery phrase safe. Burrito
          Labs cannot recover it, reset it, or reverse a blockchain transaction.
        </p>
      </section>

      <section>
        <h2>Chrome extension</h2>
        <p>
          The Burrito Wallet Chrome extension connects to app.burrito.money,
          dex.burrito.money, ai.burrito.money, and studio.burrito.money. Each
          site requires its own connection approval before receiving your
          selected public address or requesting a signature. You can revoke
          these connections in the extension.
        </p>
        <p>
          Transactions and off-chain messages are shown in a dedicated review
          window and are signed only after your explicit approval. An approved
          signature is returned to the site that requested it. Connecting a
          site does not approve future signing requests.
        </p>
        <p>
          Chrome storage retains the encrypted wallet vault, account profiles,
          saved recipients, approved-site status, and preferences. Alarms help
          lock the wallet and expire unanswered approvals. The extension does
          not read unrelated websites, browsing history, cookies, device
          contacts, or advertising identifiers.
        </p>
        <p>
          Information received through Chrome APIs is used only to provide and
          secure the wallet features described here. It is not sold, used for
          advertising, transferred for credit decisions, or made available for
          unrelated human review.
        </p>
      </section>

      <section>
        <h2>Information processed</h2>
        <p>The app may process the following information to provide its features:</p>
        <ul>
          <li>
            Public wallet addresses, balances, token holdings, staking positions,
            governance activity, and transaction history available on supported
            blockchains.
          </li>
          <li>
            Transaction details and off-chain messages you prepare, review,
            sign, or broadcast. The mobile wallet signs locally after native
            review and device authentication; the extension uses its own
            approval window. Connected external wallets apply their own signing
            and authentication controls.
          </li>
          <li>
            App preferences, public account metadata, and recipients you choose
            to save locally on your device or browser profile.
          </li>
          <li>
            Technical request information, such as an IP address, user agent,
            timestamps, and error or security logs, that hosting, network, or
            blockchain infrastructure providers may receive when your device
            connects to them.
          </li>
        </ul>
      </section>

      <section>
        <h2>Performance and error reporting</h2>
        <p>
          The web app, including when opened inside the mobile app, sends
          performance measurements to Burrito&apos;s configured diagnostics
          service. These reports include the measurement and its rating, page
          path, selected blockchain network, navigation type, and app release.
          Reporting does not require a connected wallet.
        </p>
        <p>
          When configured, runtime-error reporting also sends error details,
          stack information, page location, selected network, and browser
          information. The app filters recognized wallet addresses, transaction
          hashes, and long encoded values from error text before sending it.
          These reports help diagnose reliability and performance issues;
          omitting a wallet-address field does not make all request information
          anonymous.
        </p>
      </section>

      <section>
        <h2>Information we do not collect</h2>
        <p>
          Burrito does not sell personal information and does not use third-party
          advertising trackers. The current app does not transmit recovery
          phrases, private keys, biometric data, contacts, photos, precise
          location, or payment-card data to Burrito Labs.
        </p>
        <p>
          Face ID, Touch ID, passcode, or other device-owner authentication is
          evaluated by the operating system. Burrito receives only the result
          needed to approve or deny a protected action.
        </p>
      </section>

      <section>
        <h2>Blockchain and service providers</h2>
        <p>
          Burrito connects to public blockchain nodes, indexers, market-data
          services, app hosting infrastructure, and Apple or Google platform
          services as needed to load the app, retrieve public chain data,
          broadcast transactions, and maintain security and availability. Those
          providers may process network metadata under their own privacy terms.
        </p>
        <p>
          Looking up an account sends its public address to the relevant
          blockchain data service. Broadcasting sends the signed transaction
          to a blockchain node. Registry and price requests retrieve token and
          market information from Burrito&apos;s APIs and other configured
          services. Keeping keys on your device does not mean that all wallet
          activity stays on your device.
        </p>
        <p>
          Public blockchains are permanent and transparent. A wallet address and
          its transactions can remain publicly available even after you stop
          using Burrito.
        </p>
      </section>

      <section>
        <h2>Retention and your choices</h2>
        <p>
          Local wallet material remains on your device or browser profile until
          you delete the wallet, clear the app or extension data, or uninstall
          Burrito, subject to the platform&apos;s secure-storage behavior. These
          actions cannot remove information already recorded on a public
          blockchain or data retained independently by a third-party provider.
        </p>
        <p>
          Revoking a connected site prevents future extension access through
          that connection; it does not delete information the site previously
          received. Contact us below with questions about information processed
          by Burrito&apos;s services.
        </p>
      </section>

      <section>
        <h2>Security</h2>
        <p>
          The native mobile wallet uses device-protected storage, device-owner
          authentication, and restricted web-to-native communication. The
          extension uses a password-encrypted vault and site-specific
          permissions. Both require explicit signing approval and use encrypted
          network connections. No system can guarantee absolute security,
          especially on a rooted, jailbroken, or otherwise compromised device.
        </p>
      </section>

      <section>
        <h2>Children</h2>
        <p>
          Burrito is not directed to children under 13, and Burrito Labs does not
          knowingly collect personal information from children under 13.
        </p>
      </section>

      <section>
        <h2>Changes to this policy</h2>
        <p>
          We may update this policy as Burrito changes. The effective date at the
          top of this page will be updated when a revised policy is published.
        </p>
      </section>

      <section>
        <h2>Contact</h2>
        <p>
          Questions about this policy can be sent to{" "}
          <a href="mailto:hello@burritolabs.ca">hello@burritolabs.ca</a>.
        </p>
        <p>Burrito Labs Ltd., Canada</p>
      </section>
    </article>
  </PageShell>
)

export default Privacy

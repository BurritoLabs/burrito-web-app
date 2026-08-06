import PageShell from "./PageShell"
import styles from "./Privacy.module.css"

const Privacy = () => (
  <PageShell title="Privacy Policy" small>
    <article className={styles.policy}>
      <header className={styles.intro}>
        <p className={styles.updated}>
          Last updated: <time dateTime="2026-08-06">August 6, 2026</time>
        </p>
        <p>
          Burrito is a non-custodial wallet and blockchain interface provided by
          Burrito Labs Ltd. This policy explains how the Burrito mobile app and
          web app process information.
        </p>
      </header>

      <section>
        <h2>Non-custodial wallet</h2>
        <p>
          Burrito does not take custody of your assets. A recovery phrase or
          private key created or imported in the mobile app is stored locally
          using the device&apos;s protected storage and is used on the device to
          derive accounts and sign transactions. It is not sent to the Burrito
          web app, Burrito Labs, or a backend service.
        </p>
        <p>
          You are responsible for keeping your recovery phrase safe. Burrito
          Labs cannot recover it, reset it, or reverse a blockchain transaction.
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
            Transaction details you prepare, review, sign, or broadcast. Signing
            occurs locally after native review and device approval.
          </li>
          <li>
            App preferences and public account metadata stored locally on your
            device.
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
          Public blockchains are permanent and transparent. A wallet address and
          its transactions can remain publicly available even after you stop
          using Burrito.
        </p>
      </section>

      <section>
        <h2>Retention and your choices</h2>
        <p>
          Local wallet material remains on your device until you delete the
          wallet or app, subject to the operating system&apos;s secure-storage
          behavior. You can remove the wallet from Burrito, clear app data, or
          uninstall the app. These actions cannot remove information already
          recorded on a public blockchain or data retained independently by a
          third-party provider.
        </p>
      </section>

      <section>
        <h2>Security</h2>
        <p>
          Burrito uses device-protected storage, explicit transaction review,
          device-owner approval, restricted web-to-native communication, and
          encrypted network connections. No system can guarantee absolute
          security, especially on a rooted, jailbroken, or otherwise compromised
          device.
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

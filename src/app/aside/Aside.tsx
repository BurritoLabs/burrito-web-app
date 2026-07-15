import styles from "./Aside.module.css"
import BlockStatus from "./BlockStatus"
import { useAppChain } from "../appChainContext"

const DocsIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <path
      d="M6.25 4.75h8.1l3.4 3.39v10.11a1.5 1.5 0 0 1-1.5 1.5H6.25a1.5 1.5 0 0 1-1.5-1.5v-12a1.5 1.5 0 0 1 1.5-1.5Z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.55"
      strokeLinejoin="round"
    />
    <path
      d="M14.35 4.75v3.9h3.9"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.55"
      strokeLinejoin="round"
    />
    <path
      d="M8 10h6.5M8 13h7.75M8 16h5.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.55"
      strokeLinecap="round"
    />
  </svg>
)

const Aside = () => {
  const { chainKey } = useAppChain()
  const links = [
    {
      label: "Documentation",
      href:
        chainKey === "lunc"
          ? "https://terra-classic.io/docs"
          : "https://docs.terra.money/",
      icon: <DocsIcon />
    }
  ]

  const community = [
    {
      label: "Discord",
      href: "https://discord.gg/dx8xH2NBeV",
      icon: "/community/Discord.svg"
    },
    {
      label: "Telegram",
      href: "https://t.me/BurritoLabs",
      icon: "/community/Telegram.svg"
    },
    { label: "X", href: "https://x.com/burrito__money", icon: "/community/X.svg" },
    { label: "GitHub", href: "https://github.com/BurritoLabs", icon: "/community/Github.svg" }
  ]

  return (
    <div className={styles.aside}>
      <div className={styles.links}>
        <div className={styles.tutorial}>
          {links.map((link) => (
            <a
              key={link.label}
              className={styles.link}
              href={link.href}
              target="_blank"
              rel="noreferrer"
            >
              {link.icon}
              {link.label}
            </a>
          ))}
        </div>

        <div className={styles.community}>
          {community.map((item) =>
            item.href ? (
              <a
                key={item.label}
                href={item.href}
                target="_blank"
                rel="noreferrer"
                className={styles.communityIcon}
                aria-label={item.label}
              >
                <img src={item.icon} alt="" />
              </a>
            ) : (
              <span
                key={item.label}
                className={`${styles.communityIcon} ${styles.communityIconDisabled}`}
                aria-label={`${item.label} unavailable`}
                aria-disabled="true"
              >
                <img src={item.icon} alt="" />
              </span>
            )
          )}
        </div>

        <div className={styles.blockStatusWrap}>
          <BlockStatus />
        </div>
      </div>
    </div>
  )
}

export default Aside

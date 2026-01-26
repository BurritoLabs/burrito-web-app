import styles from "./Aside.module.css"

const SetupIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <path
      d="M13 2L3 14h7l-1 8 11-14h-7z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
  </svg>
)

const DocsIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <path
      d="M6 4h9l3 3v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
    <path
      d="M15 4v4h4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
  </svg>
)

const Aside = () => {
  const links = [
    { label: "Setup", href: "#", icon: <SetupIcon /> },
    { label: "Documentation", href: "#", icon: <DocsIcon /> }
  ]

  const community = [
    { label: "Discord", href: "#", icon: "/community/Discord.svg" },
    { label: "Telegram", href: "#", icon: "/community/Telegram.svg" },
    { label: "X", href: "https://x.com/burrito__money", icon: "/community/Twitter.svg" },
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
          {community.map((item) => (
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
          ))}
        </div>
      </div>
    </div>
  )
}

export default Aside

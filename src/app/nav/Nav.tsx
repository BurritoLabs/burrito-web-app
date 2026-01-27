import { Link, NavLink, useLocation } from "react-router-dom"
import BrandLogo from "../../components/brand/BrandLogo"
import { useNav } from "../routes"
import styles from "./Nav.module.css"
import { useEffect } from "react"

type NavProps = {
  isOpen?: boolean
  onClose?: () => void
}

const Nav = ({ isOpen, onClose }: NavProps) => {
  const { menu } = useNav()
  const { pathname } = useLocation()

  useEffect(() => {
    if (isOpen && onClose) onClose()
  }, [pathname, isOpen, onClose])

  return (
    <nav className={styles.nav}>
      <div className={styles.brand}>
        <Link to="/" className={styles.brandLink} aria-label="Go to dashboard">
          <BrandLogo textSize={20} iconSize={24} gap={6} />
        </Link>
        {isOpen ? (
          <button
            className={styles.toggle}
            onClick={onClose}
            aria-label="Close"
            type="button"
          >
            <span />
            <span />
          </button>
        ) : null}
      </div>

      <div className={styles.links}>
        {menu.map(({ path, title, icon }) => (
          <NavLink
            key={path}
            to={path}
            className={({ isActive }) =>
              `${styles.link} ${isActive ? styles.active : ""}`
            }
          >
            <span className={styles.icon}>{icon}</span>
            <span>{title}</span>
          </NavLink>
        ))}
      </div>

    </nav>
  )
}

export default Nav

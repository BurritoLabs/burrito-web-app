import { NavLink } from "react-router-dom"
import { useNav } from "../routes"
import styles from "./Nav.module.css"

const Nav = () => {
  const { menu } = useNav()

  return (
    <nav className={styles.nav}>
      <div className={styles.brand}>
        <span className={styles.logo} aria-hidden="true">
          B
        </span>
        <div className={styles.brandText}>
          <strong>Burrito</strong>
          <span>Station</span>
        </div>
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

      <div className={styles.glow} aria-hidden="true" />
    </nav>
  )
}

export default Nav

import type { PropsWithChildren } from "react"
import styles from "./Layout.module.css"

export const Banner = ({ children }: PropsWithChildren) => {
  return <div className={styles.banner}>{children}</div>
}

export const Sidebar = ({ children }: PropsWithChildren) => {
  return <aside className={styles.sidebar}>{children}</aside>
}

export const Header = ({ children }: PropsWithChildren) => {
  return (
    <header className={styles.header}>
      <div className={styles.headerInner}>{children}</div>
    </header>
  )
}

export const Content = ({ children }: PropsWithChildren) => {
  return <main className={styles.main}>{children}</main>
}

export const MainContainer = ({ children }: PropsWithChildren) => {
  return <div className={styles.mainContainer}>{children}</div>
}

const Layout = ({ children }: PropsWithChildren) => {
  return <div className={styles.layout}>{children}</div>
}

export default Layout

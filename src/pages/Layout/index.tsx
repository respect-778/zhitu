import type React from "react"
import { useLayoutEffect, useRef } from "react"
// import Footer from "./components/Footer"
import Header from "./components/Header"
import { Outlet, useLocation } from "react-router"
import styles from "./index.module.less"


const Layout: React.FC = () => {
  const { pathname } = useLocation()
  const contentRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    contentRef.current?.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }, [pathname])

  return (
    <div className={styles.layout}>
      <Header />
      <div ref={contentRef} className={styles.content}>
        <div className={styles.wrapper}>
          {/* 二级路由显示位置 */}
          <Outlet />
        </div>
      </div>
      {/* <Footer /> */}
    </div>
  )
}

export default Layout

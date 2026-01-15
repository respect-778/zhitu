import type React from "react"
import Footer from "./components/Footer"
import Header from "./components/Header"
import { Outlet } from "react-router"
import styles from "./index.module.less"


const Layout: React.FC = () => {

  return (
    <div>
      <Header />
      <div className={styles.content}>
        <div className={styles.wrapper}>
          {/* 二级路由显示位置 */}
          <Outlet />
        </div>
      </div>
      <Footer />
    </div>
  )
}

export default Layout
import type React from "react"
import styles from './index.module.less'
import { useLayoutEffect, useState } from "react"
import { getStore, setStore } from "@/utils/store"
import { DesktopOutlined, MoonOutlined, SunOutlined } from "@ant-design/icons"
import { Dropdown } from "antd"
import type { MenuProps } from 'antd';


const ThemeToggle: React.FC = () => {

  const items: MenuProps['items'] = [
    {
      key: '1',
      label: (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <SunOutlined />
          <div onClick={() => toggleTheme('default')}>明亮模式</div>
        </div>
      ),
    },
    {
      key: '2',
      label: (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <MoonOutlined />
          <div onClick={() => toggleTheme('dark')}>暗黑模式</div>
        </div>
      ),
    },
    {
      key: '3',
      label: (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <DesktopOutlined />
          <div onClick={() => toggleTheme('default')}>跟随系统</div>
        </div>
      ),
    }
  ]

  const [theme, setTheme] = useState<string>(() => getStore('data-theme') ?? 'default')

  useLayoutEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  // 切换主题颜色
  const toggleTheme = (them: string) => {
    const newTheme = them
    setStore('data-theme', newTheme)
    setTheme(newTheme)
  }

  return (
    <div>
      {theme === 'default' ?
        <Dropdown menu={{ items }} trigger={['click']} placement="bottom">
          <div className={styles.switch}>
            <span className={styles.sun}><SunOutlined /></span>
          </div>
        </Dropdown>
        :
        <Dropdown menu={{ items }} trigger={['click']} placement="bottom">
          <div className={styles.switch}>
            <span className={styles.moon}><MoonOutlined /></span>
          </div>
        </Dropdown>
      }
    </div>
  )
}

export default ThemeToggle

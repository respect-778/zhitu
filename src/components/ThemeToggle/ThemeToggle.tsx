import styles from './index.module.less'
import { DesktopOutlined, MoonOutlined, SunOutlined } from '@ant-design/icons'
import { Dropdown, type MenuProps } from 'antd'
import { useAppDispatch } from '@/store/hooks'
import { setThemeMode, type ThemeMode } from '@/store/modules/themeStore'
import { useTheme } from '@/hooks/useTheme'

const ThemeToggle = () => {
  const dispatch = useAppDispatch()
  const { mode, isDark } = useTheme()
  const items: MenuProps['items'] = [
    { key: 'default', icon: <SunOutlined />, label: '明亮模式' },
    { key: 'dark', icon: <MoonOutlined />, label: '暗黑模式' },
    { key: 'system', icon: <DesktopOutlined />, label: '跟随系统' },
  ]

  return (
    <Dropdown
      menu={{ items, selectable: true, selectedKeys: [mode], onClick: ({ key }) => dispatch(setThemeMode(key as ThemeMode)) }}
      trigger={['click']}
      placement="bottom"
    >
      <button className={styles.switch} type="button" aria-label="切换主题">
        <span className={isDark ? styles.moon : styles.sun}>
          {isDark ? <MoonOutlined /> : <SunOutlined />}
        </span>
      </button>
    </Dropdown>
  )
}

export default ThemeToggle

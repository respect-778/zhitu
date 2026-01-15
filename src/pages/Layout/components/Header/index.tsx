import type React from 'react'
import { useEffect, useLayoutEffect } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { Dropdown, message, Space } from 'antd'
import { HomeOutlined, CompassOutlined, TeamOutlined, RobotOutlined, DownOutlined } from '@ant-design/icons'
import type { MenuProps } from 'antd';
import ThemeToggle from '@/components/ThemeToggle/ThemeToggle'
import styles from './index.module.less'
import { getUserInfo } from '@/store/modules/userStore'
import { delStore } from '@/utils/store'
import { useAppDispatch, useAppSelector } from '@/store/hooks'


const Header: React.FC = () => {
  const { pathname } = useLocation() // 获取当前的地址
  const activeTab = pathname
  const navigate = useNavigate()
  const dispatch = useAppDispatch()

  const navItems = [
    { key: '/', label: '首页', icon: <HomeOutlined /> },
    { key: '/path', label: '学习路线', icon: <CompassOutlined /> },
    { key: '/community', label: '道友圈', icon: <TeamOutlined /> },
    { key: '/ai', label: 'AI辨析', icon: <RobotOutlined /> },
  ]


  // 退出登录
  const handleLogout = () => {
    delStore('token')
    delStore('userInfo')
    message.success('退出登录成功')
    navigate('/login')
  }

  const items: MenuProps['items'] = [
    {
      key: '1',
      label: (
        <div onClick={handleLogout}>
          退出登录
        </div>
      ),
    }
  ]

  // 获取用户信息
  useEffect(() => {
    dispatch(getUserInfo())
  }, [dispatch])

  useLayoutEffect(() => {
    window.scrollTo(0, 0) // 每次切换路由时，滚轮滑到顶部
  }, [pathname])

  // 从 redux 中拿到 username 状态
  const username = useAppSelector(state => state.user.username)
  const token = useAppSelector(state => state.user.token)

  // tab 切换
  const handleTabChange = (key: string) => {
    navigate(key)
  }

  return (
    <header className={styles.header}>
      <div className={styles.left}>
        <div className={styles.logo} onClick={() => navigate('/')}>
          <img className={styles.img} src="/imgs/logo.png" alt="Zhitu Logo" />
          <span className={styles.text}>知途 Zhitu</span>
        </div>
        <ul className={styles.nav}>
          {navItems.map((item) => (
            <li
              key={item.key}
              className={`${styles.navItem} ${activeTab === item.key ? styles.active : ''}`}
              onClick={() => handleTabChange(item.key)}
            >
              {item.icon}
              <span>{item.label}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className={styles.right}>
        <ThemeToggle />
        {token ?
          <div className={styles.dropdown}>
            <Dropdown menu={{ items }} trigger={['click']}>
              <Space>
                {username}
                <DownOutlined />
              </Space>
            </Dropdown>
          </div>
          :
          <button onClick={() => navigate('/login')} className={styles.actionBtn}>登录</button>}
        <button className={`${styles.actionBtn} ${styles.primaryBtn}`}>开始探索</button>
      </div>
    </header>
  )
}

export default Header

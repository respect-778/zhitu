import type React from 'react'
import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { Dropdown, message, Space } from 'antd'
import { HomeOutlined, CompassOutlined, TeamOutlined, CommentOutlined, GithubOutlined } from '@ant-design/icons'
import type { MenuProps } from 'antd';
import ThemeToggle from '@/components/ThemeToggle/ThemeToggle'
import styles from './index.module.less'
import { clearUserInfo, getUserInfo } from '@/store/modules/userStore'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { logoutAPI } from '@/api/user'
import { delStore } from '@/utils/store'


const Header: React.FC = () => {
  const { pathname } = useLocation() // 获取当前的地址
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  // 从 redux 中拿到 username 状态
  const username = useAppSelector(state => state.user.username)
  const token = useAppSelector(state => state.user.token)

  const navItems = [
    { key: '/', label: '首页', icon: <HomeOutlined /> },
    { key: '/path', label: '学习路线', icon: <CompassOutlined /> },
    { key: '/community', label: '道友圈', icon: <TeamOutlined /> },
    { key: '/chat', label: 'AI助手', icon: <CommentOutlined /> },
    { key: 'https://github.com/respect-778/zhitu', label: 'Github', icon: <GithubOutlined /> }
  ]

  // 退出登录
  const handleLogout = async () => {
    try {
      await logoutAPI()
    } catch (error) {
      console.log('退出失败', error)
    } finally {
      dispatch(clearUserInfo())
      delStore('aiName') // 清理当前用户配置的 ai
      delStore('userId') // 清除当前用户id
      delStore('data-theme') // 清除当前主题颜色
      message.success('退出登录成功')
      navigate('/login')
    }

  }

  const items: MenuProps['items'] = [
    {
      key: '1',
      label: (
        <div>{username}</div>
      ),
    },
    {
      key: '2',
      label: (
        <div onClick={handleLogout}>
          退出登录
        </div>
      ),
    }
  ]

  // 获取用户信息
  useEffect(() => {
    if (token) {
      dispatch(getUserInfo())
    }
  }, [dispatch, token])

  // tab 切换
  const handleTabChange = (key: string) => {
    if (key === 'https://github.com/respect-778/zhitu') {
      window.open(key)
    } else {
      navigate(key)
    }
  }

  // 处理导航高亮：/chat 与 /chat/:id 都高亮 AI助手
  const isNavItemActive = (key: string) => {
    if (key === '/chat') {
      return pathname === '/chat' || pathname.startsWith('/chat/')
    }
    return pathname === key
  }

  return (
    <header className={styles.header}>
      <div className={styles.left}>
        <div className={styles.logo} onClick={() => navigate('/')}>
          <img className={styles.img} src="/imgs/logo.png" alt="Logo" draggable="false" />
        </div>
        <ul className={styles.nav}>
          {navItems.map((item) => (
            <li
              key={item.key}
              className={`${styles.navItem} ${isNavItemActive(item.key) ? styles.active : ''}`}
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
          <Dropdown menu={{ items }} trigger={['click']} placement={'bottom'}>
            <Space>
              <div className={styles.dropdown}>
                <img className={styles.dropdownImg} draggable="false" src="/imgs/admin.png" alt="" />
              </div>
            </Space>
          </Dropdown>
          :
          <div>
            <button onClick={() => navigate('/login')} className={styles.actionBtn}>登录</button>
          </div>
        }
      </div>
    </header>
  )
}

export default Header

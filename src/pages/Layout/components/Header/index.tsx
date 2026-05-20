import type React from 'react'
import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { Dropdown, message, Space } from 'antd'
import { GithubOutlined, SettingOutlined, LogoutOutlined, UserOutlined } from '@ant-design/icons'
import type { MenuProps } from 'antd';
import ThemeToggle from '@/components/ThemeToggle/ThemeToggle'
import styles from './index.module.less'
import { clearUserInfo, getUserInfo } from '@/store/modules/userStore'
import { clearResumeState } from '@/store/modules/resumeStore'
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
  const userId = useAppSelector(state => state.user.userId)
  const userInfo = useAppSelector(state => state.user.userInfo)

  const navItems = [
    { key: '/', label: '探索' },
    { key: '/path', label: '学习规划' },
    { key: '/community', label: '知识广场' },
    { key: '/resume', label: '简历制作' },
    { key: '/chat', label: '学习助手' },
    { key: '/docs', label: '使用文档' }
  ]

  // 退出登录
  const handleLogout = async () => {
    try {
      await logoutAPI()
    } catch (error) {
      console.log('注销失败', error)
    } finally {
      dispatch(clearUserInfo())
      dispatch(clearResumeState())
      delStore('aiName') // 清理当前用户配置的 ai
      delStore('userId') // 清除当前用户id
      delStore('data-theme') // 清除当前主题颜色
      message.success('已注销')
      navigate('/login')
    }

  }

  const items: MenuProps['items'] = [
    {
      key: '1',
      label: (
        <div>
          <div style={{ fontSize: '14px', fontWeight: '600' }}>{username}</div>
          <div style={{ fontSize: '12px', color: '#747479' }}>{userInfo.data.email}</div>
        </div>
      ),
    },
    {
      key: '2',
      label: (
        <div onClick={() => navigate(`/user/${userId}`)}>
          <UserOutlined /> 个人信息
        </div>
      )
    },
    {
      key: '3',
      label: (
        <div onClick={() => navigate('/setting')}>
          <SettingOutlined /> 设置
        </div>
      )
    },
    {
      key: '4',
      label: (
        <div onClick={handleLogout}>
          <LogoutOutlined /> 注销
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
    if (key === '/chat') return pathname === '/chat' || pathname.startsWith('/chat/')
    if (key === '/resume') return pathname === '/resume' || pathname.startsWith('/resume/')
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
              <span>{item.label}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className={styles.right}>
        <div className={styles.github} onClick={() => window.open("https://github.com/respect-778/zhitu")}>
          <GithubOutlined />
          GitHub
        </div>
        <ThemeToggle />
        {token ?
          <Dropdown menu={{ items }} trigger={['click']} placement={'bottom'}>
            <Space>
              <div className={styles.dropdown}>
                <img className={styles.dropdownImg} src={userInfo.data.avatar || './imgs/admin.png'} draggable="false" referrerPolicy="no-referrer" alt="头像" />
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

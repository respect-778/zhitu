import { LoadingOutlined } from '@ant-design/icons'
import { useLayoutEffect, type PropsWithChildren } from 'react'
import { createPortal } from 'react-dom'
import styles from './index.module.less'

// 嵌套路由可能同时显示多个加载层，最后一个卸载后才恢复页面滚动。
let activeLoaders = 0
let hadScrollLock = false

type LoadingProps = PropsWithChildren<{ withHeader?: boolean }>

const Loading = ({ children, withHeader = false }: LoadingProps) => {
  useLayoutEffect(() => {
    if (activeLoaders++ === 0) {
      hadScrollLock = document.documentElement.classList.contains('page-loading')
      document.documentElement.classList.add('page-loading')
    }
    return () => {
      if (--activeLoaders === 0 && !hadScrollLock) {
        document.documentElement.classList.remove('page-loading')
      }
    }
  }, [])

  return createPortal(
    <div className={`${styles.loading}${withHeader ? ` ${styles.withHeader}` : ''}`} role="status" aria-label="正在加载">
      {children ?? <LoadingOutlined spin />}
    </div>,
    document.body,
  )
}

export default Loading

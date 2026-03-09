import { LoadingOutlined } from '@ant-design/icons'
import styles from './index.module.less'

const Loading = () => {
  return (
    <div className={styles.loading}>
      <LoadingOutlined spin={true} />
    </div>
  )
}

export default Loading
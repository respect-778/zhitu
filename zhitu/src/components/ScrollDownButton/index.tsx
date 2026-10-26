// 向下滚动按钮
import { DownOutlined } from '@ant-design/icons';
import styles from './index.module.less';

const ScrollDownButton = () => {
  return (
    <>
      <div className={styles.jumpToBottomBtn}>
        <DownOutlined />
      </div>
    </>
  )
}

export default ScrollDownButton
import {
  ClockCircleOutlined,
  DownOutlined,
  LoadingOutlined,
  MessageOutlined,
  PlusOutlined,
  SendOutlined
} from '@ant-design/icons'
import { useNavigate } from 'react-router'
import styles from './index.module.less'

const prefilledQuestion =
  '请帮我快速总结这篇文章的核心干货，按“一句话总结、关键观点、适合谁读、是否值得细读”输出。'

const SummaryAI = () => {
  const navigate = useNavigate()

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerLeft} onClick={() => navigate('/')}>
          <img style={{ height: '60px' }} src="/imgs/logo.png" alt="logo" draggable="false" />
        </div>
        <div className={styles.headerRight} onClick={() => window.open('/community/publish')}>
          <PlusOutlined />
          <span>创作</span>
        </div>
      </header>

      <div className={styles.body}>
        <aside className={styles.sidebar}>
          <div className={styles.sidebarTitle}>
            <span className={styles.skeletonBlock}></span>
            <span className={`${styles.skeletonBlock} ${styles.shortSkeleton}`}></span>
          </div>

          <div className={styles.summaryEntry}>
            <div className={styles.summaryEntryLeft}>
              <div className={styles.summaryIcon}>V</div>
              <span>文章摘要</span>
            </div>
            <DownOutlined className={styles.summaryArrow} />
          </div>

          <div className={styles.coverCard}>
            <div className={styles.coverCanvas}>
              <div className={styles.coverBadge}>文章封面</div>
              <div className={styles.coverGlow}></div>
            </div>
          </div>

          <div className={styles.tocSection}>
            <div className={styles.sectionHeading}>文章目录</div>
            <div className={styles.tocList}>
              {Array.from({ length: 8 }).map((_, index) => (
                <div key={index} className={styles.tocItem}>
                  <span className={styles.tocDot}></span>
                  <span className={styles.tocSkeleton}></span>
                </div>
              ))}
            </div>
          </div>
        </aside>

        <main className={styles.main}>
          <div className={styles.mainTop}>
            <div className={styles.mainTitle}>对话</div>
            <div className={styles.mainHint}>内容由 AI 生成，仅供参考</div>
          </div>

          <div className={styles.mainContent}>
            <div className={styles.questionRow}>
              <div className={styles.questionBubble}>{prefilledQuestion}</div>
            </div>

            <div className={styles.answerSection}>
              <div className={styles.answerHeader}>
                <div className={styles.answerHeaderLeft}>
                  <MessageOutlined />
                  <span>回答</span>
                </div>
                <div className={styles.answerStatus}>
                  <LoadingOutlined spin />
                  <span>正在响应</span>
                </div>
              </div>

              <div className={styles.answerBody}>
                <div className={styles.answerNotice}>
                  AI 已进入总结阶段，摘要结果将在这里逐步生成。
                </div>

                <div className={styles.answerBlock}>
                  <div className={styles.answerBlockTitle}>回答</div>
                  <div className={styles.answerSkeletonGroup}>
                    <span className={styles.answerSkeleton}></span>
                    <span className={styles.answerSkeleton}></span>
                    <span className={`${styles.answerSkeleton} ${styles.answerSkeletonShort}`}></span>
                  </div>
                </div>

                <div className={styles.answerBlock}>
                  <div className={styles.answerBlockTitle}>一句话总结</div>
                  <div className={styles.answerSkeletonGroup}>
                    <span className={`${styles.answerSkeleton} ${styles.answerSkeletonMedium}`}></span>
                  </div>
                </div>

                <div className={styles.keySection}>
                  <div className={styles.keyTitle}>关键提炼</div>
                  <div className={styles.keyList}>
                    {Array.from({ length: 3 }).map((_, index) => (
                      <div key={index} className={styles.keyItem}>
                        <span className={styles.keyIndex}>{index + 1}</span>
                        <span className={styles.keyTextSkeleton}></span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className={styles.composer}>
            <div className={styles.composerInput}>{prefilledQuestion}</div>
            <div className={styles.composerFooter}>
              <div className={styles.modelTag}>
                <ClockCircleOutlined />
                <span>Fixed Summary Model</span>
              </div>
              <button type="button" className={styles.sendButton}>
                <SendOutlined />
              </button>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}

export default SummaryAI

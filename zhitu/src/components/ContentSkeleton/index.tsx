import styles from './index.module.less'

/** Stable placeholders independent of the number of records already fetched. */
export default function ContentSkeleton({ people = false, label = '正在加载内容' }: { people?: boolean; label?: string }) {
  return <div className={people ? styles.people : styles.list} role="status" aria-label={label} aria-busy="true" data-testid="content-skeleton">
    {Array.from({ length: people ? 6 : 4 }, (_, index) => <div key={index} className={people ? styles.person : styles.article} aria-hidden="true">
      <div className={styles.main}>
        <span className={styles.avatar} />
        <div className={styles.lines}><span className={styles.title} /><span className={styles.meta} /><span className={styles.line} /><span className={styles.short} /></div>
      </div>
      <div className={styles.footer}><span className={styles.meta} /><span className={styles.action} /></div>
    </div>)}
  </div>
}

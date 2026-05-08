import Setting from "@/pages/Layout/components/Setting"
import styles from './index.module.less'

const PersonalContent = () => {
  return (
    <div className={styles.personalContainer}>
      <Setting className={styles.embeddedSetting} />
    </div>
  )
}

export default PersonalContent
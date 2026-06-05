import type React from 'react'
import { AimOutlined, CheckCircleOutlined, ClockCircleOutlined } from '@ant-design/icons'
import styles from './PlanPanel.module.less'

const PlanPanel: React.FC = () => {
  const plan = {
    title: 'React 前端进阶',
    day: 12,
    totalDays: 30,
    currentWeek: {
      number: 2,
      title: '状态管理与路由',
      tasks: [
        { id: '1', title: '学习 React Router', done: true },
        { id: '2', title: '理解 Redux 核心概念', done: true },
        { id: '3', title: '搭建项目脚手架', done: true },
        { id: '4', title: '实现用户登录模块', done: false },
        { id: '5', title: '接入 API 层', done: false },
        { id: '6', title: '写周记 / 反思', done: false },
      ],
    },
    nextWeek: '项目实战开发',
  }

  const progress = Math.round((plan.day / plan.totalDays) * 100)
  const doneTasks = plan.currentWeek.tasks.filter(t => t.done).length
  const totalTasks = plan.currentWeek.tasks.length

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <AimOutlined className={styles.headerIcon} />
        <span>当前计划</span>
      </div>

      <div className={styles.section}>
        <div className={styles.planTitle}>{plan.title}</div>
        <div className={styles.progressInfo}>
          Day {plan.day} / {plan.totalDays}
        </div>
        <div className={styles.progressBar}>
          <div className={styles.progressFill} style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className={styles.divider} />

      <div className={styles.section}>
        <div className={styles.weekTitle}>
          本周: {plan.currentWeek.title}
        </div>
        <div className={styles.taskCount}>
          <CheckCircleOutlined /> {doneTasks}/{totalTasks} 任务完成
        </div>
        <div className={styles.taskList}>
          {plan.currentWeek.tasks.map(task => (
            <label key={task.id} className={styles.taskItem}>
              <input type="checkbox" checked={task.done} readOnly className={styles.checkbox} />
              <span className={task.done ? styles.taskDone : ''}>{task.title}</span>
            </label>
          ))}
        </div>
      </div>

      <div className={styles.divider} />

      <div className={styles.section}>
        <div className={styles.nextLabel}>
          <ClockCircleOutlined /> 下周预告
        </div>
        <div className={styles.nextTitle}>{plan.nextWeek}</div>
      </div>

      <button className={styles.viewBtn}>查看完整计划</button>
    </div>
  )
}

export default PlanPanel

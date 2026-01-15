import type React from 'react'
import { GithubOutlined, WechatOutlined, ZhihuOutlined, MailOutlined } from '@ant-design/icons'
import styles from './index.module.less'

const Footer: React.FC = () => {
  return (
    <footer className={styles.footer}>
      <div className={styles.content}>
        <div className={styles.brand}>
          <div className={styles.title}>知途 Zhitu</div>
          <div className={styles.slogan}>
            解决大学生信息差，指引你的学习之路。<br />
            Bridging the information gap for university students.
          </div>
          <div className={styles.socials}>
            <div className={styles.socialIcon}><GithubOutlined /></div>
            <div className={styles.socialIcon}><WechatOutlined /></div>
            <div className={styles.socialIcon}><ZhihuOutlined /></div>
            <div className={styles.socialIcon}><MailOutlined /></div>
          </div>
        </div>

        <div className={styles.links}>
          <div className={styles.column}>
            <h4>产品</h4>
            <a href="#">学习路线</a>
            <a href="#">道友圈</a>
            <a href="#">AI辨析</a>
          </div>
          <div className={styles.column}>
            <h4>资源</h4>
            <a href="#">开发文档</a>
            <a href="#">源码地址</a>
            <a href="#">常见问题</a>
          </div>
          <div className={styles.column}>
            <h4>关于</h4>
            <a href="#">关于我们</a>
            <a href="#">加入我们</a>
            <a href="#">联系方式</a>
          </div>
        </div>
      </div>

      <div className={styles.bottom}>
        Copyright © 2025 知途 Zhitu. All rights reserved. | created by 赖新宇
      </div>
    </footer>
  )
}

export default Footer
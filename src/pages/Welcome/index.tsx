import type React from 'react'
import { useEffect, useRef, useState } from 'react'
import {
  ArrowRightOutlined
} from '@ant-design/icons'
import LogoLoop from '../../components/LogoLoop/LogoLoop'
import CountUp from '../../components/CountUp/CountUp'
import type { LogoItem } from '../../components/LogoLoop/LogoLoop'
import styles from './index.module.less'
import DomeGallery from '@/components/DomeGallery/DomeGallery'
import FallingText from '@/components/FallingText/FallingText'
import BlurText from '@/components/BlurText/BlurText'

const heroVideoUrl = 'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260314_131748_f2ca2a28-fed7-44c8-b9a9-bd9acdd5ec31.mp4'

const techStackLogos: LogoItem[] = [
  { node: <span className={styles.techLogoPill}><img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/react/react-original.svg" alt="React" /><span>React</span></span>, title: 'React' },
  { node: <span className={styles.techLogoPill}><img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/typescript/typescript-original.svg" alt="TypeScript" /><span>TypeScript</span></span>, title: 'TypeScript' },
  { node: <span className={styles.techLogoPill}><img src="https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/vitejs/vitejs-original.svg" alt="Vite" /><span>Vite</span></span>, title: 'Vite' },
  { node: <span className={styles.techLogoPill}><img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/antdesign/antdesign-original.svg" alt="Ant Design" /><span>Ant Design</span></span>, title: 'Ant Design' },
  { node: <span className={styles.techLogoPill}><img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/redux/redux-original.svg" alt="Redux" /><span>Redux</span></span>, title: 'Redux' },
  { node: <span className={styles.techLogoPill}><img src="https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/tailwindcss/tailwindcss-original.svg" alt="Tailwind CSS" /><span>Tailwind CSS</span></span>, title: 'Tailwind CSS' },
  { node: <span className={styles.techLogoPill}><img src="https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/axios/axios-plain.svg" alt="Axios" /><span>Axios</span></span>, title: 'Axios' },
  { node: <span className={styles.techLogoPill}><img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/threejs/threejs-original.svg" alt="Three.js" /><span>Three.js</span></span>, title: 'Three.js' },
  { node: <span className={styles.techLogoPill}><img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/nodejs/nodejs-original.svg" alt="Node.js" /><span>Node.js</span></span>, title: 'Node.js' },
  { node: <span className={styles.techLogoPill}><img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/express/express-original.svg" alt="Express" /><span>Express</span></span>, title: 'Express' },
  { node: <span className={styles.techLogoPill}><img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/mysql/mysql-original.svg" alt="MySQL" /><span>MySQL</span></span>, title: 'MySQL' },
  { node: <span className={styles.techLogoPill}><img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/redis/redis-original.svg" alt="Redis" /><span>Redis</span></span>, title: 'Redis' },
  { node: <span className={styles.techLogoPill}><img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/git/git-original.svg" alt="Git" /><span>Git</span></span>, title: 'Git' },
  { node: <span className={styles.techLogoPill}><img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/npm/npm-original-wordmark.svg" alt="npm" /><span>npm</span></span>, title: 'npm' },
  { node: <span className={styles.techLogoPill}><img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/less/less-plain-wordmark.svg" alt="Less" /><span>Less</span></span>, title: 'Less' },
]

const fallingText = '就业 竞赛 项目 实习 课程 前途 简历 成长 AI 时间规划 基础薄弱 规划 资源 焦虑 方向选择 考研 学习路线 知识节点 实践任务 经验 考公'

const fallingContent = `
你站在大学这座星球的边缘
面前是未知的星空
未知、恐惧、焦虑、迷茫
有人把它们看成迷雾
有人把它们看成风暴
而我们想做的
是替你点亮一条会发光的航线
把散落的念头接成路径
把犹豫的瞬间变成下一步行动
`

const stats = [
  { value: 1000, icon: '+', label: '知识节点', description: '覆盖技能、课程、项目、竞赛、求职等关键主题' },
  { value: 50, icon: '+', label: '精选路线', description: '从入门到进阶的阶段化成长方案' },
  { value: 10, icon: 'k+', label: '加入社区', description: '来自不同方向的学习者与创作者' },
]

const ScrollReveal: React.FC<{ children: React.ReactNode; className?: string; delay?: number }> = ({
  children,
  className = '',
  delay = 0
}) => {
  const [isVisible, setIsVisible] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting)
      },
      {
        threshold: 0.14,
        rootMargin: '-40px 0px'
      }
    )

    const currentRef = ref.current

    if (currentRef) {
      observer.observe(currentRef)
    }

    return () => {
      if (currentRef) observer.unobserve(currentRef)
    }
  }, [])

  return (
    <div
      ref={ref}
      className={`${className} ${isVisible ? styles.visible : styles.hidden}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  )
}

const Welcome: React.FC = () => {
  const handleStart = () => {
    window.scrollBy({
      top: window.innerHeight * 1.1,
      behavior: 'smooth'
    })
  }

  return (
    <div className={styles.container}>
      <section className={styles.heroSection}>
        <video
          className={styles.heroVideo}
          src={heroVideoUrl}
          autoPlay
          loop
          muted
          playsInline
          aria-hidden="true"
        />
        <div className={styles.heroContent}>
          <h1 className={styles.heroTitle}>
            穿过信息迷雾  <em>看见你的成长</em>
          </h1>
          <p className={styles.heroSubtitle}>
            Knowvai 连接知识节点、学习路线、真实经验与 AI 规划，让大学成长不再依赖运气，而是拥有清晰的下一步。
          </p>
          <div className={styles.heroActions}>
            <button className={`${styles.ctaButton} ${styles.heroCtaButton}`} onClick={handleStart}>
              拨开迷雾
            </button>
          </div>
        </div>
      </section>

      <main className={styles.scrollContent}>
        <section className={`${styles.section} ${styles.techSection}`}>
          <div className={styles.techStackWrapper}>
            <LogoLoop
              logos={techStackLogos}
              speed={48}
              direction="left"
              logoHeight={32}
              gap={14}
              hoverSpeed={16}
              ariaLabel="Knowvai 技术栈"
            />
          </div>
        </section>

        <section className={`${styles.section} ${styles.featureSection}`}>
          <ScrollReveal>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>为什么选择 Knowvai</h2>
              <p className={styles.sectionDesc}>把分散的信息，变成一条能被理解、执行和持续更新的成长路径</p>
            </div>
          </ScrollReveal>

          <div className={styles.featureFlex}>
            <div className={styles.featureContent}>
              <BlurText
                text={fallingContent}
                className={styles.featureEssay}
                animateBy="words"
                direction="bottom"
                delay={20}
                stepDuration={0.42}
                rootMargin="-80px"
              />
            </div>
            <div className={styles.featureFallingText}>
              <FallingText
                text={fallingText}
                highlightWords={["实习", "就业", "考研", "考公", "面试", "简历", "成长", "规划", "焦虑"]}
                highlightClass="highlighted"
                trigger="hover"
                backgroundColor="transparent"
                wireframes={false}
                gravity={0.56}
                fontSize="2rem"
                mouseConstraintStiffness={0.9}
              />
            </div>
          </div>
        </section>

        <section className={`${styles.section} ${styles.statsSection}`}>
          <ScrollReveal>
            <div className={styles.statsIntro}>
              <h2 className={styles.sectionTitle}>知识正在被重新组织</h2>
              <p className={styles.sectionDesc}>从孤立的信息，到可执行的路径</p>
            </div>
          </ScrollReveal>
          <div className={styles.statsGrid}>
            {stats.map((item, index) => (
              <ScrollReveal key={item.label} delay={index * 120} className={styles.statItem}>
                <CountUp
                  from={0}
                  to={item.value}
                  separator=","
                  direction="up"
                  duration={1}
                  className={styles.statNumber}
                  delay={0}
                />
                <span className={styles.statNumber}>{item.icon}</span>
                <div className={styles.statLabel}>{item.label}</div>
                <p>{item.description}</p>
              </ScrollReveal>
            ))}
          </div>
        </section>

        <section className={`${styles.section} ${styles.growthSection}`}>
          <ScrollReveal>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>你的成长轨迹</h2>
              <p className={styles.sectionDesc}>被看见的成长，从探索到收获</p>
            </div>
          </ScrollReveal>

          <div className={styles.timeline}>
            <DomeGallery
              fit={0.5}
              minRadius={600}
              maxVerticalRotationDeg={0}
              segments={34}
              dragDampening={2}
              grayscale={false}
              overlayBlurColor={'#020e18'}
            />
          </div>
        </section>

        <section className={`${styles.section} ${styles.ctaSection}`}>
          <ScrollReveal>
            <h2>准备好踏上旅程了吗</h2>
            <p>从一条清晰路线开始，把模糊的目标变成今天就能行动的下一步</p>
            <button className={`${styles.ctaButton} ${styles.large}`} onClick={handleStart}>
              开启你的旅程 <ArrowRightOutlined />
            </button>
          </ScrollReveal>
        </section>
      </main>
    </div >
  )
}

export default Welcome

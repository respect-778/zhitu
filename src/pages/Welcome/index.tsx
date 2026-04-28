import type React from 'react'
import { useRef, useEffect, useState } from 'react'
import {
  CompassOutlined,
  TeamOutlined,
  RobotOutlined,
  ReadOutlined,
  UserOutlined,
  LikeOutlined,
  ArrowRightOutlined,
  BulbOutlined,
  RocketOutlined
} from '@ant-design/icons'
import LogoLoop from '../../components/LogoLoop/LogoLoop'
import TextPressure from '../../components/TextPressure/TextPressure'
import TextType from '../../components/TextType/TextType'
import type { LogoItem } from '../../components/LogoLoop/LogoLoop'
import Galaxy from '../../components/Galaxy/Galaxy'
import styles from './index.module.less'

// --- Tech Stack Logos ---
const techStackLogos: LogoItem[] = [
  { node: <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/react/react-original.svg" width="52" height="52" alt="React" />, title: 'React' },
  { node: <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/typescript/typescript-original.svg" width="52" height="52" alt="TypeScript" />, title: 'TypeScript' },
  { node: <img src="https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/vitejs/vitejs-original.svg" width="52" height="52" alt="Vite" />, title: 'Vite' },
  { node: <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/antdesign/antdesign-original.svg" width="52" height="52" alt="Ant Design" />, title: 'Ant Design' },
  { node: <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/redux/redux-original.svg" width="52" height="52" alt="Redux" />, title: 'Redux' },
  { node: <img src="https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/tailwindcss/tailwindcss-original.svg" width="52" height="52" alt="TailwindCSS" />, title: 'TailwindCSS' },
  { node: <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/nodejs/nodejs-original.svg" width="52" height="52" alt="Node.js" />, title: 'Node.js' },
  { node: <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/mysql/mysql-original.svg" width="52" height="52" alt="MySQL" />, title: 'MySQL' },
  { node: <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/redis/redis-original.svg" width="52" height="52" alt="Redis" />, title: 'Redis' },
  { node: <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/threejs/threejs-original.svg" width="52" height="52" alt="Three.js" style={{ filter: 'invert(1)' }} />, title: 'Three.js' },
  { node: <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/express/express-original.svg" width="52" height="52" alt="Express" style={{ filter: 'invert(1)' }} />, title: 'Express' },
]



// --- Scroll Reveal Component ---
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
        threshold: 0.1,
        rootMargin: '-50px 0px'
      }
    )

    if (ref.current) {
      observer.observe(ref.current)
    }

    return () => {
      if (ref.current) observer.unobserve(ref.current)
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

// --- Main Welcome Component ---
const Welcome: React.FC = () => {
  const handleStart = () => {
    window.scrollBy({
      top: window.innerHeight * 0.8,
      behavior: 'smooth'
    })
  }

  return (
    <div className={styles.container}>
      {/* Fixed Background for the whole page */}
      <div className={styles.fixedBackground}>
        <Galaxy
          mouseRepulsion={true}
          mouseInteraction={true}
          density={1.5}
          glowIntensity={0.4}
          saturation={0.3}
          hueShift={220}
          transparent={false}
        />
      </div>

      {/* Hero Section */}
      <section className={styles.heroSection}>
        <div className={styles.heroContent}>
          <h1 className={styles.heroTitle}>Knowvia</h1>
          <TextType
            text={["打破信息壁垒，连接知识孤岛", "消除信息差，规划成长路径", "让每一步都走在正确的方向上"]}
            className={styles.heroSubtitle}
            typingSpeed={75}
            pauseDuration={1500}
            showCursor={true}
            cursorCharacter="|"
          />
          <div className={styles.heroActions}>
            <button className={styles.ctaButton} onClick={handleStart}>
              开启你的旅程
              <ArrowRightOutlined />
            </button>
            <button className={styles.secondaryButton} onClick={handleStart}>
              了解更多
            </button>
          </div>
        </div>
      </section>

      {/* Main Scroll Content */}
      <div className={styles.scrollContent}>

        {/* Tech Stack */}
        <section className={styles.section}>
          <ScrollReveal>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>技术栈</h2>
              <p className={styles.sectionDesc}>背后的技术力量</p>
            </div>
          </ScrollReveal>
          <ScrollReveal delay={100}>
            <div className={styles.techStackWrapper}>
              <LogoLoop
                logos={techStackLogos}
                speed={60}
                direction="left"
                logoHeight={52}
                gap={72}
                hoverSpeed={15}
                scaleOnHover
                ariaLabel="知途技术栈"
              />
            </div>
          </ScrollReveal>
        </section>

        {/* Core Features - Bento Grid */}
        <section className={styles.section}>
          <ScrollReveal>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>为什么选择知途？</h2>
              <p className={styles.sectionDesc}>三大核心模块，覆盖你大学成长的每个阶段。</p>
            </div>
          </ScrollReveal>

          <div className={styles.bentoGrid}>
            <ScrollReveal delay={100} className={`${styles.bentoCard} ${styles.bentoLarge}`}>
              <div className={styles.bentoIcon}><CompassOutlined /></div>
              <h3>清晰路标</h3>
              <p>拒绝迷茫，为你规划最合理的大学成长路径。AI 驱动的个性化路线推荐，让你的每一步都有据可循。</p>
              <div className={styles.bentoGlow}></div>
            </ScrollReveal>

            <ScrollReveal delay={200} className={styles.bentoCard}>
              <div className={styles.bentoIcon}><TeamOutlined /></div>
              <h3>高质量圈层</h3>
              <p>汇聚志同道合的道友，不仅是学习，更是链接。</p>
              <div className={styles.bentoGlow}></div>
            </ScrollReveal>

            <ScrollReveal delay={300} className={styles.bentoCard}>
              <div className={styles.bentoIcon}><RobotOutlined /></div>
              <h3>AI 赋能</h3>
              <p>智能分析你的技能树，定制专属提升方案。</p>
              <div className={styles.bentoGlow}></div>
            </ScrollReveal>
          </div>
        </section>

        {/* Statistics Section */}
        <section className={styles.section}>
          <ScrollReveal>
            <div className={styles.statsContainer}>
              <div className={styles.statItem}>
                <div className={styles.statNumber}>1000+</div>
                <div className={styles.statLabel}>知识节点</div>
              </div>
              <div className={styles.statDivider}></div>
              <div className={styles.statItem}>
                <div className={styles.statNumber}>50+</div>
                <div className={styles.statLabel}>精选路线</div>
              </div>
              <div className={styles.statDivider}></div>
              <div className={styles.statItem}>
                <div className={styles.statNumber}>10k+</div>
                <div className={styles.statLabel}>活跃道友</div>
              </div>
            </div>
          </ScrollReveal>
        </section>

        {/* Learning Path Preview */}
        <section className={styles.section}>
          <ScrollReveal>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>你的成长轨迹</h2>
              <p className={styles.sectionDesc}>四年规划，步步为营，从探索到收获。</p>
            </div>
          </ScrollReveal>

          <div className={styles.timeline}>
            <ScrollReveal delay={100} className={styles.timelineItem}>
              <div className={styles.timelineMarker}>
                <div className={styles.timelineIcon}><ReadOutlined /></div>
                <span className={styles.timelineYear}>Year 1</span>
              </div>
              <div className={styles.timelineContent}>
                <h3>大一：探索期</h3>
                <p>广泛涉猎，发现兴趣，建立基础认知。</p>
              </div>
            </ScrollReveal>
            <ScrollReveal delay={200} className={styles.timelineItem}>
              <div className={styles.timelineMarker}>
                <div className={styles.timelineIcon}><BulbOutlined /></div>
                <span className={styles.timelineYear}>Year 2</span>
              </div>
              <div className={styles.timelineContent}>
                <h3>大二：深耕期</h3>
                <p>选定方向，系统学习，参与初步实践。</p>
              </div>
            </ScrollReveal>
            <ScrollReveal delay={300} className={styles.timelineItem}>
              <div className={styles.timelineMarker}>
                <div className={styles.timelineIcon}><RocketOutlined /></div>
                <span className={styles.timelineYear}>Year 3</span>
              </div>
              <div className={styles.timelineContent}>
                <h3>大三：爆发期</h3>
                <p>项目实战，实习历练，技能转化为能力。</p>
              </div>
            </ScrollReveal>
            <ScrollReveal delay={400} className={styles.timelineItem}>
              <div className={styles.timelineMarker}>
                <div className={styles.timelineIcon}><UserOutlined /></div>
                <span className={styles.timelineYear}>Year 4</span>
              </div>
              <div className={styles.timelineContent}>
                <h3>大四：收获期</h3>
                <p>求职/考研，从容应对，迈向职业生涯。</p>
              </div>
            </ScrollReveal>
          </div>
        </section>

        {/* Community Preview */}
        <section className={styles.section}>
          <ScrollReveal>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>加入道友圈</h2>
              <p className={styles.sectionDesc}>听听已经在路上的人怎么说。</p>
            </div>
          </ScrollReveal>

          <div className={styles.communityPreview}>
            <ScrollReveal delay={100} className={styles.communityCard}>
              <div className={styles.quoteIcon}>"</div>
              <p className={styles.cardBody}>知途的路线图太清晰了，让我少走了很多弯路！强烈推荐给每一位迷茫的同学。</p>
              <div className={styles.cardFooterRow}>
                <div className={styles.cardHeader}>
                  <div className={styles.avatar}>A</div>
                  <div>
                    <div className={styles.name}>Alex</div>
                    <div className={styles.role}>前端架构师</div>
                  </div>
                </div>
                <div className={styles.cardFooter}><LikeOutlined /> 128</div>
              </div>
            </ScrollReveal>

            <ScrollReveal delay={200} className={styles.communityCard}>
              <div className={styles.quoteIcon}>"</div>
              <p className={styles.cardBody}>在这里找到了很多志同道合的伙伴，一起打卡进步，比自己闷头学效率高太多了。</p>
              <div className={styles.cardFooterRow}>
                <div className={styles.cardHeader}>
                  <div className={styles.avatar} style={{ background: '#87d068' }}>B</div>
                  <div>
                    <div className={styles.name}>Bella</div>
                    <div className={styles.role}>产品经理</div>
                  </div>
                </div>
                <div className={styles.cardFooter}><LikeOutlined /> 256</div>
              </div>
            </ScrollReveal>

            <ScrollReveal delay={300} className={styles.communityCard}>
              <div className={styles.quoteIcon}>"</div>
              <p className={styles.cardBody}>AI 摘要功能太赞了，社区帖子一键总结，节省了大量筛选信息的时间。</p>
              <div className={styles.cardFooterRow}>
                <div className={styles.cardHeader}>
                  <div className={styles.avatar} style={{ background: '#faad14' }}>C</div>
                  <div>
                    <div className={styles.name}>Charlie</div>
                    <div className={styles.role}>全栈工程师</div>
                  </div>
                </div>
                <div className={styles.cardFooter}><LikeOutlined /> 192</div>
              </div>
            </ScrollReveal>
          </div>
        </section>

        {/* Final CTA */}
        <section className={`${styles.section} ${styles.ctaSection}`}>
          <ScrollReveal>
            <h2>准备好开始了吗？</h2>
            <p>立即加入知途，开启你的无限可能。</p>
            <button className={`${styles.ctaButton} ${styles.large}`}>
              加入知途 <ArrowRightOutlined />
            </button>
          </ScrollReveal>
        </section>
      </div>
    </div>
  )
}

export default Welcome

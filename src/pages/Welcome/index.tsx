import type React from 'react'
import { useRef, useEffect, useState, useMemo } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Points, PointMaterial } from '@react-three/drei'
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
import styles from './index.module.less'
import * as THREE from 'three'

// --- Starry Sky Components ---
const spherePositions = (() => {
  const temp = new Float32Array(5000 * 3)
  for (let i = 0; i < 5000; i++) {
    const theta = 2 * Math.PI * Math.random()
    const phi = Math.acos(2 * Math.random() - 1)
    const r = 1.5 + Math.random()

    const x = r * Math.sin(phi) * Math.cos(theta)
    const y = r * Math.sin(phi) * Math.sin(theta)
    const z = r * Math.cos(phi)

    temp[i * 3] = x
    temp[i * 3 + 1] = y
    temp[i * 3 + 2] = z
  }
  return temp
})()

type StarsProps = Omit<React.ComponentProps<typeof Points>, 'positions' | 'stride'>

const Stars = (props: StarsProps) => {
  const ref = useRef<THREE.Points>(null!)

  useFrame((_, delta) => {
    if (ref.current) {
      ref.current.rotation.x -= delta / 10
      ref.current.rotation.y -= delta / 15
    }
  })

  return (
    <group rotation={[0, 0, Math.PI / 4]}>
      <Points ref={ref} positions={spherePositions} stride={3} frustumCulled={false} {...props}>
        <PointMaterial
          transparent
          color="#1677ff"
          size={0.005}
          sizeAttenuation={true}
          depthWrite={false}
        />
      </Points>
    </group>
  )
}

// --- Meteor Component ---
const Meteor = () => {
  const mesh = useRef<THREE.Mesh>(null!)
  // Random starting position
  const [position] = useState(() => {
    const x = (Math.random() - 0.5) * 10
    const y = Math.random() * 5 + 2 // Start above
    const z = (Math.random() - 0.5) * 5
    return new THREE.Vector3(x, y, z)
  })

  // Random speed and size
  const speed = useMemo(() => 0.05 + Math.random() * 0.1, [])
  const length = useMemo(() => 0.5 + Math.random() * 0.5, [])

  useFrame(() => {
    if (mesh.current) {
      mesh.current.position.x -= speed
      mesh.current.position.y -= speed

      // Reset if out of view
      if (mesh.current.position.y < -3) {
        mesh.current.position.y = Math.random() * 5 + 3
        mesh.current.position.x = (Math.random() - 0.5) * 10 + 2
      }
    }
  })

  return (
    <mesh ref={mesh} position={position} rotation={[0, 0, Math.PI / 4]}>
      <cylinderGeometry args={[0.005, 0.005, length, 8]} />
      <meshBasicMaterial color="white" transparent opacity={0.6} />
    </mesh>
  )
}

const Meteors = () => {
  return (
    <group>
      {/* Create 15 meteors */}
      {Array.from({ length: 15 }).map((_, i) => (
        <Meteor key={i} />
      ))}
    </group>
  )
}

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
    // Scroll down slightly
    window.scrollBy({
      top: window.innerHeight * 0.8,
      behavior: 'smooth'
    })
  }

  return (
    <div className={styles.container}>
      {/* Fixed Background for the whole page */}
      <div className={styles.fixedBackground}>
        <Canvas camera={{ position: [0, 0, 1] }}>
          <Stars />
        </Canvas>
      </div>

      {/* Hero Section */}
      <section className={styles.heroSection}>
        <div className={styles.heroContent}>
          <h1 className={styles.heroTitle}>知途 Zhitu</h1>
          <p className={styles.heroSubtitle}>
            打破信息壁垒，连接知识孤岛。<br />
            专为大学生打造的信息差消除平台。
          </p>
          <button className={styles.ctaButton} onClick={handleStart}>
            开启你的旅程
          </button>
        </div>

        <div className={styles.scrollIndicator}>
          <span>向下探索</span>
          <div className={styles.arrow}></div>
        </div>
      </section>

      {/* Main Scroll Content */}
      <div className={styles.scrollContent}>

        {/* Core Features */}
        <section className={styles.section}>
          <ScrollReveal>
            <h2 className={styles.sectionTitle}>为什么选择知途？</h2>
          </ScrollReveal>

          <div className={styles.featuresGrid}>
            <ScrollReveal delay={100} className={styles.featureCard}>
              <div className={styles.cardImage}>
                <img src="/images/learning_path.png" alt="Learning Path" />
              </div>
              <div className={styles.cardContent}>
                <div className={styles.icon}><CompassOutlined /></div>
                <h3>清晰路标</h3>
                <p>拒绝迷茫，为你规划最合理的大学成长路径。</p>
              </div>
            </ScrollReveal>

            <ScrollReveal delay={200} className={styles.featureCard}>
              <div className={styles.cardImage}>
                <img src="/images/community.png" alt="Community" />
              </div>
              <div className={styles.cardContent}>
                <div className={styles.icon}><TeamOutlined /></div>
                <h3>高质量圈层</h3>
                <p>汇聚志同道合的道友，不仅是学习，更是链接。</p>
              </div>
            </ScrollReveal>

            <ScrollReveal delay={300} className={styles.featureCard}>
              <div className={styles.cardImage}>
                <img src="/images/ai_assistant.png" alt="AI Assistant" />
              </div>
              <div className={styles.cardContent}>
                <div className={styles.icon}><RobotOutlined /></div>
                <h3>AI 赋能</h3>
                <p>智能分析你的技能树，定制专属提升方案。</p>
              </div>
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
              <div className={styles.statItem}>
                <div className={styles.statNumber}>50+</div>
                <div className={styles.statLabel}>精选路线</div>
              </div>
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
            <h2 className={styles.sectionTitle}>你的成长轨迹</h2>
          </ScrollReveal>

          <div className={styles.timeline}>
            <ScrollReveal delay={100} className={styles.timelineItem}>
              <div className={styles.timelineIcon}><ReadOutlined /></div>
              <div className={styles.timelineContent}>
                <h3>大一：探索期</h3>
                <p>广泛涉猎，发现兴趣，建立基础认知。</p>
              </div>
            </ScrollReveal>
            <ScrollReveal delay={200} className={styles.timelineItem}>
              <div className={styles.timelineIcon}><BulbOutlined /></div>
              <div className={styles.timelineContent}>
                <h3>大二：深耕期</h3>
                <p>选定方向，系统学习，参与初步实践。</p>
              </div>
            </ScrollReveal>
            <ScrollReveal delay={300} className={styles.timelineItem}>
              <div className={styles.timelineIcon}><RocketOutlined /></div>
              <div className={styles.timelineContent}>
                <h3>大三：爆发期</h3>
                <p>项目实战，实习历练，技能转化为能力。</p>
              </div>
            </ScrollReveal>
            <ScrollReveal delay={400} className={styles.timelineItem}>
              <div className={styles.timelineIcon}><UserOutlined /></div>
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
            <h2 className={styles.sectionTitle}>加入道友圈</h2>
          </ScrollReveal>

          <div className={styles.communityPreview}>
            <ScrollReveal delay={100} className={styles.communityCard}>
              <div className={styles.cardHeader}>
                <div className={styles.avatar}>A</div>
                <div>
                  <div className={styles.name}>Alex</div>
                  <div className={styles.role}>前端架构师</div>
                </div>
              </div>
              <p className={styles.cardBody}>"知途的路线图太清晰了，让我少走了很多弯路！"</p>
              <div className={styles.cardFooter}><LikeOutlined /> 128</div>
            </ScrollReveal>

            <ScrollReveal delay={200} className={styles.communityCard}>
              <div className={styles.cardHeader}>
                <div className={styles.avatar} style={{ background: '#87d068' }}>B</div>
                <div>
                  <div className={styles.name}>Bella</div>
                  <div className={styles.role}>产品经理</div>
                </div>
              </div>
              <p className={styles.cardBody}>"在这里找到了很多志同道合的伙伴，一起打卡进步。"</p>
              <div className={styles.cardFooter}><LikeOutlined /> 256</div>
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

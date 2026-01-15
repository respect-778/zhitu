import type React from 'react'
import { useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Points, PointMaterial } from '@react-three/drei'
import { CompassOutlined, TeamOutlined, RobotOutlined } from '@ant-design/icons'
import styles from './index.module.less'
import * as THREE from 'three'

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

// 3D Particles Component
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

const Welcome: React.FC = () => {
  return (
    <div className={styles.container}>
      <div className={styles.canvasContainer}>
        <Canvas camera={{ position: [0, 0, 1] }}>
          <Stars />
        </Canvas>
      </div>

      <div className={styles.content}>
        <h1 className={styles.heroTitle}>知途 Zhitu</h1>
        <p className={styles.heroSubtitle}>
          打破信息壁垒，连接知识孤岛。<br />
          专为大学生打造的信息差消除平台。
        </p>
        <button className={styles.ctaButton}>开启你的旅程</button>

        <div className={styles.features}>
          <div className={styles.featureCard}>
            <div className={styles.icon}><CompassOutlined /></div>
            <h3>清晰的学习路线</h3>
            <p>从入门到精通，为你规划最合理的技能树，告别迷茫与弯路。</p>
          </div>
          <div className={styles.featureCard}>
            <div className={styles.icon}><TeamOutlined /></div>
            <h3>高质量道友圈</h3>
            <p>与志同道合的伙伴一起交流，分享经验，共同进步。</p>
          </div>
          <div className={styles.featureCard}>
            <div className={styles.icon}><RobotOutlined /></div>
            <h3>AI 智能辨析</h3>
            <p>利用前沿 AI 技术，为你分析前景，解答疑惑。</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Welcome

import React from 'react';
import { LeftOutlined } from '@ant-design/icons';
import { Outlet, useNavigate } from 'react-router';
import styles from './index.module.less';
import DarkVeil from '@/components/DarkVeil/DarkVeil';

const Login: React.FC = () => {
  const navigate = useNavigate();

  return (
    <main className={styles.page}>
      <section className={styles.shell} aria-label="Knowvia 账号">
        <aside className={styles.brandPanel}>
          <div className={styles.veilBackground}>
            <DarkVeil
              hueShift={35}
              noiseIntensity={0}
              scanlineIntensity={0}
              speed={1}
              scanlineFrequency={0}
              warpAmount={2}
              resolutionScale={1}
            />
          </div>
          <button type="button" className={styles.backButton} onClick={() => navigate('/')}>
            <LeftOutlined />
            返回
          </button>

          <div className={styles.brandCopy}>
            <h1>
              构建更清晰的
              <span>知识路径</span>
            </h1>
            <p>
              连接你的学习记录、社区灵感与 AI 助手，把碎片信息沉淀成可持续成长的知识网络。
            </p>
          </div>
        </aside>

        <section className={styles.formPanel}>
          <Outlet />
        </section>
      </section>
    </main>
  );
};

export default Login;

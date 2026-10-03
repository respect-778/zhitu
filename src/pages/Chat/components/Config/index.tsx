import type { IProvider } from '@/types/chat'
import styles from './index.module.less'
import { Form, Input } from 'antd'
import { LinkOutlined } from '@ant-design/icons'

interface IProps {
  aiProviders: IProvider[] // ai 厂商
  selectedAI: IProvider // 选中的 ai
  setSelectedAI: React.Dispatch<React.SetStateAction<IProvider>> // 更新选中的 ai
  apiKey: string // 输入框中的 apikey
  setApiKey: React.Dispatch<React.SetStateAction<string>> // 更新 apikey
  configuredAI: string // 当前配置好的 ai
}

const Config = ({ aiProviders, selectedAI, setSelectedAI, apiKey, setApiKey, configuredAI }: IProps) => {

  // 处理选中的 ai 厂商
  const handleSelected = (provider: IProvider) => {
    setSelectedAI(provider)
  }


  return (
    <div className={styles.configContainer}>
      <div className={styles.subTitle}>配置新的 AI 模型提供商</div>
      {selectedAI.name === '' ?
        <div className={styles.aiProvider}>
          {aiProviders.map(provider => {
            return (
              <div className={`${styles.content} ${provider.name === configuredAI ? styles.active : ''}`} onClick={() => handleSelected(provider)} key={provider.name}>
                <div className={styles.imgContainer}><img className={styles.img} src={`${provider.img}`} alt="ai" /></div>
                <div className={styles.name}>{provider.name}</div>
              </div>
            )
          })}
        </div>
        :
        <div className={styles.aiConfig}>
          <div className={`${styles.aiDetail} ${selectedAI.name === configuredAI ? styles.active : ''}`}>
            <div className={styles.imgContainer}><img className={styles.img} src={`${selectedAI.img}`} alt="ai" /></div>
            <div>
              <div style={{ fontSize: '16px', fontWeight: '700' }}>{selectedAI.name}</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <div className={styles.providerLink} onClick={() => setSelectedAI({ name: '', img: '' })}>更换提供商</div>
                <div className={styles.divider}></div>
                {selectedAI.docUrl && (
                  <a href={selectedAI.docUrl} target="_blank" rel="noopener noreferrer" className={styles.providerLink}>
                    查看文档 <LinkOutlined />
                  </a>
                )}
              </div>
            </div>
          </div>
          <div className={styles.aiAPIKEY}>
            <div style={{ fontSize: '15px', fontWeight: '700' }}>API 密钥</div>
            <Form>
              <Form.Item name="apiKey" rules={[{ required: true, message: '请输入API密钥' }]}>
                <Input.Password value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder='sk-ant-api01-...' style={{ padding: '10px' }} />
              </Form.Item>
            </Form>
            <div className={styles.hint}>您的 API 密钥存储在本地机器上</div>
          </div>
        </div>
      }
    </div>
  )
}


export default Config

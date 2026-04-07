import type { IProvider } from '@/types/chat'
import styles from './index.module.less'
import { Input } from 'antd'
import { LinkOutlined } from '@ant-design/icons'

interface IProps {
  aiProviders: IProvider[] // ai 厂商
  selectedAI: IProvider // 选中的 ai
  setSelectedAI: React.Dispatch<React.SetStateAction<IProvider>> // 修改选中的 ai
  setApikey: React.Dispatch<React.SetStateAction<string>> // 修改 apikey
}

const Config = ({ aiProviders, selectedAI, setSelectedAI, setApikey }: IProps) => {


  // 处理选中的 ai 厂商
  const handleSelected = (name: string, img: string) => {
    setSelectedAI({ name, img })
  }


  return (
    <div className={styles.configContainer}>
      <div className={styles.subTitle}>配置新的 AI 模型提供商</div>
      {selectedAI.name === '' ?
        <div className={styles.aiProvider}>
          {aiProviders.map(provider => {
            return (
              <div className={styles.content} onClick={() => handleSelected(provider.name, provider.img)} key={provider.name}>
                <div className={styles.imgContainer}><img className={styles.img} src={`${provider.img}`} alt="ai" /></div>
                <div className={styles.name}>{provider.name}</div>
              </div>
            )
          })}
        </div>
        :
        <div className={styles.aiConfig}>
          <div className={styles.aiDetail}>
            <div style={{ padding: '10px', background: '#dddddd69', borderRadius: '10px', lineHeight: '10px' }}><img style={{ height: '25px' }} src={`${selectedAI.img}`} alt="ai" /></div>
            <div>
              <div style={{ fontSize: '16px', fontWeight: '700' }}>{selectedAI.name}</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <div style={{ color: '#6099f7', cursor: 'pointer' }} onClick={() => setSelectedAI({ name: '', img: '' })}>更换提供商</div>
                <div style={{ height: '12px', border: '1px solid #b5b4b4' }}></div>
                <div style={{ color: '#6099f7', cursor: 'pointer' }}>查看文档 <LinkOutlined /></div>
              </div>
            </div>
          </div>
          <div className={styles.aiAPIKEY}>
            <div style={{ fontSize: '15px', fontWeight: '700' }}>API 密钥</div>
            <Input.Password onChange={(e) => setApikey(e.target.value)} placeholder='sk-ant-api01-...' style={{ padding: '10px' }} />
            <div style={{ fontSize: '12px', fontWeight: '350' }}>您的 API 密钥存储在本地机器上</div>
          </div>
        </div>
      }
    </div>
  )
}


export default Config
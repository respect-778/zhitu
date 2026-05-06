import { useEffect, useRef, useState } from 'react'
import { EditOutlined, MailOutlined, SettingOutlined, UserOutlined, PhoneOutlined, ManOutlined, WomanOutlined, CalendarOutlined, BookOutlined, CheckOutlined, CloseOutlined, CameraOutlined, KeyOutlined } from '@ant-design/icons'
import { Input, Select, DatePicker, message, Modal, Button } from 'antd'
import styles from './index.module.less'
import { useAppSelector, useAppDispatch } from '@/store/hooks'
import { getUserInfo } from '@/store/modules/userStore'
import { updateUserInfoAPI } from '@/api/user'
import { useSingleImageUpload } from '@/hooks/useSingleImageUpload'
import dayjs from 'dayjs'
import Config from '@/pages/Chat/components/Config'
import type { IProvider } from '@/types/chat'
import { getAiModelAPI, uploadAiModelAPI } from '@/api/chat'
import { getStore, setStore } from '@/utils/store'

// 标签页列表
const tabList = [
  { key: '1', tab: '账户与身份', icon: <UserOutlined /> },
  { key: '2', tab: 'API Key', icon: <KeyOutlined /> }
]

// 性别映射
const genderMap: Record<number, string> = {
  0: '未设置',
  1: '男',
  2: '女'
}

// 学历选项
const degreeOptions = [
  { label: '未设置', value: '' },
  { label: '高中及以下', value: '高中及以下' },
  { label: '大专', value: '大专' },
  { label: '本科', value: '本科' },
  { label: '硕士', value: '硕士' },
  { label: '博士', value: '博士' },
]

// 模型提供商
const aiProviders: IProvider[] = [
  {
    name: 'Anthropic',
    img: '/imgs/anthropic.png'
  },
  {
    name: 'OpenAI',
    img: '/imgs/openai.png'
  },
  {
    name: 'Google',
    img: '/imgs/gemini-color.png'
  },
  {
    name: 'Moonshot',
    img: '/imgs/moonshot.png'
  },
  {
    name: 'Deepseek',
    img: '/imgs/deepseek-color.png'
  },
  {
    name: 'Qwen',
    img: '/imgs/qwen-color.png'
  },
  {
    name: 'GLM',
    img: '/imgs/zhipu-color.png'
  }
]

// 信息行组件（必须定义在组件外部，避免每次渲染重新创建导致 Input 失焦）
const InfoRow = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) => (
  <div className={styles.infoRow}>
    <div className={styles.infoLabel}>
      <span className={styles.infoIcon}>{icon}</span>
      <span>{label}</span>
    </div>
    <div className={styles.infoValue}>{value}</div>
  </div>
)

const Setting = () => {
  const userInfo = useAppSelector(state => state.user.userInfo)
  const dispatch = useAppDispatch()

  const [isEditing, setIsEditing] = useState(false) // 是否处于编辑状态
  const [isOpenConfig, setIsOpenConfig] = useState(false) // 是否打开API Key配置弹窗
  const [selectedAI, setSelectedAI] = useState<IProvider>({ name: '', img: '' }) // 选择的 ai 厂商
  const [apiKey, setApiKey] = useState('') // API Key
  const [configuredAI, setConfiguredAI] = useState('') // 当前配置好的AI
  const [configLoading, setConfigLoading] = useState(false) // 配置API Key加载状态

  // 表单数据
  const [form, setForm] = useState({
    username: userInfo.data.username,
    mobile: userInfo.data.mobile,
    gender: userInfo.data.gender,
    birthday: userInfo.data.birthday,
    degree: userInfo.data.degree,
  })

  // 图片上传 hook
  const { imgUrl, setImgUrl, handleSingleImg } = useSingleImageUpload()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 更新表单数据
  const handleEdit = () => {
    setForm({
      username: userInfo.data.username,
      mobile: userInfo.data.mobile,
      gender: userInfo.data.gender,
      birthday: userInfo.data.birthday,
      degree: userInfo.data.degree,
    })
    setImgUrl('')
    setIsEditing(true)
  }

  // 取消编辑
  const handleCancel = () => {
    setIsEditing(false)
    setImgUrl('')
  }

  // 更新编辑
  const handleSave = async () => {
    if (!form.username.trim()) {
      message.warning('用户名不能为空')
      return
    }
    try {
      await updateUserInfoAPI({
        ...form,
        ...(imgUrl ? { avatar: imgUrl } : {}),
      })
      await dispatch(getUserInfo())
      message.success('保存成功')
      setIsEditing(false)
    } catch {
      message.error('保存失败')
    }
  }

  // 配置 API Key
  const handleConfig = () => {
    setIsOpenConfig(true)
  }

  // 取消创建 API Key
  const handleConfigCancel = () => {
    setIsOpenConfig(false)
    setSelectedAI({ name: '', img: '' })
    setApiKey('')
  }

  // 获取当前配置的 ai
  const getAiModel = async () => {
    const res = await getAiModelAPI()
    setStore('aiName', res.data.model_version)
    setConfiguredAI(res.data.ai_name)
  }

  // 上传 apikey 到服务器
  const hanldeSelectedAPIKEY = async () => {
    if (!apiKey) {
      message.error("请输入API密钥")
      return
    }

    try {
      setConfigLoading(true)
      const res = await uploadAiModelAPI(selectedAI.name, apiKey)
      setStore('aiName', res.data.model_version)
      setConfigLoading(false)
      message.success("模型配置成功")
      handleConfigCancel()
      getAiModel()
    } catch (error) {
      setConfigLoading(false)
      setApiKey('')
      message.error("API密钥错误")
    }
  }

  // 是否为空内容
  const emptyText = (value: string) => value ? value : <span className={styles.emptyText}>未设置</span>

  // 在组件挂载的时候获取一次当前用户配置的 ai 信息
  useEffect(() => {
    getAiModel()
  }, [])


  return (
    <div className={styles.settingContainer}>
      <div className={styles.page}>
        <div className={styles.left}>
          <div className={styles.title} style={{ fontSize: '16px' }}>
            <div><SettingOutlined /></div>
            <div>设置</div>
          </div>
          <div className={styles.line}></div>
          <div className={styles.tabList}>
            {tabList.map(item => (
              <div key={item.key} className={styles.item}>
                <div className={styles.title}>
                  <div>{item.icon}</div>
                  <div>{item.tab}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className={styles.right}>
          <div className={styles.title} style={{ fontSize: '15px', marginBottom: '30px' }}>
            <div><UserOutlined /></div>
            <div>账号与身份</div>
          </div>
          <div className={styles.content}>
            {/* 账号与身份区域 */}
            <div className={styles.contentContainer}>
              <div className={styles.accountTop}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <div className={styles.contentTitle}>个人资料</div>
                  <div className={styles.contentSubtitle}>管理您的基本账户信息</div>
                </div>
                {!isEditing ? (
                  <div className={styles.editButton} onClick={handleEdit}>
                    <EditOutlined /> 编辑资料
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <div className={styles.cancelButton} onClick={handleCancel}>
                      <CloseOutlined /> 取消
                    </div>
                    <div className={styles.saveButton} onClick={handleSave}>
                      <CheckOutlined /> 保存
                    </div>
                  </div>
                )}
              </div>

              <div className={styles.accountBottom}>
                {/* 头像区域 */}
                <div className={styles.profileHeader}>
                  <div
                    className={styles.avatarWrapper}
                    onClick={() => isEditing && fileInputRef.current?.click()}
                  >
                    <img
                      className={styles.avatar}
                      src={imgUrl || userInfo.data.avatar || './imgs/admin.png'}
                      draggable={false}
                      referrerPolicy="no-referrer"
                      alt="头像"
                    />
                    {isEditing && (
                      <div className={styles.avatarOverlay}>
                        <CameraOutlined />
                        <span>更换头像</span>
                      </div>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={handleSingleImg}
                    />
                  </div>
                  <div className={styles.profileBrief}>
                    <div className={styles.lgContent}>{userInfo.data.username}</div>
                    <div className={styles.smContent}><MailOutlined /> {userInfo.data.email}</div>
                  </div>
                </div>

                <div className={styles.divider}></div>

                {/* 详细信息 */}
                <div className={styles.infoList}>
                  <InfoRow
                    icon={<UserOutlined />}
                    label="用户名"
                    value={
                      isEditing
                        ? <Input
                          size="small"
                          value={form.username}
                          onChange={e => setForm({ ...form, username: e.target.value })}
                          placeholder="请输入用户名"
                          className={styles.editInput}
                        />
                        : emptyText(userInfo.data.username)
                    }
                  />
                  <InfoRow
                    icon={<MailOutlined />}
                    label="邮箱"
                    value={emptyText(userInfo.data.email)}
                  />
                  <InfoRow
                    icon={<PhoneOutlined />}
                    label="手机号"
                    value={
                      isEditing
                        ? <Input
                          size="small"
                          value={form.mobile}
                          onChange={e => setForm({ ...form, mobile: e.target.value })}
                          placeholder="请输入手机号"
                          className={styles.editInput}
                        />
                        : emptyText(userInfo.data.mobile)
                    }
                  />
                  <InfoRow
                    icon={userInfo.data.gender === 2 ? <WomanOutlined /> : <ManOutlined />}
                    label="性别"
                    value={
                      isEditing
                        ? <Select
                          size="small"
                          value={form.gender}
                          onChange={val => setForm({ ...form, gender: val })}
                          className={styles.editSelect}
                          options={[
                            { label: '未设置', value: 0 },
                            { label: '男', value: 1 },
                            { label: '女', value: 2 },
                          ]}
                        />
                        : <span>{genderMap[userInfo.data.gender] || <span className={styles.emptyText}>未设置</span>}</span>
                    }
                  />
                  <InfoRow
                    icon={<CalendarOutlined />}
                    label="生日"
                    value={
                      isEditing
                        ? <DatePicker
                          size="small"
                          value={form.birthday ? dayjs(form.birthday) : null}
                          onChange={(_, dateStr) => setForm({ ...form, birthday: dateStr as string })}
                          placeholder="请选择生日"
                          className={styles.editInput}
                        />
                        : emptyText(userInfo.data.birthday ? dayjs(userInfo.data.birthday).format('YYYY-MM-DD') : '')
                    }
                  />
                  <InfoRow
                    icon={<BookOutlined />}
                    label="学历"
                    value={
                      isEditing
                        ? <Select
                          size="small"
                          value={form.degree}
                          onChange={val => setForm({ ...form, degree: val })}
                          className={styles.editSelect}
                          options={degreeOptions}
                          placeholder="请选择学历"
                        />
                        : emptyText(userInfo.data.degree)
                    }
                  />
                </div>
              </div>
            </div>

            {/* API Key 区域 */}
            <div className={styles.contentContainer}>
              <div className={styles.keyTop}>
                <div className={styles.contentTitle}>API Key</div>
                <div className={styles.contentSubtitle}>管理您的 API Key</div>
              </div>
              <div className={styles.keyBottom}>
                <div className={styles.apikeyConfig} onClick={handleConfig}><KeyOutlined /> 创建 API Key</div>
                {getStore('aiName') ? <div className={styles.smContent}>当前配置：{getStore('aiName')}</div> : <div className={styles.smContent}>未配置</div>}
              </div>
            </div>
          </div>
        </div>
      </div>

      <Modal
        title="添加 AI 提供商"
        open={isOpenConfig}
        onCancel={handleConfigCancel}
        footer={
          selectedAI.name !== '' ?
            <Button key="add" type="primary" loading={configLoading} onClick={hanldeSelectedAPIKEY}>添加提供商</Button>
            :
            null
        }
        centered={true}
      >
        <Config aiProviders={aiProviders} selectedAI={selectedAI} setSelectedAI={setSelectedAI} apiKey={apiKey} setApiKey={setApiKey} configuredAI={configuredAI} />
      </Modal>
    </div >
  )
}

export default Setting
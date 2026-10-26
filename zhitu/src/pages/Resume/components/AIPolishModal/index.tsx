import type React from 'react'
import { useEffect, useRef, useState } from 'react'
import { Button, Input, Modal, Spin, message } from 'antd'
import { SignatureOutlined } from '@ant-design/icons'
import { polishContentAPI } from '@/api/chat'
import styles from './index.module.less'

const { TextArea } = Input

// 弹窗只负责发起润色、展示结果；真正写回 Redux 交给父组件处理。
interface AIPolishModalProps {
  open: boolean
  content: string
  fieldType: string
  onClose: () => void
  onApply: (value: string) => void
}

// 处理错误信息，优先取后端返回的错误信息。
const getErrorMessage = (error: unknown): string => {
  const messageText = (error as { response?: { data?: { message?: unknown } } }).response?.data?.message
  if (typeof messageText === 'string' && messageText.trim()) return messageText

  return 'AI 润色失败，请检查是否已配置 AI 模型'
}

const AIPolishModal: React.FC<AIPolishModalProps> = ({
  open,
  content,
  fieldType,
  onClose,
  onApply,
}) => {
  const [sourceContent, setSourceContent] = useState(content)
  const [polishedContent, setPolishedContent] = useState('')
  const [isPolishing, setIsPolishing] = useState(false)
  // 标记当前请求，避免关闭弹窗或切换字段后旧响应覆盖新内容。
  const requestIdRef = useRef(0)

  useEffect(() => {
    // 每次打开或切换字段时，重置右侧结果和 loading 状态。
    requestIdRef.current += 1
    if (open) {
      setSourceContent(content)
      setPolishedContent('')
      setIsPolishing(false)
    }
  }, [open, content, fieldType])

  // 开始润色
  const handlePolish = async () => {
    // 开始润色：进入 loading，等待后端一次性返回完整文本。
    if (!sourceContent.trim()) {
      message.warning('当前内容为空，无法润色')
      return
    }

    setIsPolishing(true)
    setPolishedContent('')
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId

    try {
      const response = await polishContentAPI(sourceContent, fieldType)
      const nextContent = typeof response.data === 'string'
        ? response.data
        : response.data?.content || ''

      if (requestId !== requestIdRef.current) return
      if (!nextContent.trim()) {
        message.warning('AI 没有返回可用内容')
        return
      }

      setPolishedContent(nextContent)
    } catch (error) {
      if (requestId !== requestIdRef.current) return
      message.error(getErrorMessage(error))
    } finally {
      if (requestId === requestIdRef.current) {
        setIsPolishing(false)
      }
    }
  }

  // 保留润色结果
  const handleApply = () => {
    // 保留结果：把用户可编辑后的最终文本交给父组件写回简历。
    if (!polishedContent.trim()) {
      message.warning('请先生成或填写润色结果')
      return
    }

    onApply(polishedContent)
    message.success('已保留润色结果')
  }

  return (
    <Modal
      title="AI 内容润色"
      open={open}
      onCancel={onClose}
      width={760}
      footer={null}
      destroyOnClose
      centered
    >
      <div className={styles.polishBody}>
        <div className={styles.polishCol}>
          <div className={styles.polishLabel}>原始内容</div>
          <TextArea
            className={styles.polishTextarea}
            value={sourceContent}
            onChange={(e) => setSourceContent(e.target.value)}
            rows={16}
          />
        </div>

        <div className={styles.polishCol}>
          <div className={styles.polishLabel}>AI 润色结果</div>
          {isPolishing ? (
            <div className={styles.polishLoading}>
              <Spin tip="AI 正在润色中...">
                <div className={styles.loadingSkeleton}>
                  <span />
                  <span />
                  <span />
                  <span />
                </div>
              </Spin>
            </div>
          ) : (
            <TextArea
              className={styles.polishTextarea}
              value={polishedContent}
              onChange={event => setPolishedContent(event.target.value)}
              rows={16}
              placeholder="点击下方按钮开始 AI 润色"
            />
          )}
        </div>
      </div>

      <div className={styles.polishFooter}>
        <Button onClick={handlePolish} loading={isPolishing} icon={<SignatureOutlined />}>
          开始润色
        </Button>
        <Button type="primary" disabled={!polishedContent.trim() || isPolishing} onClick={handleApply}>
          保留
        </Button>
      </div>
    </Modal>
  )
}

export default AIPolishModal

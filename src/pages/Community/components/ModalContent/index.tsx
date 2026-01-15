import { Form, Modal, Input, Upload, message } from "antd"
import type { IContent, INavItems } from "@/types/community"
import styles from './index.module.less'
import { PlusOutlined, PictureOutlined, VideoCameraOutlined, LinkOutlined } from "@ant-design/icons"
import { useState } from "react"
import type { UploadFile } from "antd/lib"
import { useForm } from "antd/es/form/Form"
import { addCommunityAPI, uploadImageAPI } from "@/api/community"
import { useAppSelector } from "@/store/hooks"
import { formatDateTime } from "@/utils/formatDateTime"
import { v4 as uuidv4 } from 'uuid';

interface IModal {
  isModalOpen: boolean
  handleOpen: () => void
  handlePageSize: () => void
}

const ModalContent = ({ isModalOpen, handleOpen, handlePageSize }: IModal) => {

  const modalNav: INavItems[] = [
    { id: 'image', label: '照片', icon: <PictureOutlined /> },
    { id: 'video', label: '视频', icon: <VideoCameraOutlined /> },
    { id: 'link', label: '链接', icon: <LinkOutlined /> },
  ]

  const [fileList, setFileList] = useState<UploadFile[]>([])
  const [videoList, setVideoList] = useState<UploadFile[]>([])
  const [linkValue, setLinkValue] = useState<string>('')
  const [navType, setNavType] = useState<string>('image') // tab类型判断
  const [form] = useForm()

  const handleNavType = (type: string) => {
    setNavType(type)
    setFileList([])
    setVideoList([])
    setLinkValue('')
  }

  // 上传图片/视频/链接
  const userInfo = useAppSelector(state => state.user.userInfo) // 获取用户信息，后续要用到

  const handleOk = async () => {
    await form.validateFields() // 校验表单

    if (navType === 'image') {
      if (fileList.length === 0) {
        message.warning('请至少上传一张图片')
        return
      }
    }

    if (navType === 'image') {
      // 上传图片到后端
      const formData = new FormData()
      fileList.forEach((file) => {
        if (file.originFileObj) {
          formData.append('files', file.originFileObj)
        }
      })

      try {
        // 第一步：上传图片给后端做处理
        const imgs = await uploadImageAPI(formData)
        console.log(imgs)

        // 第二步：发布帖子
        const data: IContent = {
          id: uuidv4(),
          avatar: userInfo.data.photo,
          name: userInfo.data.username,
          time: formatDateTime(JSON.stringify(new Date())),
          content: form.getFieldValue('content'),
          likes: 0,
          comments: 0,
          collection: 0,
          photo: imgs.data.urls,
        }

        const res = await addCommunityAPI(data) // 调用发布接口
        console.log(res)

        handlePageSize() // 刷新界面
      } catch (error) {
        console.log(error)
        message.error('发布失败')
      }
    }

    form.resetFields() // 重置
    setFileList([]) // 滞空图片列表
    handleOpen() // 关闭弹框
  };

  const handleCancel = () => {

    console.log(userInfo)
    form.resetFields() // 重置
    setFileList([]) // 滞空图片列表
    handleOpen() // 关闭弹框
  };

  // 图片上传校验
  const beforeUploadImage = (file: File) => {
    const isJpgOrPng = file.type === 'image/jpeg' || file.type === 'image/png'
    if (!isJpgOrPng) {
      message.error('只能上传 JPG/PNG 格式的图片!')
      return Upload.LIST_IGNORE
    }

    const isLt2M = file.size / 1024 / 1024 < 2
    if (!isLt2M) {
      message.error('图片大小不能超过 2MB!')
      return Upload.LIST_IGNORE
    }
    return false
  }

  // 视频上传校验
  const beforeUploadVideo = (file: File) => {
    const isMp4OrMov =
      file.type === 'video/mp4' || file.type === 'video/quicktime'
    if (!isMp4OrMov) {
      message.error('只能上传 MP4/MOV 格式的视频!')
      return Upload.LIST_IGNORE
    }
    const isLt50M = file.size / 1024 / 1024 < 50
    if (!isLt50M) {
      message.error('视频大小不能超过 50MB!')
      return false
    }
    return true
  }

  return (
    <>
      <Modal
        title="发布帖子"
        open={isModalOpen}
        onOk={handleOk}
        onCancel={handleCancel}
        okText="发布"
        cancelText="取消"
        width={600}
        centered
        className={styles.modalWrapper}
      >
        <div className={styles.modalContainer}>
          {/* 顶部导航栏 */}
          <div className={styles.navBar}>
            {modalNav.map(item => {
              return (
                <div
                  key={item.id}
                  onClick={() => handleNavType(item.id)}
                  className={`${styles.navItem} ${navType === item.id ? styles.activeNav : ''}`}
                >
                  {item.icon}
                  {item.label}
                </div>
              )
            })}
          </div>
          {/* 表单 */}
          <Form form={form} layout="vertical">
            <Form.Item name="content" rules={[{ required: true, message: '分享不能为空哟！' }]}>
              <Input.TextArea
                placeholder="分享您的成神之路..."
                autoSize={{ minRows: 4, maxRows: 8 }}
                className={styles.customTextArea}
              />
            </Form.Item>

            {navType === 'image' && (
              <Form.Item name='image'>
                <div className={styles.uploadArea}>
                  <Upload
                    listType="picture-card"
                    fileList={fileList}
                    onChange={({ fileList }) => setFileList(fileList)}
                    beforeUpload={beforeUploadImage}
                  >
                    {fileList.length >= 9 ? null : (
                      <div className={styles.uploadButton}>
                        <div className={styles.icon}><PlusOutlined /></div>
                        <div className={styles.text}>上传图片</div>
                      </div>
                    )}
                  </Upload>
                </div>
              </Form.Item>
            )}
            {navType === 'video' && (
              <Form.Item name='video'>
                <div className={styles.uploadArea}>
                  <Upload
                    accept=".mp4,.mov"
                    listType="picture-card"
                    fileList={videoList}
                    onChange={({ fileList }) => setVideoList(fileList)}
                    beforeUpload={beforeUploadVideo}
                    maxCount={1}
                  >
                    {videoList.length >= 1 ? null : (
                      <div className={styles.uploadButton}>
                        <div className={styles.icon}><PlusOutlined /></div>
                        <div className={styles.text}>上传视频</div>
                      </div>
                    )}
                  </Upload>
                </div>
              </Form.Item>
            )}
            {navType === 'link' && (
              <Form.Item name='link' rules={[{ required: true, message: '链接不能为空' }]}>
                <Input
                  prefix={<LinkOutlined style={{ color: 'var(--text-secondary)' }} />}
                  placeholder="请输入要分享的链接地址"
                  value={linkValue}
                  onChange={e => setLinkValue(e.target.value)}
                  className={styles.customInput}
                  size="large"
                />
              </Form.Item>
            )}
          </Form>
        </div>
      </Modal>
    </>
  )
}

export default ModalContent

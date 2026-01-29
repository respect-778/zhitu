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
  const [navType, setNavType] = useState<string>('') // tab类型判断
  const [form] = useForm()

  // 处理发帖类型tab
  const handleNavType = (type: string) => {
    setNavType(type)
    setFileList([])
    setVideoList([])
    setLinkValue('')
  }

  // 上传图片/视频/链接
  const userInfo = useAppSelector(state => state.user.userInfo) // 获取用户信息，后续要用到

  // 确定弹框
  const handleOk = async () => {
    let flag = false // 判断是否发布了帖子

    await form.validateFields() // 校验表单

    if (flag === false) {
      // 如果选中图片，用户至少选择一张照片
      if (navType === 'image') {
        if (fileList.length === 0) {
          message.warning('请至少上传一张图片')
          return
        }
      }

      // 对上传图片做处理
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

          // 第二步：发布帖子
          const data: IContent = {
            avatar: userInfo.data.photo,
            name: userInfo.data.username,
            time: formatDateTime(JSON.stringify(new Date())),
            title: form.getFieldValue('title'),
            content: form.getFieldValue('content'),
            likes: 0,
            comments: 0,
            collection: 0,
            photo: imgs.data.urls,
            isLiked: false,
            isCollected: false
          }

          await addCommunityAPI(data) // 调用发布接口
          flag = true
        } catch (error) {
          console.log(error)
          message.error('发布失败')
        }
      }
    }

    if (flag === false) {
      // 当用户没有图片、视频、链接上传时
      const data: IContent = {
        avatar: userInfo.data.photo,
        name: userInfo.data.username,
        time: formatDateTime(JSON.stringify(new Date())),
        title: form.getFieldValue('title'),
        content: form.getFieldValue('content'),
        likes: 0,
        comments: 0,
        collection: 0,
        isLiked: false,
        isCollected: false
      }

      await addCommunityAPI(data) // 调用发布接口
      message.success('发布成功')
    }

    handlePageSize() // 刷新界面
    handleCancel() // 重置
  };

  // 取消弹框
  const handleCancel = () => {
    form.resetFields() // 重置
    setFileList([]) // 滞空图片列表
    setNavType('') // 清空选中类型
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
            {/* 标题 */}
            <Form.Item name="title" rules={[{ required: true, message: '标题不能为空哟！' }]}>
              <div style={{ display: 'flex', alignItems: 'flex-start' }}>
                <div style={{ width: '40px' }}>标题:</div>
                <Input placeholder="起一个响亮的标题！"></Input>
              </div>
            </Form.Item>
            {/* 内容 */}
            <Form.Item name="content" rules={[{ required: true, message: '分享不能为空哟！' }]}>
              <div style={{ display: 'flex', alignItems: 'flex-start' }}>
                <div style={{ width: '40px' }}>内容:</div>
                <Input.TextArea
                  placeholder="分享您的成神之路..."
                  autoSize={{ minRows: 4, maxRows: 8 }}
                />
              </div>
            </Form.Item>
            {/* 图片/视频/链接 */}
            {navType === 'image' && (
              <div>
                <Form.Item name='image'>
                  <div className={styles.uploadArea}>
                    <div style={{ display: 'flex', alignItems: 'flex-start' }}>
                      <div style={{ width: '40px' }}>图片:</div>
                      <Upload
                        listType="picture-card"
                        fileList={fileList}
                        onChange={({ fileList }) => setFileList(fileList)}
                        beforeUpload={beforeUploadImage}
                      >
                        {/* 最多只能上传五张图片 */}
                        {fileList.length < 5 ? (
                          <div className={styles.uploadButton}>
                            <div className={styles.icon}><PlusOutlined /></div>
                            <div className={styles.text}>{fileList.length === 0 ? '上传封面' : '上传图片'}</div>
                          </div>
                        ) : null}
                      </Upload>
                    </div>
                  </div>
                </Form.Item>
                <div style={{ color: 'rgb(199, 199, 201)', display: 'flex' }}>{fileList.length}/5 张图片，最多上传5张，第一张图片将作为封面哟！</div>
              </div>
            )}
            {navType === 'video' && (
              <Form.Item name='video'>
                <div className={styles.uploadArea}>
                  <div style={{ display: 'flex', alignItems: 'flex-start' }}>
                    <div style={{ width: '40px' }}>视频:</div>
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
                </div>
              </Form.Item>
            )}
            {navType === 'link' && (
              <Form.Item name='link' rules={[{ required: true, message: '链接不能为空' }]}>
                <div style={{ display: 'flex', alignItems: 'flex-start' }}>
                  <div style={{ width: '40px' }}>链接:</div>
                  <Input
                    prefix={<LinkOutlined style={{ color: 'var(--text-secondary)' }} />}
                    placeholder="请输入要分享的链接地址"
                    value={linkValue}
                    onChange={e => setLinkValue(e.target.value)}
                    className={styles.customInput}
                    size="large"
                  />
                </div>
              </Form.Item>
            )}
          </Form>
        </div>
      </Modal>
    </>
  )
}

export default ModalContent

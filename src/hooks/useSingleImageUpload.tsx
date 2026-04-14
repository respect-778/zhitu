import { uploadImageAPI } from "@/api/community";
import { message } from "antd";
import { useState, type ChangeEvent } from "react"


export const useSingleImageUpload = () => {

  const [imgUrl, setImgUrl] = useState<string>('') // 当前图片信息

  // 上传 单个照片
  const handleSingleImg = async (e: ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget
    const file = input.files?.[0]

    if (!file) {
      message.error('请选择图片')
      return
    }

    // 验证文件类型
    if (!file.type.startsWith('image/')) {
      message.error('请上传图片文件')
      input.value = ''
      return
    }

    // 与后端上传限制保持一致，避免前端放行后再被服务端拒绝。
    const maxSize = 2 * 1024 * 1024 // 2MB
    if (file.size > maxSize) {
      message.error('文件大小不能超过2MB')
      input.value = ''
      return
    }

    try {
      const formdata = new FormData()
      formdata.append("files", file)

      const res = await uploadImageAPI(formdata)
      const url = res.data.urls?.[0] ?? ""

      if (!url) {
        throw new Error("图片上传失败，服务端未返回可用地址")
      }

      setImgUrl(url)
      message.success('图片上传成功')

    } catch (error) {
      message.error('图片上传失败')
    } finally {
      // 清空 input，允许用户重复选择同一张图片时也能再次触发 onChange。
      input.value = ''
    }
  }


  return {
    imgUrl,
    setImgUrl,
    handleSingleImg
  }
}

// 从本地获取对应 key 的值
export const getStore = (key: string) => {
  return localStorage.getItem(key)
}

// 存对应 key 的值在本地
export const setStore = (key: string, value: string) => {
  return localStorage.setItem(key, value)
}

// 从本地删除对应 key 的值
export const delStore = (key: string) => {
  return localStorage.removeItem(key)
}

// 清空本地对应 key 的值
export const clearStore = () => {
  return localStorage.clear()
}

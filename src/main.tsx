import { createRoot } from 'react-dom/client'
import './index.less'
import './taillwind.css'
import './styles/theme.less'
import "github-markdown-css/github-markdown.css" // bytemd 全局样式
import { RouterProvider } from "react-router"
import router from "./router"
import { Provider } from "react-redux"
import store from "./store"
import { ConfigProvider } from 'antd'
// import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// 创建一个查询客户端 用于查询缓存数据
// const queryClient = new QueryClient()

// Ant Design 主题覆盖，统一使用项目主色
const THEME_TOKEN = { colorPrimary: '#2e5995' }

createRoot(document.getElementById('root')!).render(
  // <QueryClientProvider client={queryClient}>
  <Provider store={store}>
    <ConfigProvider theme={{ token: THEME_TOKEN }}>
      <RouterProvider router={router}></RouterProvider>
    </ConfigProvider>
  </Provider>
  // </QueryClientProvider>
)

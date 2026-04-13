import { createRoot } from 'react-dom/client'
import './index.less'
import './styles/theme.less'
import "github-markdown-css/github-markdown.css" // bytemd 全局样式
import { RouterProvider } from "react-router"
import router from "./router"
import { Provider } from "react-redux"
import store from "./store"
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// 创建一个查询客户端 用于查询缓存数据
const queryClient = new QueryClient()

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}>
    <Provider store={store}>
      <RouterProvider router={router}></RouterProvider>
    </Provider>
  </QueryClientProvider>
)
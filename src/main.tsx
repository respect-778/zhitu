import { createRoot } from 'react-dom/client'
import './index.less'
import './styles/theme.less'
import App from './App.tsx'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// 创建一个查询客户端 用于查询缓存数据
const queryClient = new QueryClient()

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}>
    <App />
  </QueryClientProvider>
)
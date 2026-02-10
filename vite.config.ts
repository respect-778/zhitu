import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  resolve: {
    // 配置别名
    alias: {
      '@': path.resolve(import.meta.dirname, 'src')
    }
  },

  server: {
    // 配置代理
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        // 是否开启代理
        changeOrigin: true,
        // 路径重写，去掉 /api 前缀
        rewrite: (p) => p.replace(/^\/api/, '')
      }
    }
  },

  // 插件
  plugins: [react({
    babel: {
      // 使用 react-compiler 编辑器自动优化项目
      plugins: ['babel-plugin-react-compiler'],
    },
  })],
})

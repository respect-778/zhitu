import { createRoot } from 'react-dom/client'
import './index.less'
import './styles/theme.less'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <App />
)

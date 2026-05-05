import { createBrowserRouter } from "react-router";
import React, { Suspense } from "react";
// 一级路由
import Login from "@/pages/Login";
import OAuthCallback from "@/pages/OAuthCallback";
import NotFound from "@/pages/NotFound";
import Layout from "@/pages/Layout";

// 二级路由（懒加载）
import Welcome from "@/pages/Welcome";
const Path = React.lazy(() => import('@/pages/Path'))
const Community = React.lazy(() => import('@/pages/Community'))
const PublishContent = React.lazy(() => import('@/pages/Community/components/PublishContent'))
const Chat = React.lazy(() => import('@/pages/Chat'))
const DetailContent = React.lazy(() => import('@/pages/Community/components/DetailContent'))
import SummaryAI from "@/pages/Community/components/SummaryAI";
import LoginForm from "@/pages/Login/components/LoginForm";
import Register from "@/pages/Register";

// 三级路由
import ChatId from "@/pages/Chat/components/ChatId";

// 组件
import Loading from "@/components/Loading";
import AuthRouter from "@/components/AuthRouter";
import Setting from "@/pages/Layout/components/Setting";





// 创建浏览器路由
const router = createBrowserRouter([
  // 一级路由
  {
    path: '/',
    element: <AuthRouter><Layout /></AuthRouter>,
    children: [
      // 二级路由
      {
        index: true,
        element: <Welcome />
      },
      {
        path: '/path',
        element: <Suspense fallback={<Loading />}><Path /></Suspense>
      },
      {
        path: '/community',
        element: <Suspense fallback={<Loading />}><Community /></Suspense>
      },
      {
        path: '/chat',
        element: <Suspense fallback={<Loading />}><Chat /></Suspense>,
        children: [
          {
            path: '/chat/:id',
            element: <Suspense fallback={<Loading />}><ChatId /></Suspense>
          }
        ]
      },
      {
        path: '/setting',
        element: <Setting />
      },
    ]
  },
  {
    path: '/community/:id',
    element: <Suspense fallback={<Loading />}><DetailContent /></Suspense>
  },
  {
    path: '/community/:id/summary',
    element: <AuthRouter><Suspense fallback={<Loading />}><SummaryAI /></Suspense></AuthRouter>
  },
  {
    path: '/community/publish',
    element: <AuthRouter><Suspense fallback={<Loading />}><PublishContent /></Suspense></AuthRouter>
  },
  {
    path: '/login',
    element: <Login />,
    children: [
      {
        index: true,
        element: <LoginForm />
      },
      {
        path: 'register',
        element: <Register />
      }
    ]
  },
  {
    path: '/oauth/callback',
    element: <OAuthCallback />
  },
  {
    path: '*',
    element: <NotFound />
  }
])

export default router

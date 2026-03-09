import { createBrowserRouter } from "react-router";
import React, { Suspense } from "react";
// 一级路由
import Login from "@/pages/Login";
import NotFound from "@/pages/NotFound";
import Layout from "@/pages/Layout";
// 二级路由（懒加载）
import Welcome from "@/pages/Welcome";
const Path = React.lazy(() => import('@/pages/Path'))
const Community = React.lazy(() => import('@/pages/Community'))
const PublishContent = React.lazy(() => import('@/pages/Community/components/PublishContent'))
const Chat = React.lazy(() => import('@/pages/Chat'))
const DetailContent = React.lazy(() => import('@/pages/Community/components/DetailContent'))
// 三级路由
import ChatId from "@/pages/Chat/components/ChatId";
import Loading from "@/components/Loading";




const router = createBrowserRouter([
  // 一级路由
  {
    path: '/',
    element: <Layout />,
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
      // {
      //   path: '/community/:id',
      //   element: <Suspense fallback={<Loading />}><DetailContent /></Suspense>
      // },
      {
        path: '/chat',
        element: <Suspense fallback={<Loading />}><Chat /></Suspense>,
        children: [
          {
            path: '/chat/:id',
            element: <Suspense fallback={<Loading />}><ChatId /></Suspense>
          }
        ]
      }
    ]
  },
  {
    path: '/community/:id',
    element: <DetailContent />
  },
  {
    path: '/community/publish',
    element: <PublishContent />
  },
  {
    path: '/login',
    element: <Login />
  },
  {
    path: '*',
    element: <NotFound />
  }
])

export default router

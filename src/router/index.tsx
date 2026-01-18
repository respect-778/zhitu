import { createBrowserRouter } from "react-router";
import Login from "@/pages/Login";
import NotFound from "@/pages/NotFound";
import Layout from "@/pages/Layout";
import Welcome from "@/pages/Welcome";
import Path from "@/pages/Path";
import Community from "@/pages/Community";
import AI from "@/pages/AI";
import DetailContent from "@/pages/Community/components/DetailContent";

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
        element: <Path />
      },
      {
        path: '/community',
        element: <Community />
      },
      {
        path: '/ai',
        element: <AI />
      }
    ]
  },
  {
    path: '/login',
    element: <Login />
  },
  {
    path: '/community/:id',
    element: <DetailContent />
  },
  {
    path: '*',
    element: <NotFound />
  }
])

export default router
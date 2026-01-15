import { createBrowserRouter } from "react-router";
import Login from "@/pages/Login";
import NotFound from "@/pages/NotFound";
import Layout from "@/pages/Layout";
import Welcome from "@/pages/Welcome";
import Path from "@/pages/Path";
import Community from "@/pages/Community";
import AI from "@/pages/AI";

const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
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
    path: '*',
    element: <NotFound />
  }
])

export default router
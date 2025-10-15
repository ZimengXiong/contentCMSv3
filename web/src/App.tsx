import {
  Route,
  RouterProvider,
  createBrowserRouter,
  createRoutesFromElements,
} from 'react-router-dom'
import RootLayout from './pages/RootLayout'
import PostsPage from './pages/PostsPage'
import PostEditorPage from './pages/PostEditorPage'

const router = createBrowserRouter(
  createRoutesFromElements(
    <Route path="/" element={<RootLayout />}>
      <Route index element={<PostsPage />} />
      <Route path="post/:slug" element={<PostEditorPage />} />
      <Route path="*" element={<PostsPage />} />
    </Route>,
  ),
)

export default function App() {
  return <RouterProvider router={router} />
}

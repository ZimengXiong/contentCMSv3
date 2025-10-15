import { Link, Outlet, useLocation } from 'react-router-dom'
import clsx from 'clsx'

export default function RootLayout() {
  const location = useLocation()
  const isHome = location.pathname === '/'
  const isEditor = location.pathname.startsWith('/post/')
  const title = isHome ? 'Posts' : 'Editor'

  return (
    <div className="app-shell">
      <header className={clsx('app-header', isEditor && 'app-header-wide')}>
        <div className="app-brand">
          <Link to="/">CMS</Link>
          <span className="app-brand-subtitle">{title}</span>
        </div>
      </header>
      <main className={clsx('app-main', isEditor && 'app-main-wide')}>
        <Outlet />
      </main>
    </div>
  )
}

import { Link, Outlet, useLocation } from 'react-router-dom'
import clsx from 'clsx'
import { Button } from '../components/Button'
import { DeployModal } from '../components/DeployModal'
import { deployToHugo } from '../api/posts'
import { useTheme } from '../context/ThemeContext'
import { useState } from 'react'

export default function RootLayout() {
  const location = useLocation()
  const isHome = location.pathname === '/'
  const isEditor = location.pathname.startsWith('/post/')
  const title = isHome ? 'Posts' : 'Editor'
  const { theme, toggleTheme } = useTheme()
  const isDark = theme === 'dark'
  const [isDeployModalOpen, setIsDeployModalOpen] = useState(false)
  const [isDeploying, setIsDeploying] = useState(false)

  return (
    <div className="app-shell">
      <header className={clsx('app-header', isEditor && 'app-header-wide')}>
        <div className="app-brand">
          <Link to="/">CMS</Link>
          <span className="app-brand-subtitle">{title}</span>
        </div>
        <div className="header-actions">
          {isEditor && (
            <Button
              variant="success"
              className="btn-sm"
              onClick={() => setIsDeployModalOpen(true)}
            >
              Deploy
            </Button>
          )}
          <Button
            variant="ghost"
            className="btn-sm"
            onClick={toggleTheme}
            aria-pressed={isDark}
          >
            {isDark ? 'Light Theme' : 'Dark Theme'}
          </Button>
        </div>
      </header>
      <main className={clsx('app-main', isEditor && 'app-main-wide')}>
        <Outlet />
      </main>

      <DeployModal
        isOpen={isDeployModalOpen}
        onClose={() => setIsDeployModalOpen(false)}
        onDeploy={async (message) => {
          setIsDeploying(true)
          try {
            await deployToHugo(message)
            setIsDeployModalOpen(false)
          } catch (error) {
            console.error('Deploy failed:', error)
          } finally {
            setIsDeploying(false)
          }
        }}
        isDeploying={isDeploying}
      />
    </div>
  )
}

import { useState } from 'react'
import { Modal } from './Modal'
import { Button } from './Button'

type DeployModalProps = {
  isOpen: boolean
  onClose: () => void
  onDeploy: (commitMessage: string) => void
  isDeploying: boolean
}

export function DeployModal({ isOpen, onClose, onDeploy, isDeploying }: DeployModalProps) {
  const [commitMessage, setCommitMessage] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (commitMessage.trim()) {
      onDeploy(commitMessage.trim())
    }
  }

  const handleClose = () => {
    if (!isDeploying) {
      setCommitMessage('')
      onClose()
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} width="md" title="Deploy to Hugo Site">
      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="form-field">
            <label htmlFor="commit-message">Commit Message</label>
            <input
              id="commit-message"
              type="text"
              className="input"
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              placeholder="Enter commit message..."
              autoFocus
              disabled={isDeploying}
              required
            />
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>
            This will run:
            <br />
            <code style={{ fontSize: '0.8rem' }}>git add . && git commit -am "..." && git push</code>
            <br />
            in <code style={{ fontSize: '0.8rem' }}>~/Code/hugoSite/</code>
          </p>
        </div>
        <div className="modal-actions modal-actions-spaced">
          <Button type="button" variant="secondary" onClick={handleClose} disabled={isDeploying}>
            Cancel
          </Button>
          <Button type="submit" variant="success" disabled={isDeploying || !commitMessage.trim()}>
            {isDeploying ? 'Deploying...' : 'Deploy'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

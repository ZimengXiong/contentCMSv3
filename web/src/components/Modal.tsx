import { useEffect } from 'react'
import type { PropsWithChildren, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import clsx from 'clsx'

type ModalProps = PropsWithChildren<{
  isOpen: boolean
  onClose: () => void
  title?: string
  footer?: ReactNode
  width?: 'sm' | 'md' | 'lg'
}>

const widthMap = {
  sm: 'modal-sm',
  md: 'modal-md',
  lg: 'modal-lg',
} as const

export function Modal({ isOpen, onClose, title, footer, width = 'md', children }: ModalProps) {
  useEffect(() => {
    if (!isOpen) {
      return
    }
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  if (!isOpen) {
    return null
  }

  return createPortal(
    <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div
        className={clsx('modal-container', widthMap[width])}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          {title ? <h2 className="modal-title">{title}</h2> : <span />}
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-footer">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  )
}

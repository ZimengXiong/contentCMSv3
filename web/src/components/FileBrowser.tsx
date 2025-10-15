import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import {
  createFolder,
  deleteEntry,
  fetchFileTree,
  renameEntry,
  uploadFile,
  type FileNode,
} from '../api/posts'
import { Button } from './Button'
import { Modal } from './Modal'

type FileBrowserProps = {
  slug: string
  onStructureChange?: () => void
}

type RenameState = {
  path: string
  name: string
}

type DeleteState = {
  path: string
  name: string
  isDirectory: boolean
}

function getParentPath(path: string): string {
  if (!path.includes('/')) {
    return ''
  }
  return path.slice(0, path.lastIndexOf('/'))
}

function createTargetPath(parent: string, name: string): string {
  return parent ? `${parent}/${name}` : name
}

function getFileIcon(node: FileNode): string {
  if (node.type === 'directory') {
    return '📁'
  }

  const ext = node.name.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'stl':
      return '🕋'
    case 'md':
    case 'markdown':
      return '📝'
    case 'jpg':
    case 'jpeg':
    case 'png':
    case 'gif':
    case 'svg':
    case 'webp':
      return '🏞️'
    case 'pdf':
      return '📄'
    case 'txt':
      return '📄'
    case 'json':
      return '📋'
    case 'js':
    case 'ts':
    case 'jsx':
    case 'tsx':
      return '⚙️'
    case 'css':
    case 'scss':
    case 'sass':
      return '🎨'
    case 'html':
      return '🌐'
    case 'zip':
    case 'tar':
    case 'gz':
      return '📦'
    case 'ds-store':
      return '❌'
    case 'ods':
      return '📊'
    default:
      return '📄'
  }
}

export function FileBrowser({ slug, onStructureChange }: FileBrowserProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set())
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [folderModalOpen, setFolderModalOpen] = useState(false)
  const [folderName, setFolderName] = useState('')
  const [renameState, setRenameState] = useState<RenameState | null>(null)
  const [deleteState, setDeleteState] = useState<DeleteState | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const filesQuery = useQuery({
    queryKey: ['files', slug],
    queryFn: () => fetchFileTree(slug),
  })

  const nodesByPath = useMemo(() => {
    const map = new Map<string, FileNode>()
    const traverse = (nodes: FileNode[]) => {
      for (const node of nodes) {
        map.set(node.path, node)
        if (node.type === 'directory' && node.children) {
          traverse(node.children)
        }
      }
    }
    if (filesQuery.data) {
      traverse(filesQuery.data)
    }
    return map
  }, [filesQuery.data])

  const selectedNode = selectedPath ? nodesByPath.get(selectedPath) ?? null : null
  const currentDirectory = selectedNode
    ? selectedNode.type === 'directory'
      ? selectedNode.path
      : getParentPath(selectedNode.path)
    : ''

  useEffect(() => {
    if (selectedPath && !nodesByPath.has(selectedPath)) {
      setSelectedPath(null)
    }
  }, [nodesByPath, selectedPath])

  useEffect(() => {
    if (!filesQuery.data) {
      return
    }
    setExpandedPaths((prev) => {
      if (prev.size > 0) {
        return prev
      }
      const next = new Set<string>()
      for (const node of filesQuery.data) {
        if (node.type === 'directory') {
          next.add(node.path)
        }
      }
      return next
    })
  }, [filesQuery.data])

  const ensureExpanded = (path: string) => {
    if (!path) {
      return
    }
    setExpandedPaths((prev) => {
      if (prev.has(path)) {
        return prev
      }
      const next = new Set(prev)
      next.add(path)
      return next
    })
  }

  const toggleExpanded = (path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }

  const refreshTree = async (shouldNotify?: boolean) => {
    await filesQuery.refetch()
    if (shouldNotify) {
      onStructureChange?.()
    }
  }

  const createFolderMutation = useMutation({
    mutationFn: (name: string) => createFolder(slug, currentDirectory, name),
    onSuccess: async () => {
      setFolderModalOpen(false)
      setFolderName('')
      setErrorMessage(null)
      ensureExpanded(currentDirectory)
      await refreshTree(false)
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : 'Unable to create folder'
      setErrorMessage(message)
    },
  })

  const renameMutation = useMutation({
    mutationFn: ({ source, target }: { source: string; target: string }) =>
      renameEntry(slug, source, target),
    onSuccess: async (_, { source, target }) => {
      setRenameState(null)
      setErrorMessage(null)
      ensureExpanded(getParentPath(target))
      const involvesIndex = source.endsWith('index.md') || target.endsWith('index.md')
      await refreshTree(involvesIndex)
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : 'Unable to rename entry'
      setErrorMessage(message)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (path: string) => deleteEntry(slug, path),
    onSuccess: async (_, path) => {
      setDeleteState(null)
      setErrorMessage(null)
      const involvesIndex = path.endsWith('index.md')
      await refreshTree(involvesIndex)
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : 'Unable to delete entry'
      setErrorMessage(message)
    },
  })

  const uploadMutation = useMutation({
    mutationFn: async (files: File[]) => {
      let touchedIndex = false
      for (const file of files) {
        await uploadFile(slug, currentDirectory, file)
        if (createTargetPath(currentDirectory, file.name).endsWith('index.md')) {
          touchedIndex = true
        }
      }
      await refreshTree(touchedIndex)
    },
    onSuccess: () => {
      setErrorMessage(null)
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : 'Unable to upload file'
      setErrorMessage(message)
    },
  })

  const openFileInNewTab = (node: FileNode) => {
    if (node.type !== 'file') {
      return
    }
    const encodedPath = node.path
      .split('/')
      .filter(Boolean)
      .map((segment) => encodeURIComponent(segment))
      .join('/')
    const targetSlug = encodeURIComponent(slug)
    const url = `/media/posts/${targetSlug}/${encodedPath}`
    window.open(url, '_blank', 'noopener')
  }

  const handleSelect = (path: string) => {
    setSelectedPath(path)
    const node = nodesByPath.get(path)
    if (node?.type === 'directory') {
      ensureExpanded(path)
    }
  }

  const handleFolderSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!folderName.trim()) {
      setErrorMessage('Folder name is required')
      return
    }
    createFolderMutation.mutate(folderName.trim())
  }

  const handleRenameSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!renameState) {
      return
    }
    if (!renameState.name.trim()) {
      setErrorMessage('Name is required')
      return
    }
    const parent = getParentPath(renameState.path)
    const target = createTargetPath(parent, renameState.name.trim())
    renameMutation.mutate({ source: renameState.path, target })
  }

  const renderNodes = (nodes: FileNode[]) => {
    return (
      <ul className="file-tree">
        {nodes.map((node) => {
          const isDirectory = node.type === 'directory'
          const isExpanded = expandedPaths.has(node.path) || isDirectory === false
          const isActive = node.path === selectedPath
          return (
            <li key={node.path}>
              <div className={clsx('file-node', isActive && 'active')}>
                <div 
                  className="file-node-main"
                  onClick={(event) => {
                    if (!isDirectory && (event.metaKey || event.ctrlKey)) {
                      event.preventDefault()
                      openFileInNewTab(node)
                      return
                    }
                    handleSelect(node.path)
                  }}
                  onAuxClick={(event) => {
                    if (!isDirectory && event.button === 1) {
                      event.preventDefault()
                      openFileInNewTab(node)
                    }
                  }}
                  onDoubleClick={() => (isDirectory ? toggleExpanded(node.path) : undefined)}
                >
                  <div className="file-node-label">
                    {isDirectory && (
                      <button
                        type="button"
                        className="file-toggle"
                        onClick={(event) => {
                          event.stopPropagation()
                          toggleExpanded(node.path)
                        }}
                        aria-label={isExpanded ? 'Collapse folder' : 'Expand folder'}
                      >
                        <svg 
                          width="10" 
                          height="10" 
                          viewBox="0 0 10 10"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                          style={{ 
                            transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                            transition: 'transform 0.15s ease'
                          }}
                        >
                          <path 
                            d="M3.5 1.5L7.5 5L3.5 8.5" 
                            stroke="currentColor" 
                            strokeWidth="1.5" 
                            strokeLinecap="round"
                          />
                        </svg>
                      </button>
                    )}
                    <span className="file-icon">{getFileIcon(node)}</span>
                    <span className="file-node-name">{node.name}</span>
                  </div>
                  <div className="file-node-actions-inline">
                    <button
                      type="button"
                      className="file-action"
                      onClick={(event) => {
                        event.stopPropagation()
                        setErrorMessage(null)
                        setSelectedPath(node.path)
                        setRenameState({ path: node.path, name: node.name })
                      }}
                      title="Rename"
                      aria-label="Rename"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M16.5 3.5L20.5 7.5L7 21H3V17L16.5 3.5Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                    <button
                      type="button"
                      className="file-action file-action-danger"
                      onClick={(event) => {
                        event.stopPropagation()
                        setErrorMessage(null)
                        setSelectedPath(node.path)
                        setDeleteState({
                          path: node.path,
                          name: node.name,
                          isDirectory: isDirectory,
                        })
                      }}
                      title="Delete"
                      aria-label="Delete"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M3 6H5H21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M8 6V4C8 3.46957 8.21071 2.96086 8.58579 2.58579C8.96086 2.21071 9.46957 2 10 2H14C14.5304 2 15.0391 2.21071 15.4142 2.58579C15.7893 2.96086 16 3.46957 16 4V6M19 6V20C19 20.5304 18.7893 21.0391 18.4142 21.4142C18.0391 21.7893 17.5304 22 17 22H7C6.46957 22 5.96086 21.7893 5.58579 21.4142C5.21071 21.0391 5 20.5304 5 20V6H19Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                  </div>
                </div>
                {isDirectory && isExpanded && node.children?.length ? (
                  <div className="file-node-children">{renderNodes(node.children)}</div>
                ) : null}
              </div>
            </li>
          )
        })}
      </ul>
    )
  }

  return (
    <div className="file-browser">
      <div className="file-browser-header">
        <div>
          <strong>Files</strong>
          <div className="file-hint">Current directory: {currentDirectory || '(root)'}</div>
        </div>
        <div className="file-browser-actions">
          <Button
            variant="secondary"
            className="btn-sm"
            onClick={() => {
              setErrorMessage(null)
              setFolderModalOpen(true)
            }}
          >
            New Folder
          </Button>
          <Button
            variant="primary"
            className="btn-sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadMutation.isPending}
          >
            Upload File
          </Button>
        </div>
      </div>
      <div className="file-browser-body">
        {errorMessage ? <div className="message message-error">{errorMessage}</div> : null}
        {filesQuery.isLoading ? (
          <div className="loading-state">Loading files...</div>
        ) : filesQuery.data && filesQuery.data.length > 0 ? (
          renderNodes(filesQuery.data)
        ) : (
          <div className="empty-state">
            <p>No files yet.</p>
            <p className="file-hint">
              Upload a file or create a folder to get started.
            </p>
          </div>
        )}
      </div>
      <div className="file-browser-footer">
        {selectedNode ? (
          <div>
            <strong>{selectedNode.type === 'directory' ? 'Folder' : 'File'}:</strong>{' '}
            {selectedNode.name}
          </div>
        ) : (
          <div className="file-hint">
            Select a file or folder to manage
          </div>
        )}
      </div>
      <input
        ref={fileInputRef}
        className="upload-input"
        type="file"
        multiple
        onChange={(event) => {
          const { files } = event.target
          if (!files || files.length === 0) {
            return
          }
          const selectedFiles = Array.from(files)
          uploadMutation.mutate(selectedFiles)
          event.target.value = ''
        }}
      />

      <Modal
        isOpen={folderModalOpen}
        onClose={() => {
          setFolderModalOpen(false)
          setFolderName('')
          setErrorMessage(null)
        }}
        title={`New folder in ${currentDirectory || 'root'}`}
      >
        <form className="form-grid" onSubmit={handleFolderSubmit}>
          <div className="form-field">
            <label htmlFor="folder-name">Folder name</label>
            <input
              id="folder-name"
              className="input"
              value={folderName}
              onChange={(event) => setFolderName(event.target.value)}
              autoFocus
            />
          </div>
          <div className="modal-actions">
            <Button
              variant="secondary"
              onClick={() => {
                setFolderModalOpen(false)
                setFolderName('')
                setErrorMessage(null)
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createFolderMutation.isPending}>
              {createFolderMutation.isPending ? 'Creating…' : 'Create'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={Boolean(renameState)}
        onClose={() => {
          setRenameState(null)
          setErrorMessage(null)
        }}
        title={`Rename ${renameState?.name ?? ''}`}
      >
        <form className="form-grid" onSubmit={handleRenameSubmit}>
          <div className="form-field">
            <label htmlFor="rename-entry">New name</label>
            <input
              id="rename-entry"
              className="input"
              value={renameState?.name ?? ''}
              onChange={(event) =>
                setRenameState((prev) => (prev ? { ...prev, name: event.target.value } : prev))
              }
              autoFocus
            />
          </div>
          <div className="modal-actions">
            <Button
              variant="secondary"
              onClick={() => {
                setRenameState(null)
                setErrorMessage(null)
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={renameMutation.isPending}>
              {renameMutation.isPending ? 'Renaming…' : 'Rename'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={Boolean(deleteState)}
        onClose={() => {
          setDeleteState(null)
          setErrorMessage(null)
        }}
        title="Delete entry"
        width="sm"
      >
        <p>
          Are you sure you want to delete “{deleteState?.name}”? This will{' '}
          {deleteState?.isDirectory ? 'remove the folder and its contents.' : 'delete the file.'}
        </p>
        <div className="modal-actions">
          <Button
            variant="secondary"
            onClick={() => {
              setDeleteState(null)
              setErrorMessage(null)
            }}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => deleteState && deleteMutation.mutate(deleteState.path)}
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
          </Button>
        </div>
      </Modal>
    </div>
  )
}

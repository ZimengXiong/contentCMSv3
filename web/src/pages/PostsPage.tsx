import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  createPost,
  deletePost,
  fetchPosts,
  renamePost,
  type PostSummary,
} from '../api/posts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '../components/Button'
import { Modal } from '../components/Modal'
import { formatRelativeTime } from '../utils/time'

export default function PostsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [isCreateOpen, setCreateOpen] = useState(false)
  const [isRenameOpen, setRenameOpen] = useState(false)
  const [isDeleteOpen, setDeleteOpen] = useState(false)
  const [selectedPost, setSelectedPost] = useState<PostSummary | null>(null)
  const [newPostName, setNewPostName] = useState('')
  const [renameValue, setRenameValue] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const postsQuery = useQuery({
    queryKey: ['posts'],
    queryFn: fetchPosts,
  })

  const createMutation = useMutation({
    mutationFn: (name: string) => createPost(name),
    onSuccess: async ({ name }) => {
      setCreateOpen(false)
      setNewPostName('')
      setErrorMessage(null)
      await queryClient.invalidateQueries({ queryKey: ['posts'] })
      navigate(`/post/${encodeURIComponent(name)}`)
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : 'Unable to create post'
      setErrorMessage(message)
    },
  })

  const renameMutation = useMutation({
    mutationFn: ({ slug, name }: { slug: string; name: string }) => renamePost(slug, name),
    onSuccess: async () => {
      setRenameOpen(false)
      setSelectedPost(null)
      setRenameValue('')
      setErrorMessage(null)
      await queryClient.invalidateQueries({ queryKey: ['posts'] })
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : 'Unable to rename post'
      setErrorMessage(message)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (slug: string) => deletePost(slug),
    onSuccess: async () => {
      setDeleteOpen(false)
      setSelectedPost(null)
      setErrorMessage(null)
      await queryClient.invalidateQueries({ queryKey: ['posts'] })
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : 'Unable to delete post'
      setErrorMessage(message)
    },
  })

  const sortedPosts = useMemo(() => {
    if (!postsQuery.data) {
      return []
    }
    return [...postsQuery.data].sort((a, b) =>
      new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime(),
    )
  }, [postsQuery.data])

  const openRename = (post: PostSummary) => {
    setErrorMessage(null)
    setSelectedPost(post)
    setRenameValue(post.name)
    setRenameOpen(true)
  }

  const openDelete = (post: PostSummary) => {
    setErrorMessage(null)
    setSelectedPost(post)
    setDeleteOpen(true)
  }

  const handleCreate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!newPostName.trim()) {
      setErrorMessage('Please provide a name for the post')
      return
    }
    createMutation.mutate(newPostName.trim())
  }

  const handleRename = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedPost) {
      return
    }
    if (!renameValue.trim()) {
      setErrorMessage('Please provide a new name for the post')
      return
    }
    renameMutation.mutate({ slug: selectedPost.slug, name: renameValue.trim() })
  }

  return (
    <div className="card">
      <div className="posts-header">
        <h1>Posts</h1>
        <Button
          onClick={() => {
            setErrorMessage(null)
            setCreateOpen(true)
          }}
        >
          New Post
        </Button>
      </div>

      {errorMessage ? <div className="message message-error">{errorMessage}</div> : null}

      {postsQuery.isLoading ? (
        <p>Loading posts…</p>
      ) : sortedPosts.length === 0 ? (
        <div className="posts-empty">No posts yet. Create one to get started.</div>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Last Updated</th>
              <th>Status</th>
              <th className="table-cell-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedPosts.map((post) => (
              <tr key={post.slug}>
                <td>
                  <Button
                    variant="ghost"
                    onClick={() => navigate(`/post/${encodeURIComponent(post.slug)}`)}
                  >
                    {post.name}
                  </Button>
                </td>
                <td>{formatRelativeTime(post.modifiedAt)}</td>
                <td>
                  {post.hasIndex ? (
                    <span className="badge">index.md</span>
                  ) : (
                    <span className="badge">Missing index</span>
                  )}
                </td>
                <td className="table-cell-right">
                  <div className="table-actions">
                    <Button variant="secondary" onClick={() => openRename(post)}>
                      Rename
                    </Button>
                    <Button variant="danger" onClick={() => openDelete(post)}>
                      Delete
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Modal isOpen={isCreateOpen} onClose={() => setCreateOpen(false)} title="Create new post">
        <form className="form-grid" onSubmit={handleCreate}>
          <div className="form-field">
            <label htmlFor="new-post-name">Post name</label>
            <input
              id="new-post-name"
              className="input post-title-input"
              placeholder="My new post"
              value={newPostName}
              onChange={(event) => setNewPostName(event.target.value)}
              autoFocus
            />
          </div>
          <div className="modal-actions">
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Creating…' : 'Create'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={isRenameOpen && Boolean(selectedPost)}
        onClose={() => setRenameOpen(false)}
        title={`Rename “${selectedPost?.name ?? ''}”`}
      >
        <form className="form-grid" onSubmit={handleRename}>
          <div className="form-field">
            <label htmlFor="rename-post">New name</label>
            <input
              id="rename-post"
              className="input"
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
              autoFocus
            />
          </div>
          <div className="modal-actions">
            <Button variant="secondary" onClick={() => setRenameOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={renameMutation.isPending}>
              {renameMutation.isPending ? 'Renaming…' : 'Rename'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={isDeleteOpen && Boolean(selectedPost)}
        onClose={() => setDeleteOpen(false)}
        title="Delete post"
        width="sm"
      >
        <p>Are you sure you want to delete “{selectedPost?.name}”? This action cannot be undone.</p>
        <div className="modal-actions">
          <Button variant="secondary" onClick={() => setDeleteOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => selectedPost && deleteMutation.mutate(selectedPost.slug)}
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
          </Button>
        </div>
      </Modal>
    </div>
  )
}

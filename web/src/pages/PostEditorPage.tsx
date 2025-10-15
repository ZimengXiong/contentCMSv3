import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import CodeMirror from '@uiw/react-codemirror'
import { markdown } from '@codemirror/lang-markdown'
import { oneDark } from '@codemirror/theme-one-dark'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import rehypeRaw from 'rehype-raw'
import rehypeHighlight from 'rehype-highlight'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { Button } from '../components/Button'
import { FileBrowser } from '../components/FileBrowser'
import { fetchPostIndex, savePostIndex } from '../api/posts'
import { useTheme } from '../theme/ThemeProvider'
import { formatRelativeTime } from '../utils/time'
import type { ApiError } from '../api/client'
import type { PluggableList } from 'unified'
import type { Components } from 'react-markdown'

function isApiError(error: unknown): error is ApiError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof (error as { status?: unknown }).status === 'number'
  )
}

type SaveStatus = 'idle' | 'editing' | 'saving' | 'saved' | 'error'

export default function PostEditorPage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const { theme } = useTheme()
  const queryClient = useQueryClient()
  const [content, setContent] = useState('')
  const [status, setStatus] = useState<SaveStatus>('idle')
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)
  const [savingError, setSavingError] = useState<string | null>(null)
  const [hasInitialized, setHasInitialized] = useState(false)
  const [showFiles, setShowFiles] = useState(true)
  const lastSavedContent = useRef('')
  const autosaveTimer = useRef<number | null>(null)

  const postSlug = slug ?? ''

  const indexQuery = useQuery({
    queryKey: ['postIndex', postSlug],
    queryFn: () => fetchPostIndex(postSlug),
    enabled: Boolean(postSlug),
    retry: (failureCount, error) => {
      if (isApiError(error) && error.status === 404) {
        return false
      }
      return failureCount < 2
    },
  })

  const isIndexMissing = indexQuery.isError && isApiError(indexQuery.error) && indexQuery.error.status === 404
  const loadError = indexQuery.isError && !isIndexMissing ? (indexQuery.error as Error) : null

  useEffect(() => {
    if (!postSlug) {
      return
    }
    if (indexQuery.isSuccess) {
      setContent(indexQuery.data)
      lastSavedContent.current = indexQuery.data
      setHasInitialized(true)
      setStatus('idle')
      return
    }
    if (indexQuery.isError) {
      const error = indexQuery.error
      if (isApiError(error) && error.status === 404) {
        setContent('')
        lastSavedContent.current = ''
        setHasInitialized(true)
        setStatus('editing')
      }
    }
  }, [indexQuery.isSuccess, indexQuery.isError, indexQuery.data, indexQuery.error, postSlug])

  useEffect(() => {
    return () => {
      if (autosaveTimer.current) {
        window.clearTimeout(autosaveTimer.current)
      }
    }
  }, [])

  const saveMutation = useMutation({
    mutationFn: (body: string) => savePostIndex(postSlug, body),
    onMutate: () => {
      setStatus('saving')
      setSavingError(null)
    },
    onSuccess: (formatted) => {
      lastSavedContent.current = formatted
      setContent(formatted)
      setStatus('saved')
      setLastSavedAt(new Date())
      queryClient.setQueryData(['postIndex', postSlug], formatted)
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : 'Failed to save content'
      setSavingError(message)
      setStatus('error')
    },
  })

  const triggerSave = useCallback(() => {
    if (!postSlug) {
      return
    }
    if (saveMutation.isPending) {
      return
    }
    if (content === lastSavedContent.current) {
      return
    }
    saveMutation.mutate(content)
  }, [content, postSlug, saveMutation])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        triggerSave()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [triggerSave])

  useEffect(() => {
    if (!hasInitialized) {
      return
    }
    if (content === lastSavedContent.current) {
      return
    }
    if (saveMutation.isPending) {
      return
    }
    setStatus('editing')
    if (autosaveTimer.current) {
      window.clearTimeout(autosaveTimer.current)
    }
    autosaveTimer.current = window.setTimeout(() => {
      triggerSave()
    }, 1500)
  }, [content, hasInitialized, saveMutation.isPending, triggerSave])

  const markdownExtensions = useMemo(() => [markdown()], [])
  const remarkPlugins = useMemo<PluggableList>(() => [remarkGfm, remarkMath], [])
  const rehypePlugins = useMemo<PluggableList>(() => [rehypeRaw, rehypeKatex, rehypeHighlight], [])
  const resolveAssetUrl = useCallback(
    (src: string | null | undefined): string | undefined => {
      if (!src) {
        return undefined
      }
      if (/^(data:|https?:|mailto:)/i.test(src)) {
        return src
      }
      if (src.startsWith('/')) {
        return src
      }
      const cleaned = src.replace(/^\.\//, '').replace(/^\//, '')
      if (cleaned.includes('..')) {
        return src
      }
      const encodedPath = cleaned
        .split('/')
        .filter(Boolean)
        .map((segment) => encodeURIComponent(segment))
        .join('/')
      return `/media/posts/${encodeURIComponent(postSlug)}/${encodedPath}`
    },
    [postSlug],
  )
  const markdownComponents = useMemo<Components>(
    () => ({
      img: ({ src, alt, ...rest }) => {
        const resolved = resolveAssetUrl(src)
        return <img src={resolved} alt={alt} {...rest} />
      },
    }),
    [resolveAssetUrl],
  )

  const statusMessage = useMemo(() => {
    switch (status) {
      case 'saving':
        return 'Saving…'
      case 'saved':
        return lastSavedAt ? `Saved ${formatRelativeTime(lastSavedAt)}` : 'Saved'
      case 'editing':
        return 'Unsaved changes'
      case 'error':
        return savingError ?? 'Save failed'
      default:
        return ''
    }
  }, [status, lastSavedAt, savingError])

  if (!postSlug) {
    return (
      <div className="card">
        <p>Invalid post. <Button onClick={() => navigate('/')}>Go back</Button></p>
      </div>
    )
  }

  if (loadError && !hasInitialized) {
    return (
      <div className="card">
        <h2>Unable to load post</h2>
        <p className="message message-error">{loadError.message}</p>
        <div className="modal-actions modal-actions-spaced">
          <Button variant="secondary" onClick={() => navigate('/')}>Back</Button>
          <Button variant="primary" onClick={() => indexQuery.refetch()}>Retry</Button>
        </div>
      </div>
    )
  }

  const isLoading = indexQuery.isLoading && !hasInitialized
  const previewContent = content || '*Start writing your post in Markdown.*'

  return (
    <div className="editor-page">
      <div className="editor-toolbar">
        <div className="editor-toolbar-left">
          <Button variant="secondary" onClick={() => navigate('/')}>Back</Button>
          <h2>{postSlug}</h2>
        </div>
        <div className="editor-toolbar-right">
          <Button variant="secondary" onClick={() => setShowFiles((prev) => !prev)}>
            {showFiles ? 'Hide files' : 'Show files'}
          </Button>
          <Button variant="secondary" onClick={triggerSave} disabled={saveMutation.isPending || content === lastSavedContent.current}>
            {saveMutation.isPending ? 'Saving…' : 'Save'}
          </Button>
          <div className="editor-status">{statusMessage}</div>
        </div>
      </div>

      {savingError && status === 'error' ? (
        <div className="message message-error">{savingError}</div>
      ) : null}

      {isIndexMissing ? (
        <div className="message">
          index.md is missing for this post. Saving will create it automatically.
        </div>
      ) : null}

      <div className={clsx('post-workspace', !showFiles && 'fullwidth')}>
        {showFiles ? (
          <FileBrowser
            slug={postSlug}
            onStructureChange={() => {
              queryClient.invalidateQueries({ queryKey: ['postIndex', postSlug] })
            }}
          />
        ) : null}

        <div className="editor-panels">
          {isLoading ? (
            <div className="editor-pane">Loading content…</div>
          ) : (
            <PanelGroup direction="horizontal" style={{ height: '100%' }}>
              <Panel defaultSize={50} minSize={25}>
                <div className="editor-pane">
                  <CodeMirror
                    value={content}
                    extensions={markdownExtensions}
                    onChange={(value) => setContent(value)}
                    theme={theme === 'dark' ? oneDark : 'light'}
                    height="100%"
                  />
                </div>
              </Panel>
              <PanelResizeHandle className="splitter-handle" />
              <Panel defaultSize={50} minSize={25}>
                <div className="preview-pane">
                  <article className="markdown-body">
                    <ReactMarkdown
                      remarkPlugins={remarkPlugins}
                      rehypePlugins={rehypePlugins}
                      components={markdownComponents}
                    >
                      {previewContent}
                    </ReactMarkdown>
                  </article>
                </div>
              </Panel>
            </PanelGroup>
          )}
        </div>
      </div>
    </div>
  )
}

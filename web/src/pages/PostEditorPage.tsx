import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import CodeMirror from '@uiw/react-codemirror'
import { markdown } from '@codemirror/lang-markdown'
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
import { formatRelativeTime } from '../utils/time'
import type { ApiError } from '../api/client'
import type { PluggableList } from 'unified'
import type { Components } from 'react-markdown'
import { EditorView, keymap, type Command } from '@codemirror/view'
import { EditorSelection } from '@codemirror/state'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags } from '@lezer/highlight'

function isApiError(error: unknown): error is ApiError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof (error as { status?: unknown }).status === 'number'
  )
}

type SaveStatus = 'idle' | 'editing' | 'saving' | 'saved' | 'error'

function wrapSelection(view: EditorView, before: string, after: string, placeholder: string) {
  const { state } = view
  const transaction = state.changeByRange((range) => {
    const { from, to } = range
    const selected = state.sliceDoc(from, to)
    const text = selected.length > 0 ? selected : placeholder
    const insert = `${before}${text}${after}`
    const cursorStart = from + before.length
    const cursorEnd = cursorStart + text.length
    return {
      changes: { from, to, insert },
      range: EditorSelection.range(cursorStart, cursorEnd),
    }
  })
  view.dispatch(transaction)
  view.focus()
  return true
}

function createWrapCommand(before: string, after = before, placeholder = 'text'): Command {
  return (view) => wrapSelection(view, before, after, placeholder)
}

const insertLinkCommand: Command = (view) => {
  const transaction = view.state.changeByRange((range) => {
    const { from, to } = range
    const selected = view.state.sliceDoc(from, to)
    const linkText = selected.length > 0 ? selected : 'link text'
    const insert = `[${linkText}]()`
    const cursorPosition = from + linkText.length + 3 // Position after [text](
    return {
      changes: { from, to, insert },
      range: EditorSelection.cursor(cursorPosition),
    }
  })
  view.dispatch(transaction)
  view.focus()
  return true
}

const markdownFormattingKeymap = keymap.of([
  { key: 'Mod-b', run: createWrapCommand('**', '**', 'bold text') },
  { key: 'Mod-i', run: createWrapCommand('*', '*', 'italic text') },
  { key: 'Mod-u', run: createWrapCommand('<u>', '</u>', 'underlined text') },
  { key: 'Mod-Shift-s', run: createWrapCommand('~~', '~~', 'strikethrough') },
  { key: 'Mod-Shift-c', run: createWrapCommand('`', '`', 'code') },
  { key: 'Mod-k', run: insertLinkCommand },
])

const browserFindKeymap = keymap.of([
  {
    key: 'Mod-f',
    preventDefault: false,
    run: () => false,
  },
])

const markdownHighlightStyle = HighlightStyle.define([
  {
    tag: [
      tags.heading,
      tags.strong,
      tags.emphasis,
      tags.strikethrough,
      tags.quote,
      tags.list,
      tags.contentSeparator,
      tags.meta,
      tags.processingInstruction,
      tags.comment,
      tags.keyword,
      tags.literal,
      tags.string,
      tags.monospace,
      tags.brace,
      tags.squareBracket,
      tags.angleBracket,
      tags.paren,
      tags.punctuation,
      tags.operator,
      tags.escape,
    ],
    color: 'var(--text-primary)',
  },
  {
    tag: [tags.link, tags.url],
    color: 'var(--link-color)',
  },
  {
    tag: tags.heading1,
    color: 'var(--text-primary)',
    fontWeight: '700',
  },
  {
    tag: [tags.heading2, tags.heading3, tags.heading4, tags.heading5, tags.heading6],
    color: 'var(--text-primary)',
    fontWeight: '600',
  },
])

const markdownHighlighting = syntaxHighlighting(markdownHighlightStyle)

const markdownEditorBaseTheme = EditorView.theme({
  '&.cm-editor': {
    backgroundColor: 'transparent',
    color: 'var(--text-primary)',
  },
  '.cm-content': {
    color: 'var(--text-primary)',
    caretColor: '#ffffff',
  },
  '.cm-line': {
    color: 'var(--text-primary)',
  },
  '.cm-link': {
    color: 'var(--link-color)',
  },
  '.cm-url': {
    color: 'var(--link-color)',
  },
  '.cm-formatting': {
    color: 'var(--text-primary)',
  },
  '.cm-formatting-header': {
    color: 'var(--text-primary)',
  },
  '.cm-formatting-strong': {
    color: 'var(--text-primary)',
  },
  '.cm-formatting-em': {
    color: 'var(--text-primary)',
  },
  '.cm-formatting-code': {
    color: 'var(--text-primary)',
  },
  '.cm-formatting-link': {
    color: 'var(--text-primary)',
  },
  '.cm-formatting-image': {
    color: 'var(--text-primary)',
  },
  '.cm-formatting-list': {
    color: 'var(--text-primary)',
  },
  '.cm-formatting-quote': {
    color: 'var(--text-primary)',
  },
  '.cm-cursor': {
    borderLeftColor: '#ffffff',
  },
  '.cm-dropCursor': {
    borderLeftColor: '#ffffff',
  },
  '.cm-selectionLayer': {
    mixBlendMode: 'normal',
  },
  '.cm-selectionBackground': {
    opacity: 1,
  },
  // Dark mode selection styling
  ':root[data-theme="dark"] & .cm-selectionLayer': {
    mixBlendMode: 'normal',
  },
  ':root[data-theme="dark"] & .cm-selectionBackground': {
    backgroundColor: '#03624c !important',
    opacity: 1,
  },
  ':root[data-theme="dark"] &.cm-focused .cm-selectionBackground': {
    backgroundColor: '#03624c !important',
    opacity: 1,
  },
  ':root[data-theme="dark"] & .cm-line::selection': {
    backgroundColor: '#03624c !important',
    color: '#f8fafc',
  },
  ':root[data-theme="dark"] & .cm-line::-moz-selection': {
    backgroundColor: '#03624c !important',
    color: '#f8fafc',
  },
})

export default function PostEditorPage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [content, setContent] = useState('')
  const [status, setStatus] = useState<SaveStatus>('idle')
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)
  const [savingError, setSavingError] = useState<string | null>(null)
  const [hasInitialized, setHasInitialized] = useState(false)
  const [showFiles, setShowFiles] = useState(true)
  const [viewMode, setViewMode] = useState<'split' | 'source' | 'preview'>('split')
  const lastSavedContent = useRef('')
  const autosaveTimer = useRef<number | null>(null)
  const editorRef = useRef<any>(null)

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
      updateContent(formatted, true)
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
    }, 40000)
  }, [content, hasInitialized, saveMutation.isPending, triggerSave])

  const markdownExtensions = useMemo(
    () => [markdown(), EditorView.lineWrapping, browserFindKeymap, markdownFormattingKeymap, markdownHighlighting, markdownEditorBaseTheme],
    [],
  )
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

  const updateContent = useCallback((newContent: string, preserveCursor = false) => {
    if (preserveCursor && editorRef.current?.view) {
      const editor = editorRef.current.view
      const currentPos = editor.state.selection.main.head
      editor.dispatch({
        changes: { from: 0, to: editor.state.doc.length, insert: newContent },
        selection: { anchor: Math.min(currentPos, newContent.length) }
      })
    } else {
      setContent(newContent)
    }
  }, [])

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

  const renderEditorPane = (isSinglePane: boolean) => (
    <div className={clsx('editor-pane', isSinglePane && 'single-pane')}>
      <CodeMirror
        ref={editorRef}
        value={content}
        extensions={markdownExtensions}
        onChange={(value) => updateContent(value, false)}
        height="100%"
      />
    </div>
  )

  const renderPreviewPane = (isSinglePane: boolean) => (
    <div className={clsx('preview-pane', isSinglePane && 'single-pane')}>
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
  )

  return (
    <div className="editor-page">
      <div className="editor-toolbar">
        <Button variant="secondary" className="btn-sm" onClick={() => navigate('/')}>Back</Button>
        <h2>{postSlug}</h2>
        <div className="editor-toolbar-buttons">
          <div className="editor-status">{statusMessage}</div>
          <Button variant="secondary" className="btn-sm" onClick={() => setShowFiles((prev) => !prev)}>
            {showFiles ? 'Hide files' : 'Show files'}
          </Button>
          <div className="editor-view-toggle" role="group" aria-label="Editor view mode">
            <Button
              variant="secondary"
              className={clsx('btn-sm', 'view-toggle-btn', viewMode === 'source' && 'view-toggle-btn-active')}
              onClick={() => setViewMode('source')}
              aria-pressed={viewMode === 'source'}
            >
              Source
            </Button>
            <Button
              variant="secondary"
              className={clsx('btn-sm', 'view-toggle-btn', viewMode === 'split' && 'view-toggle-btn-active')}
              onClick={() => setViewMode('split')}
              aria-pressed={viewMode === 'split'}
            >
              Split
            </Button>
            <Button
              variant="secondary"
              className={clsx('btn-sm', 'view-toggle-btn', viewMode === 'preview' && 'view-toggle-btn-active')}
              onClick={() => setViewMode('preview')}
              aria-pressed={viewMode === 'preview'}
            >
              Preview
            </Button>
          </div>
          <Button variant="secondary" className="btn-sm" onClick={triggerSave} disabled={saveMutation.isPending || content === lastSavedContent.current}>
            {saveMutation.isPending ? 'Saving…' : 'Save'}
          </Button>
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

        <div className={clsx('editor-panels', viewMode !== 'split' && 'editor-panels-single')}>
          {isLoading ? (
            <div className="editor-pane">Loading content…</div>
          ) : viewMode === 'source' ? (
            renderEditorPane(true)
          ) : viewMode === 'preview' ? (
            renderPreviewPane(true)
          ) : (
            <PanelGroup direction="horizontal" style={{ height: '100%' }}>
              <Panel defaultSize={50} minSize={25}>
                {renderEditorPane(false)}
              </Panel>
              <PanelResizeHandle className="splitter-handle" />
              <Panel defaultSize={50} minSize={25}>
                {renderPreviewPane(false)}
              </Panel>
            </PanelGroup>
          )}
        </div>
      </div>
    </div>
  )
}

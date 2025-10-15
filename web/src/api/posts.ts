import { apiFetch } from './client'

export type PostSummary = {
  name: string
  slug: string
  hasIndex: boolean
  modifiedAt: string
}

export type FileNode = {
  type: 'file' | 'directory'
  name: string
  path: string
  size?: number
  modifiedAt?: string
  children?: FileNode[]
}

export async function fetchPosts(): Promise<PostSummary[]> {
  const response = await apiFetch<{ posts: PostSummary[] }>('/posts', {
    method: 'GET',
  })
  return response.posts
}

export async function createPost(name: string) {
  return apiFetch<{ message: string; name: string }>('/posts', {
    method: 'POST',
    body: { name },
  })
}

export async function renamePost(slug: string, name: string) {
  return apiFetch<{ message: string; name: string }>(`/posts/${encodeURIComponent(slug)}`, {
    method: 'PUT',
    body: { name },
  })
}

export async function deletePost(slug: string) {
  return apiFetch<{ message: string }>(`/posts/${encodeURIComponent(slug)}`, {
    method: 'DELETE',
    body: {},
  })
}

export async function fetchPostIndex(slug: string): Promise<string> {
  const response = await apiFetch<{ content: string }>(
    `/posts/${encodeURIComponent(slug)}/index`,
    {
      method: 'GET',
    },
  )
  return response.content
}

export async function savePostIndex(slug: string, content: string): Promise<string> {
  const response = await apiFetch<{ content: string }>(
    `/posts/${encodeURIComponent(slug)}/index`,
    {
      method: 'PUT',
      body: { content },
    },
  )
  return response.content
}

export async function fetchFileTree(slug: string): Promise<FileNode[]> {
  const response = await apiFetch<{ tree: FileNode[] }>(
    `/posts/${encodeURIComponent(slug)}/files`,
    {
      method: 'GET',
    },
  )
  return response.tree
}

export async function uploadFile(
  slug: string,
  targetDir: string,
  file: File,
): Promise<void> {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('target', targetDir)

  await apiFetch(`/posts/${encodeURIComponent(slug)}/files/upload`, {
    method: 'POST',
    body: formData,
  })
}

export async function createFolder(
  slug: string,
  parent: string,
  name: string,
): Promise<void> {
  await apiFetch(`/posts/${encodeURIComponent(slug)}/files/create-folder`, {
    method: 'POST',
    body: { parent, name },
  })
}

export async function renameEntry(
  slug: string,
  source: string,
  target: string,
): Promise<void> {
  await apiFetch(`/posts/${encodeURIComponent(slug)}/files/rename`, {
    method: 'PUT',
    body: { source, target },
  })
}

export async function deleteEntry(slug: string, target: string): Promise<void> {
  await apiFetch(`/posts/${encodeURIComponent(slug)}/files`, {
    method: 'DELETE',
    body: { target },
  })
}

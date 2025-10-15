export type ApiError = {
  status: number
  message: string
}

const API_PREFIX = '/api'

type ApiRequestOptions = Omit<RequestInit, 'body' | 'headers'> & {
  body?: BodyInit | Record<string, unknown>
  headers?: HeadersInit
  skipJson?: boolean
}

export async function apiFetch<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const { skipJson, body, ...rest } = options
  const headers = new Headers(rest.headers)

  const fetchOptions: RequestInit = {
    credentials: 'same-origin',
    ...rest,
    headers,
  }

  if (body && !(body instanceof FormData)) {
    if (!headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json')
    }
    fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body)
  }
  if (body instanceof FormData) {
    fetchOptions.body = body
  }

  const response = await fetch(`${API_PREFIX}${path}`, fetchOptions)

  if (!response.ok) {
    let message = response.statusText
    try {
      const errorBody = await response.json()
      message = errorBody?.error ?? message
    } catch (error) {
      // ignore JSON parse errors
    }
    const error: ApiError = { status: response.status, message }
    throw error
  }

  if (skipJson || response.status === 204) {
    return undefined as T
  }

  const data = (await response.json()) as T
  return data
}

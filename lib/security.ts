export function isSameOriginRequest(request: Request) {
  const expectedOrigin = new URL(request.url).origin
  const origin = request.headers.get('origin')
  if (origin) return origin === expectedOrigin

  const referer = request.headers.get('referer')
  if (!referer) return false
  try {
    return new URL(referer).origin === expectedOrigin
  } catch {
    return false
  }
}

export async function readJsonBody<T>(request: Request, maxBytes: number): Promise<T | null> {
  const contentLength = Number(request.headers.get('content-length'))
  if (Number.isFinite(contentLength) && contentLength > maxBytes) return null

  const body = await request.text()
  if (new TextEncoder().encode(body).byteLength > maxBytes) return null

  try {
    return JSON.parse(body) as T
  } catch {
    return null
  }
}

export function isValidPushEndpoint(value: string) {
  try {
    const endpoint = new URL(value)
    const hostname = endpoint.hostname.toLowerCase()
    const trustedHost =
      hostname === 'fcm.googleapis.com' ||
      hostname === 'web.push.apple.com' ||
      hostname === 'push.services.mozilla.com' ||
      hostname.endsWith('.push.services.mozilla.com') ||
      hostname.endsWith('.notify.windows.com')

    return endpoint.protocol === 'https:' &&
      !endpoint.username &&
      !endpoint.password &&
      !endpoint.port &&
      trustedHost
  } catch {
    return false
  }
}

import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'
import { isSameOriginRequest, readJsonBody } from '@/lib/security'

type LoginPayload = {
  email?: unknown
  password?: unknown
}

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Cross-origin requests are not allowed' }, { status: 403 })
  }

  const payload = await readJsonBody<LoginPayload>(request, 4096)
  if (
    typeof payload?.email !== 'string' ||
    payload.email.length > 254 ||
    typeof payload.password !== 'string' ||
    payload.password.length < 1 ||
    payload.password.length > 128
  ) {
    return NextResponse.json({ error: 'Enter a valid email and password' }, { status: 400 })
  }

  const cookiesToSet: { name: string; value: string; options?: CookieOptions }[] = []
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookies: { name: string; value: string; options?: CookieOptions }[]) {
          cookiesToSet.push(...cookies)
        },
      },
      global: {
        fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
          const controller = new AbortController()
          const abortFromRequest = () => controller.abort()
          if (init?.signal?.aborted) {
            controller.abort()
          } else {
            init?.signal?.addEventListener('abort', abortFromRequest, { once: true })
          }
          const timeout = setTimeout(() => controller.abort(), 12000)
          try {
            return await fetch(input, { ...init, signal: controller.signal })
          } finally {
            clearTimeout(timeout)
            init?.signal?.removeEventListener('abort', abortFromRequest)
          }
        },
      },
    }
  )

  let error: Error | null
  try {
    ({ error } = await supabase.auth.signInWithPassword({
      email: payload.email.trim(),
      password: payload.password,
    }))
  } catch (requestError) {
    console.error('Sign-in request failed:', requestError)
    const timedOut = requestError instanceof Error && requestError.name === 'AbortError'
    return NextResponse.json({
      error: timedOut ? 'Sign-in service timed out. Please try again.' : 'Could not reach the sign-in service. Please try again.',
    }, { status: 503 })
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 401 })
  }

  const response = NextResponse.json({ ok: true })
  cookiesToSet.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options)
  })
  return response
}

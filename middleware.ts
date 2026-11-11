import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const protectedRoutes = [
  '/feed',
  '/groups',
  '/messages',
  '/notifications',
  '/people',
  '/profile',
  '/search',
  '/settings',
]

export async function middleware(request: NextRequest) {
  if (request.nextUrl.pathname === '/api/auth/login') {
    return NextResponse.next()
  }

  const isProtectedRoute = protectedRoutes.some(route =>
    request.nextUrl.pathname === route || request.nextUrl.pathname.startsWith(`${route}/`)
  )

  if (!isProtectedRoute) {
    return NextResponse.next()
  }

  let response = NextResponse.next({ request })
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
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
          const timeout = setTimeout(() => controller.abort(), 5000)
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

  const redirectToLogin = (showSessionError = false) => {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/auth/login'
    loginUrl.search = ''
    if (showSessionError) {
      loginUrl.searchParams.set('authError', 'session')
    }
    const redirect = NextResponse.redirect(loginUrl)
    response.cookies.getAll().forEach(({ name, value, ...options }) => {
      redirect.cookies.set(name, value, options)
    })
    return redirect
  }

  let authTimeout: ReturnType<typeof setTimeout> | undefined
  let user
  let authError: Error | null
  try {
    const authCheck = supabase.auth.getUser()
    const timeout = new Promise<never>((_, reject) => {
      authTimeout = setTimeout(() => reject(new Error('Session verification timed out')), 6500)
    })
    const result = await Promise.race([authCheck, timeout])
    user = result.data.user
    authError = result.error
  } catch (error) {
    console.error('Session verification failed:', error)
    return redirectToLogin(true)
  } finally {
    if (authTimeout) {
      clearTimeout(authTimeout)
    }
  }

  if (authError) {
    console.error('Session verification returned an error:', authError)
    return redirectToLogin(true)
  }

  if (!user) {
    return redirectToLogin()
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
}

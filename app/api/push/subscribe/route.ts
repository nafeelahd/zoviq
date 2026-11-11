import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { isSameOriginRequest, isValidPushEndpoint, readJsonBody } from '@/lib/security'
import { checkRateLimit } from '@/lib/serverRateLimit'

type PushSubscriptionPayload = {
  endpoint?: string
  keys?: { p256dh?: string; auth?: string }
}

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRoleKey) return null
  return createSupabaseClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Cross-origin requests are not allowed' }, { status: 403 })
  }

  const supabase = createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Sign in to enable notifications' }, { status: 401 })

  const payload = await readJsonBody<PushSubscriptionPayload>(request, 4096)
  if (
    typeof payload?.endpoint !== 'string' ||
    payload.endpoint.length > 2048 ||
    typeof payload.keys?.p256dh !== 'string' ||
    typeof payload.keys.auth !== 'string' ||
    !/^[A-Za-z0-9+/_=-]{20,200}$/.test(payload.keys.p256dh) ||
    !/^[A-Za-z0-9+/_=-]{16,100}$/.test(payload.keys.auth)
  ) {
    return NextResponse.json({ error: 'Invalid push subscription' }, { status: 400 })
  }
  if (!isValidPushEndpoint(payload.endpoint)) {
    return NextResponse.json({ error: 'Invalid push endpoint' }, { status: 400 })
  }
  const rateLimit = await checkRateLimit(user.id, 'push-subscribe', 10, 3600)
  if (rateLimit !== 'allowed') {
    return NextResponse.json(
      { error: rateLimit === 'limited' ? 'Too many subscription changes. Try again later.' : 'Push security checks are unavailable' },
      { status: rateLimit === 'limited' ? 429 : 503, headers: rateLimit === 'limited' ? { 'Retry-After': '3600' } : undefined }
    )
  }

  const admin = createAdminClient()
  if (!admin) {
    return NextResponse.json({ error: 'Push subscription storage is not configured on the server' }, { status: 503 })
  }

  const { error } = await admin.from('push_subscriptions').upsert({
    user_id: user.id,
    endpoint: payload.endpoint,
    p256dh: payload.keys.p256dh,
    auth: payload.keys.auth,
  }, { onConflict: 'endpoint' })
  if (error) {
    console.error('Could not save push subscription:', error)
    return NextResponse.json({ error: 'Could not save push subscription' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(request: NextRequest) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Cross-origin requests are not allowed' }, { status: 403 })
  }

  const supabase = createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Sign in to manage notifications' }, { status: 401 })

  const payload = await readJsonBody<{ endpoint?: string }>(request, 4096)
  if (typeof payload?.endpoint !== 'string' || payload.endpoint.length > 2048) {
    return NextResponse.json({ error: 'A valid subscription endpoint is required' }, { status: 400 })
  }
  if (!isValidPushEndpoint(payload.endpoint)) {
    return NextResponse.json({ error: 'Invalid push endpoint' }, { status: 400 })
  }
  const rateLimit = await checkRateLimit(user.id, 'push-unsubscribe', 20, 60)
  if (rateLimit !== 'allowed') {
    return NextResponse.json(
      { error: rateLimit === 'limited' ? 'Too many subscription changes. Try again shortly.' : 'Push security checks are unavailable' },
      { status: rateLimit === 'limited' ? 429 : 503, headers: rateLimit === 'limited' ? { 'Retry-After': '60' } : undefined }
    )
  }

  const admin = createAdminClient()
  if (!admin) {
    return NextResponse.json({ error: 'Push subscription storage is not configured on the server' }, { status: 503 })
  }

  const { error } = await admin.from('push_subscriptions')
    .delete()
    .eq('user_id', user.id)
    .eq('endpoint', payload.endpoint)
  if (error) {
    console.error('Could not remove push subscription:', error)
    return NextResponse.json({ error: 'Could not remove push subscription' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

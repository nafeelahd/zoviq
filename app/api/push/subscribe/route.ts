import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

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
  const supabase = createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Sign in to enable notifications' }, { status: 401 })

  const payload = await request.json().catch(() => null) as PushSubscriptionPayload | null
  if (!payload?.endpoint || !payload.keys?.p256dh || !payload.keys.auth) {
    return NextResponse.json({ error: 'Invalid push subscription' }, { status: 400 })
  }
  try {
    const endpoint = new URL(payload.endpoint)
    if (endpoint.protocol !== 'https:') throw new Error('Invalid endpoint protocol')
  } catch {
    return NextResponse.json({ error: 'Invalid push endpoint' }, { status: 400 })
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
  const supabase = createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Sign in to manage notifications' }, { status: 401 })

  const payload = await request.json().catch(() => null) as { endpoint?: string } | null
  if (!payload?.endpoint) return NextResponse.json({ error: 'A subscription endpoint is required' }, { status: 400 })

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

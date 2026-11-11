import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import webpush from 'web-push'
import { createClient } from '@/lib/supabase/server'
import { isSameOriginRequest, isValidPushEndpoint, readJsonBody } from '@/lib/security'
import { checkRateLimit } from '@/lib/serverRateLimit'

type StoredNotification = {
  id: string
  user_id: string
  actor_id: string
  type: string
  group_id: string | null
}

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRoleKey) return null
  return createSupabaseClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

function pushContent(type: string, actorName: string) {
  const content: Record<string, { title: string; body: string; url: string }> = {
    message: { title: `Message from ${actorName}`, body: 'You have a new message.', url: '/messages' },
    group_message: { title: `Group message from ${actorName}`, body: 'There is a new message in your group.', url: '/groups' },
    follow: { title: 'New follower', body: `${actorName} started following you.`, url: '/people' },
    like: { title: 'New like', body: `${actorName} liked your post.`, url: '/feed' },
    comment: { title: 'New comment', body: `${actorName} commented on your post.`, url: '/feed' },
    video_call: { title: 'Incoming video call', body: `${actorName} is calling you.`, url: '/messages' },
    audio_call: { title: 'Incoming audio call', body: `${actorName} is calling you.`, url: '/messages' },
    group_join: { title: 'Group update', body: `${actorName} joined your group.`, url: '/groups' },
    group_request: { title: 'Group request', body: `${actorName} requested to join your group.`, url: '/groups' },
    group_accepted: { title: 'Group request accepted', body: `${actorName} accepted your request.`, url: '/groups' },
    group_added: { title: 'Added to a group', body: `${actorName} added you to a group.`, url: '/groups' },
    group_removed: { title: 'Group update', body: `${actorName} removed you from a group.`, url: '/groups' },
  }
  return content[type] || { title: 'Zoviq notification', body: 'You have a new notification.', url: '/notifications' }
}

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Cross-origin requests are not allowed' }, { status: 403 })
  }

  const supabase = createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Sign in to send notifications' }, { status: 401 })

  const payload = await readJsonBody<{ notificationIds?: unknown }>(request, 8 * 1024)
  const { notificationIds } = payload || {}
  if (!Array.isArray(notificationIds) || notificationIds.length === 0 || notificationIds.length > 50 ||
      notificationIds.some(id => typeof id !== 'string')) {
    return NextResponse.json({ error: 'Invalid notification IDs' }, { status: 400 })
  }
  const rateLimit = await checkRateLimit(user.id, 'push-send', 20, 60)
  if (rateLimit !== 'allowed') {
    return NextResponse.json(
      { error: rateLimit === 'limited' ? 'Too many push requests. Try again shortly.' : 'Push security checks are unavailable' },
      { status: rateLimit === 'limited' ? 429 : 503, headers: rateLimit === 'limited' ? { 'Retry-After': '60' } : undefined }
    )
  }

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT || 'mailto:noreply@zoviq.app'
  if (!publicKey || !privateKey) {
    return NextResponse.json({ error: 'Push notifications are not configured on the server' }, { status: 503 })
  }

  const admin = createAdminClient()
  if (!admin) return NextResponse.json({ error: 'Push notification storage is not configured' }, { status: 503 })

  try {
    webpush.setVapidDetails(subject, publicKey, privateKey)
    const { data: notifications, error: notificationError } = await admin
      .from('notifications')
      .select('id, user_id, actor_id, type, group_id')
      .in('id', notificationIds)
      .eq('actor_id', user.id)
    if (notificationError) throw notificationError
    if (!notifications?.length) return NextResponse.json({ delivered: 0 })

    const actorIds = Array.from(new Set(notifications.map(notification => notification.actor_id)))
    const { data: profiles, error: profileError } = await admin.from('profiles')
      .select('id, username')
      .in('id', actorIds)
    if (profileError) throw profileError
    const usernames = new Map((profiles || []).map(profile => [profile.id, profile.username]))

    let delivered = 0
    for (const notification of notifications as StoredNotification[]) {
      const { data: subscriptions, error: subscriptionsError } = await admin
        .from('push_subscriptions')
        .select('id, endpoint, p256dh, auth')
        .eq('user_id', notification.user_id)
      if (subscriptionsError) throw subscriptionsError
      const validSubscriptions = (subscriptions || []).filter(subscription =>
        isValidPushEndpoint(subscription.endpoint)
      )
      if (validSubscriptions.length !== subscriptions?.length) {
        console.error('Skipping invalid stored push endpoints for user:', notification.user_id)
      }

      const content = pushContent(notification.type, usernames.get(notification.actor_id) || 'Someone')
      const payload = JSON.stringify({ ...content, groupId: notification.group_id })
      await Promise.all(validSubscriptions.map(async subscription => {
        try {
          await webpush.sendNotification({
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          }, payload)
          delivered += 1
        } catch (error) {
          const statusCode = (error as { statusCode?: number }).statusCode
          if (statusCode === 404 || statusCode === 410) {
            const { error: deleteError } = await admin.from('push_subscriptions').delete().eq('id', subscription.id)
            if (deleteError) console.error('Could not remove expired push subscription:', deleteError)
          } else {
            console.error('Push delivery failed:', error)
          }
        }
      }))
    }

    return NextResponse.json({ delivered })
  } catch (error) {
    console.error('Push notification delivery failed:', error)
    return NextResponse.json({ error: 'Could not deliver push notifications' }, { status: 500 })
  }
}

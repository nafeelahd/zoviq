import type { SupabaseClient } from '@supabase/supabase-js'

export type AppNotification = {
  user_id: string
  actor_id: string
  type: string
  post_id?: string
  group_id?: string
  call_room?: string
  read?: boolean
}

export async function insertNotifications(
  supabase: SupabaseClient,
  notifications: AppNotification[]
) {
  if (!notifications.length) return

  const { data, error } = await supabase
    .from('notifications')
    .insert(notifications)
    .select('id')

  if (error) {
    console.error('Could not create notifications:', error)
    return
  }
  if (!data?.length) return

  const notificationIds = data.map(notification => notification.id)
  for (let index = 0; index < notificationIds.length; index += 50) {
    try {
      const response = await fetch('/api/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationIds: notificationIds.slice(index, index + 50) }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) {
        console.error('Could not send push notifications:', result.error || response.statusText)
      }
    } catch (pushError) {
      console.error('Could not send push notifications:', pushError)
    }
  }
}

export function insertNotification(supabase: SupabaseClient, notification: AppNotification) {
  return insertNotifications(supabase, [notification])
}

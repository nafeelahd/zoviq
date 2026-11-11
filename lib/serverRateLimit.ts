import { createClient } from '@supabase/supabase-js'

type RateLimitResult = 'allowed' | 'limited' | 'unavailable'

export async function checkRateLimit(
  userId: string,
  action: string,
  maxRequests: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRoleKey) {
    console.error('Rate limiting is unavailable: Supabase server credentials are not configured')
    return 'unavailable'
  }

  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data, error } = await admin.rpc('consume_api_rate_limit', {
    p_bucket_key: `${action}:${userId}`,
    p_max_requests: maxRequests,
    p_window_seconds: windowSeconds,
  })

  if (error || typeof data !== 'boolean') {
    console.error('Could not check API rate limit:', error || 'Invalid rate-limit response')
    return 'unavailable'
  }

  return data ? 'allowed' : 'limited'
}

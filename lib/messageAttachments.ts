import type { SupabaseClient } from '@supabase/supabase-js'

export async function removeMessageAttachments(
  supabase: SupabaseClient,
  urls: Array<string | null | undefined>
) {
  const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!projectUrl) throw new Error('Supabase URL is not configured')

  const projectOrigin = new URL(projectUrl).origin
  const storagePrefix = '/storage/v1/object/public/posts/'
  const paths = urls.flatMap(value => {
    if (!value) return []
    const url = new URL(value)
    if (url.origin !== projectOrigin || !url.pathname.startsWith(storagePrefix)) return []
    return [decodeURIComponent(url.pathname.slice(storagePrefix.length))]
  })

  if (paths.length === 0) return
  const { error } = await supabase.storage.from('posts').remove(paths)
  if (error) throw new Error(error.message)
}

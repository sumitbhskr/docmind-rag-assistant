import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const workspaceId = req.nextUrl.searchParams.get('workspace_id')
  if (!workspaceId) return NextResponse.json({ error: 'No workspace_id' }, { status: 400 })

  const { data: ws } = await supabase.from('workspaces').select('id').eq('id', workspaceId).eq('user_id', user.id).single()
  if (!ws) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data, error } = await supabase.from('tool_call_log').select('*').eq('workspace_id', workspaceId).order('created_at', { ascending: false }).limit(50)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ logs: data })
}

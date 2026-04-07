import { put } from '@vercel/blob'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  if (!process.env.BLOB_READ_WRITE_TOKEN)
    return NextResponse.json({ error: 'BLOB_READ_WRITE_TOKEN 미설정' }, { status: 500 })

  const form = await req.formData()
  const file = form.get('file') as File
  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })

  try {
    const { url } = await put(`insure/${Date.now()}_${file.name}`, file, { access: 'public' })
    return NextResponse.json({ url })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '알 수 없는 오류'
    return NextResponse.json({ error: `업로드 실패: ${msg}` }, { status: 500 })
  }
}

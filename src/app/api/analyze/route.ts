import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

export const maxDuration = 300

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const rateLimitMap = new Map<string, { count: number; resetAt: number }>()
const MAX_REQUESTS_PER_HOUR = parseInt(process.env.RATE_LIMIT_PER_HOUR || '20')

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(ip)
  if (!entry || now > entry.resetAt) { rateLimitMap.set(ip, { count: 1, resetAt: now + 3600_000 }); return true }
  if (entry.count >= MAX_REQUESTS_PER_HOUR) return false
  entry.count++
  return true
}

const JSON_SCHEMA = `{
  "summary": {
    "totalPolicies": 숫자,
    "duplicateCount": 숫자,
    "estimatedMonthlySavings": "월 X~Y만원",
    "riskLevel": "높음|중간|낮음"
  },
  "duplicates": [
    {
      "item": "항목명(짧게)",
      "policies": "보험사A vs 보험사B",
      "coverageA": "A보장내용(짧게)",
      "coverageB": "B보장내용(짧게)",
      "type": "완전중복|부분중복|유사중복",
      "monthlySavings": "월 X만원",
      "severity": "높음|중간|낮음",
      "action": "권고(한줄)"
    }
  ],
  "aiSummary": "요약 2문장",
  "recommendation": "권고 3문장",
  "disclaimer": "이 분석은 참고용입니다. 실제 변경 전 전문가 상담을 권장합니다."
}`

const SYSTEM_PROMPT = `당신은 대한민국 보험 전문 분석 AI입니다.
규칙:
1. 반드시 순수 JSON만 출력. 백틱/코드블록 절대 금지.
2. 모든 문자열 값은 간결하게 (30자 이내 권장).
3. JSON이 완전히 닫힐 때까지 출력 (중간에 끊지 말 것).
4. duplicates 배열의 각 항목은 실제 중복이 명확한 것만 포함.`

function getText(msg: Anthropic.Message): string {
  return msg.content
    .filter(b => b.type === 'text')
    .map(b => (b as { type: 'text'; text: string }).text)
    .join('')
    .trim()
}

function parseResult(raw: string) {
  let clean = raw.replace(/```json\n?|```\n?/g, '').trim()
  const start = clean.indexOf('{')
  const end = clean.lastIndexOf('}')
  if (start !== -1 && end !== -1) clean = clean.slice(start, end + 1)

  try {
    return JSON.parse(clean)
  } catch (e) {
    let fixed = clean
    const quoteCount = (fixed.match(/"/g) || []).length
    if (quoteCount % 2 !== 0) fixed += '"'
    const opens = Array.from(fixed).reduce((acc: string[], c: string) => {
      if (c === '{') acc.push('}')
      if (c === '[') acc.push(']')
      if (c === '}' || c === ']') acc.pop()
      return acc
    }, [])
    fixed += opens.reverse().join('')
    try {
      return JSON.parse(fixed)
    } catch {
      throw new Error(`JSON 파싱 실패: ${String(e).slice(0, 100)}`)
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function callClaude(messages: any[], system?: string) {
  return client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    system: system || SYSTEM_PROMPT,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    messages: messages as any,
  })
}

// ── PDF 직접 분석 (document API) ──────────────────────────
async function analyzeWithPDF(pdfs: { data: string; name: string }[]) {
  const content = [
    ...pdfs.map(pdf => ({
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: pdf.data },
    })),
    {
      type: 'text',
      text: `위 PDF 보험 문서들을 분석하여 중복 보장 항목을 파악하고 아래 JSON 형식으로만 응답하세요.\n\n${JSON_SCHEMA}\n\n파일명: ${pdfs.map(p => p.name).join(', ')}`,
    },
  ]
  return parseResult(getText(await callClaude([{ role: 'user', content }])))
}

// ── 이미지 Vision 분석 ────────────────────────────────────
async function analyzeWithImages(
  images: { data: string; mediaType: string }[],
  fileNames: string[]
) {
  type ImgMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
  const extractContent = [
    ...images.slice(0, 10).map(img => ({
      type: 'image' as const,
      source: {
        type: 'base64' as const,
        media_type: img.mediaType as ImgMediaType,
        data: img.data,
      },
    })),
    {
      type: 'text' as const,
      text: '위 보험 문서 이미지들에서 보험사명, 상품명, 보험료, 모든 보장항목명과 가입금액을 추출해서 텍스트로 정리해주세요.',
    },
  ]
  const extracted = getText(
    await callClaude(
      [{ role: 'user', content: extractContent }],
      '보험 문서에서 정보를 추출하는 AI입니다. 모든 보장 항목을 빠짐없이 추출해주세요.'
    )
  )
  const analyzeMsg = await callClaude([{
    role: 'user',
    content: `다음 보험 정보에서 중복 보장 항목을 파악하고 아래 JSON으로만 응답하세요.\n\n${JSON_SCHEMA}\n\n파일: ${fileNames.join(', ')}\n\n${extracted.slice(0, 8000)}`,
  }])
  return parseResult(getText(analyzeMsg))
}

// ── 텍스트 분석 ───────────────────────────────────────────
async function analyzeWithText(text: string, fileNames: string[]) {
  const msg = await callClaude([{
    role: 'user',
    content: `다음 보험 문서를 분석하여 중복 보장 항목을 파악하고 아래 JSON으로만 응답하세요.\n\n${JSON_SCHEMA}\n\n파일: ${fileNames.join(', ')}\n\n${text.slice(0, 12000)}`,
  }])
  return parseResult(getText(msg))
}

// ── Main Handler ──────────────────────────────────────────
export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') ?? 'unknown'
  if (!checkRateLimit(ip))
    return NextResponse.json({ error: '요청 한도 초과. 1시간 후 재시도하세요.' }, { status: 429 })
  if (!process.env.ANTHROPIC_API_KEY)
    return NextResponse.json({ error: '서버 설정 오류: API 키 없음' }, { status: 500 })

  let body: {
    text?: string
    fileNames: string[]
    images?: { data: string; mediaType: string }[]
    pdfs?: { data: string; name: string }[]
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '잘못된 요청 형식' }, { status: 400 })
  }

  try {
    let result
    if (body.pdfs && body.pdfs.length > 0) {
      result = await analyzeWithPDF(body.pdfs)
    } else if (body.images && body.images.length > 0) {
      result = await analyzeWithImages(body.images, body.fileNames)
    } else if (body.text && body.text.trim()) {
      result = await analyzeWithText(body.text, body.fileNames)
    } else {
      return NextResponse.json({ error: '분석할 문서가 없습니다.' }, { status: 400 })
    }
    return NextResponse.json(result)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '알 수 없는 오류'
    console.error('분석 오류:', msg)
    return NextResponse.json({ error: `AI 분석 오류: ${msg}` }, { status: 500 })
  }
}

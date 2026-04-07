import type { Metadata } from 'next'
export const metadata: Metadata = {
  title: '보험 중복보장 분석기 | insure.dbzone.kr',
  description: 'AI가 보험 문서를 분석하여 중복 보장 항목을 찾아드립니다. 불필요한 보험료를 절감하세요.',
  keywords: '보험 중복, 보험료 절감, 보험 분석, AI 보험',
  openGraph: {
    title: '보험 중복보장 AI 분석기',
    description: 'AI가 내 보험의 중복 보장을 찾아드립니다',
    url: 'https://insure.dbzone.kr',
  }
}
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;700&family=DM+Serif+Display&display=swap" rel="stylesheet" />
      </head>
      <body style={{ margin: 0, padding: 0 }}>{children}</body>
    </html>
  )
}

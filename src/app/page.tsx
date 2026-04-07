'use client'
import { useState, useRef, useCallback } from 'react'
import styles from './page.module.css'

interface Duplicate {
  item: string; policies: string; coverageA: string; coverageB: string
  type: string; monthlySavings: string; severity: string; action: string
}
interface AnalysisResult {
  summary: { totalPolicies: number; duplicateCount: number; estimatedMonthlySavings: string; riskLevel: string }
  duplicates: Duplicate[]; aiSummary: string; recommendation: string; disclaimer: string
}
interface UploadedFile { file: File; name: string; size: number }

const STEPS = ['파일 변환 중...', 'AI가 문서를 읽는 중...', '보장 항목 추출 중...', '중복 패턴 분석 중...', '보고서 생성 중...']

const fmtSize = (b: number) => b < 1024 ? b+'B' : b < 1048576 ? (b/1024).toFixed(1)+'KB' : (b/1048576).toFixed(1)+'MB'
const isPDF = (n: string) => /\.pdf$/i.test(n)
const isImage = (n: string) => /\.(jpg|jpeg|png|gif|webp)$/i.test(n)
const fileIcon = (n: string) => isPDF(n) ? '📕' : isImage(n) ? '🖼️' : /\.docx?$/i.test(n) ? '📘' : '📄'
const getMediaType = (n: string) => /\.png$/i.test(n) ? 'image/png' : /\.gif$/i.test(n) ? 'image/gif' : /\.webp$/i.test(n) ? 'image/webp' : 'image/jpeg'

async function toText(file: File): Promise<string> {
  return new Promise(res => {
    const r = new FileReader()
    r.onload = e => res((e.target?.result as string) || '')
    r.onerror = () => res('')
    r.readAsText(file, 'utf-8')
  })
}

export default function Home() {
  const [files, setFiles] = useState<UploadedFile[]>([])
  const [dragging, setDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [stepMsg, setStepMsg] = useState(STEPS[0])
  const [stepIdx, setStepIdx] = useState(0)
  const [error, setError] = useState('')
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const ivRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const addFiles = useCallback((list: FileList | File[]) => {
    setFiles(prev => {
      const names = new Set(prev.map(f => f.name))
      return [...prev, ...Array.from(list).filter(f => !names.has(f.name)).map(f => ({ file: f, name: f.name, size: f.size }))]
    })
  }, [])

  const uploadToBlob = async (file: File): Promise<string> => {
    const form = new FormData()
    form.append('file', file)
    const res = await fetch('/api/upload', { method: 'POST', body: form })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || '업로드 실패')
    return data.url as string
  }

  const analyze = async () => {
    setError(''); setResult(null); setLoading(true); setStepIdx(0); setStepMsg(STEPS[0])
    let si = 0
    ivRef.current = setInterval(() => { si = (si + 1) % STEPS.length; setStepIdx(si); setStepMsg(STEPS[si]) }, 2000)

    try {
      const pdfFiles = files.filter(f => isPDF(f.name))
      const imgFiles = files.filter(f => isImage(f.name))
      const txtFiles = files.filter(f => !isPDF(f.name) && !isImage(f.name))
      const fileNames = files.map(f => f.name)
      let body: Record<string, unknown>

      if (pdfFiles.length > 0) {
        setStepMsg('PDF 업로드 중...')
        const pdfs = await Promise.all(pdfFiles.map(async f => ({ url: await uploadToBlob(f.file), name: f.name })))
        let extraText = ''
        for (const f of txtFiles) extraText += `\n\n=== ${f.name} ===\n${(await toText(f.file)).slice(0, 3000)}`
        body = { pdfs, fileNames, text: extraText }
      } else if (imgFiles.length > 0) {
        setStepMsg('이미지 업로드 중...')
        const images = await Promise.all(imgFiles.map(async f => ({ url: await uploadToBlob(f.file), mediaType: getMediaType(f.name) })))
        let extraText = ''
        for (const f of txtFiles) extraText += `\n\n=== ${f.name} ===\n${(await toText(f.file)).slice(0, 3000)}`
        body = { images, fileNames, text: extraText }
      } else {
        let combined = ''
        for (const f of txtFiles) combined += `\n\n=== ${f.name} ===\n${(await toText(f.file)).slice(0, 4000)}`
        body = { text: combined, fileNames }
      }

      setStepMsg('AI 중복 분석 중...')
      const res = await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `오류 ${res.status}`)
      setResult(data)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '알 수 없는 오류')
    } finally {
      if (ivRef.current) clearInterval(ivRef.current)
      setLoading(false)
    }
  }

  const exportTxt = () => {
    if (!result) return
    const rows = result.duplicates.map(d => `${d.item}\t${d.policies}\t${d.type}\t${d.monthlySavings}\t${d.severity}`).join('\n')
    const txt = ['보험 중복 보장 분석 보고서','='.repeat(44),`분석 일시: ${new Date().toLocaleString('ko-KR')}`,`파일: ${files.map(f=>f.name).join(', ')}`,'','[요약]',`• 분석 보험: ${result.summary.totalPolicies}개`,`• 중복 항목: ${result.summary.duplicateCount}개`,`• 절감 예상: ${result.summary.estimatedMonthlySavings}`,`• 위험도: ${result.summary.riskLevel}`,'','[AI 요약]',result.aiSummary,'','[중복 상세]','항목\t보험\t유형\t절감\t심각도',rows,'','[권고사항]',result.recommendation,'','[안내]',result.disclaimer].join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([txt], { type: 'text/plain;charset=utf-8' }))
    a.download = `보험중복분석_${new Date().toLocaleDateString('ko-KR').replace(/\.\s*/g,'-').replace(/-$/,'')}.txt`
    a.click()
  }

  const sevClass = (s: string) => s==='높음' ? styles.sevH : s==='중간' ? styles.sevM : styles.sevL
  const riskClass = (s: string) => s==='높음' ? styles.cardRed : s==='중간' ? styles.cardAmber : styles.cardGreen

  return (
    <main className={styles.main}>
      <div className={styles.app}>
        <header className={styles.header}>
          <div className={styles.badge}><span className={styles.dot}/>AI 보험 중복 분석기</div>
          <h1 className={styles.h1}>보험 <em className={styles.em}>중복보장</em><br/>자동 분석 시스템</h1>
          <p className={styles.subtitle}>보험 문서를 업로드하면 AI가 중복 보장 항목을 파악하고<br/>절감 가능한 보험료와 맞춤형 보고서를 생성합니다</p>
          <div className={styles.supportedFormats}>
            <span className={styles.formatBadge} style={{color:'#fc8181',borderColor:'rgba(252,129,129,0.3)'}}>📕 PDF</span>
            <span className={styles.formatBadge} style={{color:'#f6ad55',borderColor:'rgba(246,173,85,0.3)'}}>🖼️ JPG · PNG</span>
            <span className={styles.formatBadge} style={{color:'#63b3ed',borderColor:'rgba(99,179,237,0.3)'}}>📄 TXT · DOCX</span>
          </div>
        </header>

        <div
          className={`${styles.uploadZone} ${dragging ? styles.over : ''}`}
          onDragOver={e=>{e.preventDefault();setDragging(true)}}
          onDragLeave={()=>setDragging(false)}
          onDrop={e=>{e.preventDefault();setDragging(false);addFiles(e.dataTransfer.files)}}
          onClick={()=>fileInputRef.current?.click()}
        >
          <input ref={fileInputRef} type="file" multiple accept=".pdf,.txt,.doc,.docx,.jpg,.jpeg,.png,.gif,.webp" style={{display:'none'}} onChange={e=>e.target.files&&addFiles(e.target.files)}/>
          <div className={styles.uploadIcon}>📋</div>
          <div className={styles.uploadTitle}>보험 문서를 드래그하거나 클릭하여 업로드</div>
          <div className={styles.uploadSub}>PDF · JPG · PNG · TXT · DOCX 지원 &nbsp;·&nbsp; 여러 파일 동시 업로드</div>
        </div>

        {files.length > 0 && (
          <div className={styles.fileList}>
            {files.map((f,i) => (
              <div key={f.name} className={styles.fileItem}>
                <span className={styles.fileIcon}>{fileIcon(f.name)}</span>
                <div className={styles.fileInfo}>
                  <div className={styles.fileName}>{f.name}</div>
                  <div className={styles.fileSize}>{fmtSize(f.size)}</div>
                </div>
                <span className={styles.typeBadge} style={isPDF(f.name)?{color:'#fc8181',borderColor:'rgba(252,129,129,0.4)'}:isImage(f.name)?{color:'#f6ad55',borderColor:'rgba(246,173,85,0.4)'}:{color:'#63b3ed',borderColor:'rgba(99,179,237,0.4)'}}>
                  {isPDF(f.name)?'PDF':isImage(f.name)?'IMG':'TXT'}
                </span>
                <button className={styles.fileRm} onClick={()=>setFiles(p=>p.filter((_,j)=>j!==i))}>✕</button>
              </div>
            ))}
          </div>
        )}

        {error && <div className={styles.errorBox}>{error}</div>}

        <button className={styles.btnAnalyze} disabled={files.length===0||loading} onClick={analyze}>
          {loading ? '⏳ 분석 중...' : '🔍 AI 중복 분석 시작'}
        </button>

        {loading && (
          <div className={styles.loadingBox}>
            <div className={styles.spinner}/>
            <div className={styles.loadingMsg}>AI가 보험 문서를 분석하고 있습니다</div>
            <div className={styles.loadingStep}>{stepMsg}</div>
            <div className={styles.loadingDots}>
              {STEPS.map((_,i)=><span key={i} className={`${styles.loadingDot} ${i===stepIdx?styles.loadingDotActive:''}`}/>)}
            </div>
          </div>
        )}

        {result && (
          <div className={styles.result}>
            <div className={styles.resultHeader}>
              <div>
                <div className={styles.resultTitle}>분석 완료 보고서</div>
                <div className={styles.resultMeta}>{new Date().toLocaleString('ko-KR',{year:'numeric',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'})} · 파일 {files.length}개</div>
              </div>
              <div className={styles.exportBtns}>
                <button className={styles.btnExport} onClick={exportTxt}>📄 TXT 저장</button>
                <button className={styles.btnExport} onClick={()=>window.print()}>🖨️ 인쇄</button>
              </div>
            </div>

            <div className={styles.cards}>
              <div className={`${styles.card} ${styles.cardRed}`}><div className={styles.cardVal}>{result.summary.duplicateCount}</div><div className={styles.cardLbl}>중복 보장 항목</div></div>
              <div className={styles.card}><div className={`${styles.cardVal} ${styles.cardValNeutral}`}>{result.summary.totalPolicies}</div><div className={styles.cardLbl}>분석 보험 수</div></div>
              <div className={`${styles.card} ${styles.cardAmber}`}><div className={`${styles.cardVal} ${styles.cardValSm}`}>{result.summary.estimatedMonthlySavings}</div><div className={styles.cardLbl}>절감 예상액</div></div>
              <div className={`${styles.card} ${riskClass(result.summary.riskLevel)}`}><div className={`${styles.cardVal} ${styles.cardValSm}`}>{result.summary.riskLevel}</div><div className={styles.cardLbl}>중복 위험도</div></div>
            </div>

            <div className={styles.aiBox}>
              <div className={styles.aiBoxTitle}>⬡ AI 분석 요약</div>
              <div className={styles.aiBody}>{result.aiSummary}</div>
            </div>

            <div className={styles.secLabel}>중복 보장 상세 목록</div>
            <div className={styles.tblWrap}>
              <table className={styles.tbl}>
                <thead><tr><th>중복 항목</th><th>해당 보험</th><th>보장 내용 비교</th><th>중복 유형</th><th>절감 예상</th><th>심각도</th></tr></thead>
                <tbody>
                  {result.duplicates.length===0
                    ? <tr><td colSpan={6} className={styles.noData}>중복 보장 항목이 발견되지 않았습니다</td></tr>
                    : result.duplicates.map((d,i)=>(
                      <tr key={i}>
                        <td><strong className={styles.itemName}>{d.item}</strong><div className={styles.itemAction}>{d.action}</div></td>
                        <td className={styles.tdMuted}>{d.policies}</td>
                        <td className={styles.tdCoverage}><div className={styles.covA}>A: {d.coverageA}</div><div className={styles.covB}>B: {d.coverageB}</div></td>
                        <td className={styles.tdType}>{d.type}</td>
                        <td className={styles.tdSavings}>{d.monthlySavings}</td>
                        <td><span className={`${styles.sevBadge} ${sevClass(d.severity)}`}>{d.severity}</span></td>
                      </tr>
                    ))
                  }
                </tbody>
              </table>
            </div>

            <div className={styles.secLabel}>AI 권고사항</div>
            <div className={styles.recBox}>{result.recommendation}</div>
            <div className={styles.disclaimer}>{result.disclaimer}</div>
          </div>
        )}

        <footer className={styles.footer}>
          <p>insure.dbzone.kr &nbsp;·&nbsp; AI 기반 보험 중복 분석 서비스</p>
          <p>본 서비스는 참고용이며, 실제 보험 변경 전 전문가 상담을 권장합니다.</p>
        </footer>
      </div>
    </main>
  )
}

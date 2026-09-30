import { useEffect, useState } from 'react'
import { ArrowLeft, CheckCircle2, CircleX, Clock3, ExternalLink, LoaderCircle, MonitorPlay } from 'lucide-react'

type ExecutionState = {
  status: 'running' | 'waiting_delay' | 'waiting_approval' | 'waiting_page' | 'rejected' | 'completed'
  currentStepId?: string
  currentStepLabel?: string
  currentUrl?: string
  waitUntil?: number
  message?: string
}

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000'

function ExecutionView({ executionId }: { executionId: string }) {
  const [state, setState] = useState<ExecutionState>()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [now, setNow] = useState(0)

  useEffect(() => {
    let active = true
    const refresh = async () => {
      try {
        const response = await fetch(`${API_URL}/api/executions/${encodeURIComponent(executionId)}`)
        const result = await response.json()
        if (!response.ok) throw new Error(result.error ?? '実行状態を取得できません')
        if (active) {
          setState(result as ExecutionState)
          setError('')
        }
      } catch (requestError) {
        if (active) setError(requestError instanceof Error ? requestError.message : 'APIに接続できません')
      }
    }
    void refresh()
    const pollId = window.setInterval(() => {
      void refresh()
      setNow(Date.now())
    }, 1000)
    return () => {
      active = false
      window.clearInterval(pollId)
    }
  }, [executionId])

  const sendAction = async (action: 'yes' | 'no' | 'continue') => {
    setBusy(true)
    setError('')
    try {
      const response = await fetch(`${API_URL}/api/executions/${encodeURIComponent(executionId)}/${action === 'continue' ? 'continue' : 'approval'}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        ...(action === 'continue' ? {} : { body: JSON.stringify({ decision: action }) }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error ?? '操作を受け付けられませんでした')
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'APIに接続できません')
    } finally {
      setBusy(false)
    }
  }

  const remainingSeconds = state?.waitUntil ? Math.max(0, Math.ceil((state.waitUntil - now) / 1000)) : 0
  const isTerminal = state?.status === 'completed' || state?.status === 'rejected'

  return (
    <main className="execution-shell">
      <header className="execution-topbar">
        <a className="brand" href="/"><span className="brand-mark"><MonitorPlay size={18} /></span><span>flowcraft</span></a>
        <a className="execution-back" href="/"><ArrowLeft size={15} />ワークフロー編集へ</a>
      </header>
      <section className="execution-content">
        <div className="execution-overline">WORKFLOW EXECUTION</div>
        <h1>{state?.currentStepLabel ?? 'ワークフロー実行'}</h1>
        <p className="execution-id">{executionId}</p>

        {error && <div className="execution-error" role="alert">{error}</div>}
        {!state ? (
          <div className="execution-state-panel"><LoaderCircle className="execution-spinner" size={22} /><p>実行状態を確認しています</p></div>
        ) : state.status === 'waiting_approval' ? (
          <div className="execution-state-panel execution-state-panel--approval">
            <span className="execution-state-icon"><CheckCircle2 size={23} /></span>
            <h2>承認を確認してください</h2>
            <p>内容を確認し、次の操作を選択してください。</p>
            <div className="execution-actions">
              <button className="execution-button execution-button--reject" onClick={() => void sendAction('no')} disabled={busy}><CircleX size={17} />いいえ</button>
              <button className="execution-button execution-button--approve" onClick={() => void sendAction('yes')} disabled={busy}><CheckCircle2 size={17} />はい</button>
            </div>
          </div>
        ) : state.status === 'waiting_page' ? (
          <div className="execution-page-panel">
            <div className="execution-page-toolbar"><span><MonitorPlay size={15} />指定画面</span><a href={state.currentUrl} target="_blank" rel="noreferrer">別タブで開く<ExternalLink size={13} /></a></div>
            <iframe title={state.currentStepLabel ?? '指定された画面'} src={state.currentUrl} sandbox="allow-forms allow-scripts allow-popups" referrerPolicy="no-referrer" />
            <div className="execution-page-footer"><span>画面を確認したら次へ進んでください</span><button className="execution-button execution-button--approve" onClick={() => void sendAction('continue')} disabled={busy}><CheckCircle2 size={16} />次へ</button></div>
          </div>
        ) : state.status === 'waiting_delay' ? (
          <div className="execution-state-panel">
            <span className="execution-state-icon execution-state-icon--waiting"><Clock3 size={23} /></span>
            <h2>待機中</h2>
            <p>設定された時間が経過すると、自動で次のノードへ進みます。</p>
            <strong className="execution-countdown">{remainingSeconds} 秒</strong>
          </div>
        ) : state.status === 'rejected' ? (
          <div className="execution-state-panel execution-state-panel--rejected">
            <span className="execution-state-icon"><CircleX size={23} /></span>
            <h2>{state.message ?? '拒否されました'}</h2>
            <p>このワークフローはここで終了しました。</p>
          </div>
        ) : state.status === 'completed' ? (
          <div className="execution-state-panel execution-state-panel--complete">
            <span className="execution-state-icon"><CheckCircle2 size={23} /></span>
            <h2>完了しました</h2>
            <p>すべてのノードが正常に実行されました。</p>
          </div>
        ) : (
          <div className="execution-state-panel"><LoaderCircle className="execution-spinner" size={22} /><h2>処理中</h2><p>次のノードへ進んでいます。</p></div>
        )}
        {isTerminal && <a className="execution-finish-link" href="/">ワークフロー編集へ戻る</a>}
      </section>
    </main>
  )
}

export default ExecutionView

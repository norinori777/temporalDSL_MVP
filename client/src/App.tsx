import { useEffect, useMemo, useState } from 'react'
import { Activity, ArrowDown, Check, CheckCircle2, ChevronDown, CircleHelp, Clock3, Cloud, FileText, GitBranch, MonitorPlay, Plus, Play, Radio, Save, Settings2, Undo2, Webhook, Workflow, Zap } from 'lucide-react'
import './App.css'
import DemoPage from './DemoPages.js'
import ExecutionView from './ExecutionView.js'

type NodeKind = 'trigger' | 'delay' | 'webhook' | 'approval' | 'page' | 'input' | 'condition'
type StepData = { label: string; seconds?: number; url?: string; method?: 'GET' | 'POST'; conditionField?: 'inputA' | 'inputB'; conditionOperator?: string; conditionValue?: string }
type FlowNode = { id: string; type: NodeKind; position: { x: number; y: number }; data: StepData }
type FlowEdge = { id: string; source: string; target: string; sourceHandle?: string }
const returnHandles = new Set(['ng-return', 'no-return'])

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000'
const workflowId = 'customer-onboarding'

const starterNodes: FlowNode[] = [
  { id: 'start', type: 'trigger', position: { x: 340, y: 72 }, data: { label: '顧客登録' } },
  { id: 'delay', type: 'delay', position: { x: 340, y: 248 }, data: { label: '初回フォローまで待機', seconds: 10 } },
]
const starterEdges: FlowEdge[] = [{ id: 'start-delay', source: 'start', target: 'delay' }]

function getPreviousNodes(nodeId: string, nodes: FlowNode[], edges: FlowEdge[]) {
  const previousIds = new Set<string>()
  const pending = [nodeId]
  while (pending.length > 0) {
    const target = pending.pop()!
    for (const edge of edges) {
      if (edge.target !== target || returnHandles.has(edge.sourceHandle ?? '') || previousIds.has(edge.source)) continue
      previousIds.add(edge.source)
      pending.push(edge.source)
    }
  }
  return nodes.filter((node) => node.id !== nodeId && node.type !== 'trigger' && previousIds.has(node.id))
}

function WorkflowReturnNote({ targetId, nodes, onSelect }: { targetId: string; nodes: FlowNode[]; onSelect: (id: string) => void }) {
  const target = nodes.find((node) => node.id === targetId)
  if (!target) return null
  return <button type="button" className="workflow-return-note" onClick={() => onSelect(target.id)}><Undo2 size={13} />前の工程へ戻る：{target.data.label}</button>
}

function WorkflowBlock({ node, selected, onSelect, detailsOverride }: { node: FlowNode; selected: boolean; onSelect: () => void; detailsOverride?: string }) {
  const { data, type } = node
  const details = detailsOverride ?? (type === 'trigger'
    ? 'イベントで開始'
    : type === 'delay'
      ? `${data.seconds ?? 1} 秒待機`
      : type === 'webhook'
        ? `${data.method ?? 'POST'} · ${data.url || 'URLを設定'}`
        : type === 'page'
          ? data.url || '表示URLを設定'
          : type === 'condition'
            ? `${data.conditionField ?? 'inputA'} ${data.conditionOperator ?? 'equals'} ${data.conditionValue || '値を設定'}`
          : type === 'input'
            ? '入力A: 文字列 · 入力B: 数字'
            : 'はいで次へ · いいえで終了')
    const icon = type === 'trigger' ? <Zap size={16} /> : type === 'delay' ? <Clock3 size={16} /> : type === 'webhook' ? <Webhook size={16} /> : type === 'page' ? <MonitorPlay size={16} /> : type === 'input' ? <FileText size={16} /> : type === 'condition' ? <GitBranch size={16} /> : <CheckCircle2 size={16} />
    const kind = type === 'trigger' ? 'トリガー' : type === 'delay' ? 'タイマー' : type === 'webhook' ? 'Webhook送信' : type === 'page' ? '画面表示' : type === 'input' ? '入力' : type === 'condition' ? '条件分岐' : '承認'

  return (
    <button type="button" className={`workflow-block workflow-block--${type}${selected ? ' is-selected' : ''}`} onClick={onSelect}>
      <span className="workflow-block__icon">{icon}</span>
      <span className="workflow-block__copy">
        <span className="workflow-block__kind">{kind}</span>
        <strong>{data.label}</strong>
        <small>{details}</small>
      </span>
      <ChevronDown className="workflow-block__select" size={15} />
    </button>
  )
}

function WorkflowStack({ nodeId, nodes, edges, selectedId, onSelect }: {
  nodeId: string
  nodes: FlowNode[]
  edges: FlowEdge[]
  selectedId: string
  onSelect: (id: string) => void
}) {
  const node = nodes.find((item) => item.id === nodeId)
  if (!node) return null

  const outgoing = edges.filter((edge) => edge.source === node.id)
  const approvalReturnTargetId = node.type === 'approval' ? outgoing.find((edge) => edge.sourceHandle === 'no-return')?.target : undefined
  const renderTarget = (targetId: string | undefined) => targetId
    ? <WorkflowStack nodeId={targetId} nodes={nodes} edges={edges} selectedId={selectedId} onSelect={onSelect} />
    : <div className="workflow-branch__empty">設定から分岐先を選択</div>

  return (
    <div className={`workflow-stack${node.type === 'condition' ? ' workflow-stack--condition' : ''}`}>
      <WorkflowBlock node={node} selected={selectedId === node.id} onSelect={() => onSelect(node.id)} detailsOverride={approvalReturnTargetId ? 'いいえで前の工程へ戻る' : undefined} />
      {node.type === 'condition' ? (
        <div className="workflow-branches">
          {(['ok', 'ng'] as const).map((branch) => {
            const branchName = branch === 'ok' ? '条件OK' : '条件NG'
            const targetId = outgoing.find((edge) => edge.sourceHandle === branch)?.target
            const returnTargetId = branch === 'ng' ? outgoing.find((edge) => edge.sourceHandle === 'ng-return')?.target : undefined
            return <section className={`workflow-branch workflow-branch--${branch}`} key={branch}><h3>{branchName}</h3>{returnTargetId ? <WorkflowReturnNote targetId={returnTargetId} nodes={nodes} onSelect={onSelect} /> : renderTarget(targetId)}</section>
          })}
        </div>
      ) : (
        (() => {
          const targetId = outgoing.find((edge) => !edge.sourceHandle)?.target
          const returnTargetId = approvalReturnTargetId
          return <>{returnTargetId && <WorkflowReturnNote targetId={returnTargetId} nodes={nodes} onSelect={onSelect} />}{targetId && <><div className="workflow-connector"><ArrowDown size={16} /></div>{renderTarget(targetId)}</>}</>
        })()
      )}
    </div>
  )
}

function WorkflowEditor() {
  const [nodes, setNodes] = useState<FlowNode[]>(starterNodes)
  const [edges, setEdges] = useState<FlowEdge[]>(starterEdges)
  const [selectedId, setSelectedId] = useState('delay')
  const [name, setName] = useState('顧客オンボーディング')
  const [saved, setSaved] = useState(false)
  const [message, setMessage] = useState('')
  const [serviceOnline, setServiceOnline] = useState(false)
  const [isBusy, setIsBusy] = useState(false)

  const selectedNode = useMemo(() => nodes.find((node) => node.id === selectedId), [nodes, selectedId])
  const orphanRoots = useMemo(() => {
    const reachable = new Set<string>()
    const visit = (nodeId: string) => {
      if (reachable.has(nodeId)) return
      reachable.add(nodeId)
      edges.filter((edge) => edge.source === nodeId).forEach((edge) => visit(edge.target))
    }
    const startNode = nodes.find((node) => node.type === 'trigger')
    if (startNode) visit(startNode.id)
    const orphanIds = new Set(nodes.filter((node) => !reachable.has(node.id)).map((node) => node.id))
    return nodes.filter((node) => orphanIds.has(node.id) && !edges.some((edge) => edge.target === node.id && orphanIds.has(edge.source)))
  }, [edges, nodes])

  useEffect(() => {
    fetch(`${API_URL}/api/health`)
      .then((response) => setServiceOnline(response.ok))
      .catch(() => setServiceOnline(false))
    fetch(`${API_URL}/api/workflows`)
      .then(async (response) => {
        if (!response.ok) return
        const definitions = await response.json() as { id: string; name: string; nodes: FlowNode[]; edges: FlowEdge[] }[]
        const existing = definitions.find((definition) => definition.id === workflowId)
        if (!existing) return
        setName(existing.name)
        setNodes(existing.nodes)
        setEdges(existing.edges)
        setSelectedId(existing.nodes.find((node) => node.type !== 'trigger')?.id ?? existing.nodes[0]?.id ?? '')
        setSaved(true)
      })
      .catch(() => undefined)
  }, [setEdges, setNodes])

  const updateData = (patch: Partial<StepData>) => {
    if (!selectedNode) return
    setNodes((current) => current.map((node) => node.id === selectedNode.id
      ? { ...node, data: { ...node.data, ...patch } }
      : node))
    setSaved(false)
  }

  const addStep = (type: Exclude<NodeKind, 'trigger'>) => {
    const previous = nodes.find((node) => node.id === selectedId) ?? nodes[nodes.length - 1]
    if (!previous) return
    const outgoing = edges.filter((edge) => edge.source === previous.id)
    const usedBranches = new Set(outgoing.map((edge) => edge.sourceHandle))
    const sourceHandle = previous.type === 'condition'
      ? !usedBranches.has('ok') ? 'ok' : !usedBranches.has('ng') && !usedBranches.has('ng-return') ? 'ng' : undefined
      : undefined
    if (previous.type === 'condition' && !sourceHandle) {
      setMessage('OK/NGの分岐先は設定から選択してください')
      return
    }
    const id = `${type}-${crypto.randomUUID().slice(0, 6)}`
    const data: StepData = type === 'delay'
      ? { label: '一定時間待機', seconds: 5 }
      : type === 'webhook'
        ? { label: 'Webhookを送信', method: 'POST', url: '' }
        : type === 'page'
          ? { label: '案内ページを表示', url: new URL('/demo-pages/welcome.html', window.location.origin).toString() }
          : type === 'input'
            ? { label: '入力項目を入力' }
              : type === 'condition'
                ? { label: '入力値を判定', conditionField: 'inputA', conditionOperator: 'equals', conditionValue: '' }
                : { label: '内容を承認' }
      setNodes((current) => [...current, { id, type, position: { x: 0, y: current.length * 160 }, data }])
      const nextEdge = outgoing.find((edge) => !edge.sourceHandle)
      setEdges((current) => [
        ...current.filter((edge) => edge !== nextEdge),
        { id: `${previous.id}-${sourceHandle ?? 'next'}-${id}`, source: previous.id, target: id, ...(sourceHandle ? { sourceHandle } : {}) },
        ...(nextEdge ? [{ ...nextEdge, source: id }] : []),
      ])
      setSelectedId(previous.type === 'condition' ? previous.id : id)
    setSaved(false)
  }

    const setBranchTarget = (branch: 'ok' | 'ng', selection: string) => {
      if (selectedNode?.type !== 'condition') return
      const returning = branch === 'ng' && selection.startsWith('return:')
      const targetId = returning ? selection.slice('return:'.length) : selection
      const duplicateTarget = targetId && !returning && edges.some((edge) => edge.target === targetId && !returnHandles.has(edge.sourceHandle ?? '') && !(edge.source === selectedNode.id && edge.sourceHandle === branch))
      if (duplicateTarget) {
        setMessage('同じノードを複数の分岐先には指定できません')
        return
      }
      setEdges((current) => [
        ...current.filter((edge) => !(edge.source === selectedNode.id && (edge.sourceHandle === branch || (branch === 'ng' && edge.sourceHandle === 'ng-return')))),
        ...(targetId ? [{ id: `${selectedNode.id}-${returning ? 'ng-return' : branch}-${targetId}`, source: selectedNode.id, target: targetId, sourceHandle: returning ? 'ng-return' : branch }] : []),
      ])
      setSaved(false)
    }

    const setApprovalReturnTarget = (targetId: string) => {
      if (selectedNode?.type !== 'approval') return
      setEdges((current) => [
        ...current.filter((edge) => !(edge.source === selectedNode.id && edge.sourceHandle === 'no-return')),
        ...(targetId ? [{ id: `${selectedNode.id}-no-return-${targetId}`, source: selectedNode.id, target: targetId, sourceHandle: 'no-return' }] : []),
      ])
      setSaved(false)
    }

  const makeDefinition = () => ({
    id: workflowId,
    name,
    nodes: nodes.map(({ id, type, position, data }) => ({ id, type, position, data })),
    edges: edges.map(({ id, source, target, sourceHandle }) => ({ id, source, target, ...(sourceHandle ? { sourceHandle } : {}) })),
  })

  const saveWorkflow = async () => {
    setIsBusy(true)
    setMessage('保存しています…')
    try {
      const response = await fetch(`${API_URL}/api/workflows/${workflowId}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(makeDefinition()),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error ?? '保存できませんでした')
      setSaved(true)
      setMessage('保存しました')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'APIに接続できません')
    } finally {
      setIsBusy(false)
    }
  }

  const runWorkflow = async () => {
    setIsBusy(true)
    setMessage('実行を開始しています…')
    try {
      const saveResponse = await fetch(`${API_URL}/api/workflows/${workflowId}`, {
        method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(makeDefinition()),
      })
      const savedDefinition = await saveResponse.json()
      if (!saveResponse.ok) throw new Error(savedDefinition.error ?? 'ワークフローを保存できませんでした')
      setSaved(true)
      const response = await fetch(`${API_URL}/api/workflows/${workflowId}/run`, { method: 'POST' })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error ?? '実行を開始できませんでした')
      window.location.assign(`/executions/${encodeURIComponent(result.workflowId)}`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '実行を開始できませんでした')
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#home" aria-label="Flowcraft ホーム"><span className="brand-mark"><Workflow size={19} /></span><span>flowcraft</span></a>
        <div className="workspace-picker"><span className="workspace-avatar">N</span><span>northstar studio</span><ChevronDown size={14} /></div>
        <div className="topbar__right">
          <span className={`connection ${serviceOnline ? 'is-online' : ''}`}><span />{serviceOnline ? 'API 接続中' : 'API オフライン'}</span>
          <button className="icon-button help-button" title="ヘルプ"><CircleHelp size={17} /></button>
          <span className="profile-avatar">AK</span>
        </div>
      </header>

      <div className="page-heading">
        <div className="breadcrumbs"><span>ワークフロー</span><span className="crumb-slash">/</span><span>自動化</span><span className="crumb-slash">/</span><strong>編集</strong></div>
        <div className="title-row">
          <div className="title-edit"><input aria-label="ワークフロー名" value={name} onChange={(event) => { setName(event.target.value); setSaved(false) }} /><button className="icon-button subtle" title="名前を編集"><Settings2 size={15} /></button></div>
          <div className="heading-actions"><span className="draft-status"><span className={saved ? 'status-dot is-saved' : 'status-dot'} />{saved ? '保存済み' : '未保存の変更'}</span><button className="button button--quiet" onClick={saveWorkflow} disabled={isBusy}><Save size={15} />保存</button><button className="button button--run" onClick={runWorkflow} disabled={isBusy}><Play size={14} fill="currentColor" />テスト実行</button></div>
        </div>
        <div className="workflow-meta"><span><Activity size={13} />下書き</span><span>最終編集: たった今</span><span className="meta-divider" /><span><Cloud size={14} />Temporal DSL</span></div>
      </div>

      <section className="workspace">
        <aside className="left-rail">
          <div className="rail-section"><span className="rail-label">自動化</span><button className="rail-link is-active"><Workflow size={16} />ワークフロー</button><button className="rail-link"><Activity size={16} />実行履歴 <span className="rail-count">0</span></button></div>
          <div className="rail-section flow-library"><div className="library-heading"><span className="rail-label">ノードライブラリ</span><button className="tiny-icon" title="ノードを検索"><Plus size={15} /></button></div><p className="library-hint">選択位置に追加</p><button className="library-item" onClick={() => addStep('delay')}><span className="library-icon library-icon--timer"><Clock3 size={16} /></span><span><strong>待機</strong><small>指定時間だけ停止</small></span><Plus size={14} /></button><button className="library-item" onClick={() => addStep('input')}><span className="library-icon library-icon--input"><FileText size={16} /></span><span><strong>入力</strong><small>文字列と数字を受け取る</small></span><Plus size={14} /></button><button className="library-item" onClick={() => addStep('condition')}><span className="library-icon library-icon--condition"><GitBranch size={16} /></span><span><strong>条件分岐</strong><small>入力値でOK/NGを判定</small></span><Plus size={14} /></button><button className="library-item" onClick={() => addStep('approval')}><span className="library-icon library-icon--approval"><CheckCircle2 size={16} /></span><span><strong>承認</strong><small>はい・いいえを確認</small></span><Plus size={14} /></button><button className="library-item" onClick={() => addStep('page')}><span className="library-icon library-icon--page"><MonitorPlay size={16} /></span><span><strong>画面表示</strong><small>URLを表示して確認</small></span><Plus size={14} /></button><button className="library-item" onClick={() => addStep('webhook')}><span className="library-icon library-icon--webhook"><Webhook size={16} /></span><span><strong>Webhook</strong><small>HTTPリクエスト送信</small></span><Plus size={14} /></button></div>
          <div className="rail-footer"><div className="usage-label"><span>月間実行数</span><span>0 / 1,000</span></div><div className="usage-track"><span /></div><button className="rail-link"><CircleHelp size={15} />ヘルプとガイド</button></div>
        </aside>

        <section className="builder" aria-label="ワークフロー編集">
          <div className="linear-toolbar"><div><Workflow size={15} /><span>実行フロー</span><small>{nodes.length} ブロック</small></div><p>上から順に実行されます。ブロックを選択して設定します。</p></div>
          <div className="linear-canvas">
            <div className="linear-canvas__inner">
              {nodes.find((node) => node.type === 'trigger') ? <WorkflowStack nodeId={nodes.find((node) => node.type === 'trigger')!.id} nodes={nodes} edges={edges} selectedId={selectedId} onSelect={setSelectedId} /> : <p className="linear-empty">開始ブロックがありません</p>}
              {orphanRoots.length > 0 && <section className="linear-orphans"><h2>未接続ブロック</h2><p>開始ブロックから続くフローに接続されていません。</p>{orphanRoots.map((node) => <WorkflowStack key={node.id} nodeId={node.id} nodes={nodes} edges={edges} selectedId={selectedId} onSelect={setSelectedId} />)}</section>}
            </div>
          </div>
        </section>

        <aside className="inspector">
          <div className="inspector-heading"><div><span className="rail-label">設定</span><h2>{selectedNode ? 'ノード設定' : 'フロー設定'}</h2></div><button className="icon-button subtle" title="設定メニュー"><Settings2 size={16} /></button></div>
          {selectedNode ? (
            <div className="inspector-content">
              <div className="selected-node"><span className={`selected-node__icon selected-node__icon--${selectedNode.type}`}>{selectedNode.type === 'trigger' ? <Zap size={16} /> : selectedNode.type === 'delay' ? <Clock3 size={16} /> : selectedNode.type === 'webhook' ? <Webhook size={16} /> : selectedNode.type === 'page' ? <MonitorPlay size={16} /> : selectedNode.type === 'input' ? <FileText size={16} /> : selectedNode.type === 'condition' ? <GitBranch size={16} /> : <CheckCircle2 size={16} />}</span><div><small>{selectedNode.type === 'trigger' ? 'トリガー' : selectedNode.type === 'delay' ? 'タイマー' : selectedNode.type === 'webhook' ? 'Webhook送信' : selectedNode.type === 'page' ? '画面表示' : selectedNode.type === 'input' ? '入力' : selectedNode.type === 'condition' ? '条件分岐' : '承認'}</small><strong>{selectedNode.data.label}</strong></div></div>
              <label className="field-label">ノード名<input className="text-input" value={selectedNode.data.label} onChange={(event) => updateData({ label: event.target.value })} /></label>
              {selectedNode.type === 'delay' && <label className="field-label">待機時間 <span className="input-suffix"><input className="text-input" type="number" min="1" max="86400" value={selectedNode.data.seconds ?? 1} onChange={(event) => updateData({ seconds: Number(event.target.value) })} /><span>秒</span></span><small className="field-help">1秒から24時間まで設定できます</small></label>}
              {selectedNode.type === 'webhook' && <><label className="field-label">HTTPメソッド<select className="text-input select-input" value={selectedNode.data.method ?? 'POST'} onChange={(event) => updateData({ method: event.target.value as 'GET' | 'POST' })}><option>POST</option><option>GET</option></select></label><label className="field-label">送信先URL<input className="text-input" type="url" placeholder="https://api.example.com/hooks" value={selectedNode.data.url ?? ''} onChange={(event) => updateData({ url: event.target.value })} /><small className="field-help">POSTの場合、workflowIdをJSONで送信します</small></label></>}
              {selectedNode.type === 'page' && <label className="field-label">表示URL<input className="text-input" type="url" placeholder="https://example.com/guide" value={selectedNode.data.url ?? ''} onChange={(event) => updateData({ url: event.target.value })} /><small className="field-help">ローカルテスト: <a href={`${window.location.origin}/demo-pages/welcome.html`} target="_blank" rel="noreferrer">案内ページ</a> · <a href={`${window.location.origin}/demo-pages/review.html`} target="_blank" rel="noreferrer">内容確認ページ</a></small><small className="field-help">実行画面内に表示します。外部サイトはiframe表示を許可している必要があります</small></label>}
              {selectedNode.type === 'condition' && <>
                {(() => {
                  const previousNodes = getPreviousNodes(selectedNode.id, nodes, edges)
                  return <>
                <label className="field-label">比較する入力<select className="text-input select-input" value={selectedNode.data.conditionField ?? 'inputA'} onChange={(event) => updateData({ conditionField: event.target.value as 'inputA' | 'inputB', conditionOperator: event.target.value === 'inputA' ? 'equals' : 'greater_than', conditionValue: '' })}><option value="inputA">入力A（文字列）</option><option value="inputB">入力B（数字）</option></select></label>
                <label className="field-label">条件<select className="text-input select-input" value={selectedNode.data.conditionOperator ?? 'equals'} onChange={(event) => updateData({ conditionOperator: event.target.value })}>{(selectedNode.data.conditionField === 'inputB' ? [['equals', '等しい'], ['not_equals', '等しくない'], ['greater_than', 'より大きい'], ['greater_or_equal', '以上'], ['less_than', 'より小さい'], ['less_or_equal', '以下']] : [['equals', '等しい'], ['not_equals', '等しくない'], ['contains', '含む']]).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                <label className="field-label">比較する値<input className="text-input" type="text" inputMode={selectedNode.data.conditionField === 'inputB' ? 'numeric' : 'text'} pattern={selectedNode.data.conditionField === 'inputB' ? '[0-9]*' : undefined} value={selectedNode.data.conditionValue ?? ''} onChange={(event) => updateData({ conditionValue: selectedNode.data.conditionField === 'inputB' ? event.target.value.replace(/[^0-9]/g, '') : event.target.value })} /></label>
                <div className="condition-branches">
                  {(['ok', 'ng'] as const).map((branch) => {
                    const currentEdge = edges.find((edge) => edge.source === selectedNode.id && (edge.sourceHandle === branch || (branch === 'ng' && edge.sourceHandle === 'ng-return')))
                    const value = currentEdge?.sourceHandle === 'ng-return' ? `return:${currentEdge.target}` : currentEdge?.target ?? ''
                    return <label className="field-label" key={branch}>{branch === 'ok' ? '条件がOKの場合' : '条件がNGの場合'}<select className="text-input select-input" value={value} onChange={(event) => setBranchTarget(branch, event.target.value)}><option value="">ノードを選択</option>{nodes.filter((node) => node.id !== selectedNode.id && node.type !== 'trigger').map((node) => { const unavailable = edges.some((edge) => edge.target === node.id && !returnHandles.has(edge.sourceHandle ?? '') && !(edge.source === selectedNode.id && edge.sourceHandle === branch)); return <option key={node.id} value={node.id} disabled={unavailable}>{node.data.label}</option> })}{branch === 'ng' && <optgroup label="前の工程へ戻る">{previousNodes.map((node) => <option key={node.id} value={`return:${node.id}`}>{node.data.label}へ戻る</option>)}</optgroup>}</select></label>
                  })}
                </div>
                <small className="field-help">先行する入力ノードの値を判定します。NG時は前工程へ戻すこともできます。</small>
                  </>
                })()}
              </>}
              {selectedNode.type === 'input' && <div className="trigger-note"><FileText size={15} /><span>実行画面で入力A（文字列）と入力B（数字）を受け付け、後続ノードへ引き継ぎます。</span></div>}
              {selectedNode.type === 'approval' && <>
                <div className="trigger-note"><CheckCircle2 size={15} /><span>実行画面で「はい」を選ぶと次へ進みます。「いいえ」は前工程へ戻すか、拒否終了を選べます。</span></div>
                {(() => {
                  const previousNodes = getPreviousNodes(selectedNode.id, nodes, edges)
                  const returnTargetId = edges.find((edge) => edge.source === selectedNode.id && edge.sourceHandle === 'no-return')?.target ?? ''
                  return <label className="field-label approval-return-field">「いいえ」の場合<select className="text-input select-input" value={returnTargetId} onChange={(event) => setApprovalReturnTarget(event.target.value)}><option value="">拒否して終了</option>{previousNodes.map((node) => <option key={node.id} value={node.id}>{node.data.label}へ戻る</option>)}</select></label>
                })()}
              </>}
              {selectedNode.type === 'trigger' && <div className="trigger-note"><Zap size={15} /><span>このフローは手動実行で開始します。テスト実行から起動できます。</span></div>}
              <div className="inspector-divider" />
              <button className="delete-node" disabled={selectedNode.type === 'trigger'} onClick={() => { setNodes((current) => current.filter((node) => node.id !== selectedNode.id)); setEdges((current) => current.filter((edge) => edge.source !== selectedNode.id && edge.target !== selectedNode.id)); setSelectedId(''); setSaved(false) }}>ノードを削除</button>
            </div>
          ) : <div className="empty-inspector"><span className="empty-inspector__icon"><ArrowDown size={19} /></span><strong>ノードを選択</strong><p>キャンバス上のノードを選ぶと、設定を編集できます。</p></div>}
          <div className="inspector-bottom"><div className="temporal-badge"><span className="temporal-symbol">T</span><div><strong>Powered by Temporal</strong><small>信頼性の高いワークフロー実行</small></div><ChevronDown size={14} /></div></div>
        </aside>
      </section>

      <footer className="statusbar"><div><span className="statusbar-indicator" />すべてのシステムが正常です <span className="statusbar-separator">·</span> 開発環境</div><div><span>ワークフロー DSL v0.1</span><span className="statusbar-separator">·</span><span>東京リージョン</span></div></footer>
      {message && <div className={`toast${message.includes('できません') || message.includes('してください') || message.includes('見つかりません') ? ' toast--error' : ''}`} role="status"><span>{message === '保存しました' ? <Check size={15} /> : <Radio size={15} />}</span>{message}<button onClick={() => setMessage('')} aria-label="通知を閉じる">×</button></div>}
    </main>
  )
}

function App() {
  const pathParts = window.location.pathname.split('/').filter(Boolean)
  if (pathParts[0] === 'demo-pages' && (pathParts[1] === 'welcome' || pathParts[1] === 'review')) {
    return <DemoPage slug={pathParts[1]} />
  }
  const executionPrefix = '/executions/'
  const executionId = window.location.pathname.startsWith(executionPrefix)
    ? decodeURIComponent(window.location.pathname.slice(executionPrefix.length))
    : ''
  return executionId ? <ExecutionView executionId={executionId} /> : <WorkflowEditor />
}

export default App
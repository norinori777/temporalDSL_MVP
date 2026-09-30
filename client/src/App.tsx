import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  addEdge,
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react'
import { Activity, ArrowDown, Check, ChevronDown, CircleHelp, Clock3, Cloud, Plus, Play, Radio, Save, Settings2, Webhook, Workflow, Zap } from 'lucide-react'
import '@xyflow/react/dist/style.css'
import './App.css'

type NodeKind = 'trigger' | 'delay' | 'webhook'
type StepData = { label: string; seconds?: number; url?: string; method?: 'GET' | 'POST' }
type FlowNode = Node<StepData, NodeKind>

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000'
const workflowId = 'customer-onboarding'

const starterNodes: FlowNode[] = [
  { id: 'start', type: 'trigger', position: { x: 340, y: 72 }, data: { label: '顧客登録' } },
  { id: 'delay', type: 'delay', position: { x: 340, y: 248 }, data: { label: '初回フォローまで待機', seconds: 10 } },
]
const starterEdges: Edge[] = [{ id: 'start-delay', source: 'start', target: 'delay', animated: true }]

function FlowStep({ data, type, selected }: NodeProps<FlowNode>) {
  const details = type === 'trigger'
    ? 'イベントで開始'
    : type === 'delay'
      ? `${data.seconds ?? 1} 秒待機`
      : `${data.method ?? 'POST'} · ${data.url || 'URLを設定'}`
  const icon = type === 'trigger' ? <Zap size={16} /> : type === 'delay' ? <Clock3 size={16} /> : <Webhook size={16} />

  return (
    <div className={`flow-node flow-node--${type}${selected ? ' is-selected' : ''}`}>
      {type !== 'trigger' && <Handle type="target" position={Position.Top} />}
      <div className="flow-node__icon">{icon}</div>
      <div className="flow-node__copy">
        <span className="flow-node__kind">{type === 'trigger' ? 'トリガー' : type === 'delay' ? 'タイマー' : 'Webhook'}</span>
        <strong>{data.label}</strong>
        <small>{details}</small>
      </div>
      <span className="flow-node__dots" aria-hidden="true">···</span>
      <Handle type="source" position={Position.Bottom} />
    </div>
  )
}

const nodeTypes = { trigger: FlowStep, delay: FlowStep, webhook: FlowStep }

function WorkflowEditor() {
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>(starterNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(starterEdges)
  const [selectedId, setSelectedId] = useState('delay')
  const [name, setName] = useState('顧客オンボーディング')
  const [saved, setSaved] = useState(false)
  const [message, setMessage] = useState('')
  const [serviceOnline, setServiceOnline] = useState(false)
  const [isBusy, setIsBusy] = useState(false)

  const selectedNode = useMemo(() => nodes.find((node) => node.id === selectedId), [nodes, selectedId])

  useEffect(() => {
    fetch(`${API_URL}/api/health`)
      .then((response) => setServiceOnline(response.ok))
      .catch(() => setServiceOnline(false))
    fetch(`${API_URL}/api/workflows`)
      .then(async (response) => {
        if (!response.ok) return
        const definitions = await response.json() as { id: string; name: string; nodes: FlowNode[]; edges: Edge[] }[]
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

  const onConnect = useCallback((connection: Connection) => {
    setEdges((current) => addEdge({ ...connection, animated: true }, current))
    setSaved(false)
  }, [setEdges])

  const updateData = (patch: Partial<StepData>) => {
    if (!selectedNode) return
    setNodes((current) => current.map((node) => node.id === selectedNode.id
      ? { ...node, data: { ...node.data, ...patch } }
      : node))
    setSaved(false)
  }

  const addStep = (type: Exclude<NodeKind, 'trigger'>) => {
    const previous = nodes[nodes.length - 1]
    const id = `${type}-${crypto.randomUUID().slice(0, 6)}`
    const data: StepData = type === 'delay'
      ? { label: '一定時間待機', seconds: 5 }
      : { label: 'Webhookを送信', method: 'POST', url: '' }
    setNodes((current) => [...current, { id, type, position: { x: 340, y: 248 + current.length * 150 }, data }])
    if (previous) setEdges((current) => [...current, { id: `${previous.id}-${id}`, source: previous.id, target: id, animated: true }])
    setSelectedId(id)
    setSaved(false)
  }

  const makeDefinition = () => ({
    id: workflowId,
    name,
    nodes: nodes.map(({ id, type, position, data }) => ({ id, type, position, data })),
    edges: edges.map(({ id, source, target }) => ({ id, source, target })),
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
      setMessage(`Temporalで実行中 · ${result.workflowId}`)
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
          <div className="rail-section flow-library"><div className="library-heading"><span className="rail-label">ノードライブラリ</span><button className="tiny-icon" title="ノードを検索"><Plus size={15} /></button></div><p className="library-hint">キャンバスに追加</p><button className="library-item" onClick={() => addStep('delay')}><span className="library-icon library-icon--timer"><Clock3 size={16} /></span><span><strong>待機</strong><small>指定時間だけ停止</small></span><Plus size={14} /></button><button className="library-item" onClick={() => addStep('webhook')}><span className="library-icon library-icon--webhook"><Webhook size={16} /></span><span><strong>Webhook</strong><small>HTTPリクエスト送信</small></span><Plus size={14} /></button></div>
          <div className="rail-footer"><div className="usage-label"><span>月間実行数</span><span>0 / 1,000</span></div><div className="usage-track"><span /></div><button className="rail-link"><CircleHelp size={15} />ヘルプとガイド</button></div>
        </aside>

        <section className="builder" aria-label="ワークフロー編集キャンバス">
          <div className="canvas-toolbar"><div className="canvas-breadcrumb"><span className="canvas-live-dot" />キャンバス <span>/</span> フロー設計</div><div className="canvas-tools"><span className="canvas-shortcut">⌘ ↵ 実行</span><button className="canvas-tool" title="表示設定"><Settings2 size={15} /></button><span className="canvas-zoom">100%</span></div></div>
          <div className="canvas-area">
            <div className="canvas-stamp">CUSTOMER SUCCESS <span>·</span> FLOW 01</div>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onNodesChange={(changes) => { onNodesChange(changes); if (changes.some((change) => change.type === 'remove' || change.type === 'position')) setSaved(false) }}
              onEdgesChange={(changes) => { onEdgesChange(changes); setSaved(false) }}
              onConnect={onConnect}
              onNodeClick={(_event, node) => setSelectedId(node.id)}
              onPaneClick={() => setSelectedId('')}
              fitView
              fitViewOptions={{ padding: 0.34 }}
              minZoom={0.35}
              maxZoom={1.5}
            >
              <Background color="#d6d8ce" gap={22} size={1} />
              <Controls showInteractive={false} position="bottom-left" />
            </ReactFlow>
            <div className="canvas-caption"><span>顧客オンボーディング</span><span>最終更新: たった今</span></div>
          </div>
        </section>

        <aside className="inspector">
          <div className="inspector-heading"><div><span className="rail-label">設定</span><h2>{selectedNode ? 'ノード設定' : 'フロー設定'}</h2></div><button className="icon-button subtle" title="設定メニュー"><Settings2 size={16} /></button></div>
          {selectedNode ? (
            <div className="inspector-content">
              <div className="selected-node"><span className={`selected-node__icon selected-node__icon--${selectedNode.type}`}>{selectedNode.type === 'trigger' ? <Zap size={16} /> : selectedNode.type === 'delay' ? <Clock3 size={16} /> : <Webhook size={16} />}</span><div><small>{selectedNode.type === 'trigger' ? 'トリガー' : selectedNode.type === 'delay' ? 'タイマー' : 'Webhook'}</small><strong>{selectedNode.data.label}</strong></div></div>
              <label className="field-label">ノード名<input className="text-input" value={selectedNode.data.label} onChange={(event) => updateData({ label: event.target.value })} /></label>
              {selectedNode.type === 'delay' && <label className="field-label">待機時間 <span className="input-suffix"><input className="text-input" type="number" min="1" max="86400" value={selectedNode.data.seconds ?? 1} onChange={(event) => updateData({ seconds: Number(event.target.value) })} /><span>秒</span></span><small className="field-help">1秒から24時間まで設定できます</small></label>}
              {selectedNode.type === 'webhook' && <><label className="field-label">HTTPメソッド<select className="text-input select-input" value={selectedNode.data.method ?? 'POST'} onChange={(event) => updateData({ method: event.target.value as 'GET' | 'POST' })}><option>POST</option><option>GET</option></select></label><label className="field-label">送信先URL<input className="text-input" type="url" placeholder="https://api.example.com/hooks" value={selectedNode.data.url ?? ''} onChange={(event) => updateData({ url: event.target.value })} /><small className="field-help">POSTの場合、workflowIdをJSONで送信します</small></label></>}
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
  return <ReactFlowProvider><WorkflowEditor /></ReactFlowProvider>
}

export default App
import { z } from 'zod'

const nodeDataSchema = z.object({
  label: z.string().min(1).max(80),
  seconds: z.number().int().min(1).max(86400).optional(),
  url: z.string().url().optional(),
  method: z.enum(['GET', 'POST']).optional(),
  conditionField: z.enum(['inputA', 'inputB']).optional(),
  conditionOperator: z.enum(['equals', 'not_equals', 'contains', 'greater_than', 'greater_or_equal', 'less_than', 'less_or_equal']).optional(),
  conditionValue: z.string().optional(),
})

export const workflowSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(80),
  nodes: z.array(z.object({
    id: z.string().min(1),
    type: z.enum(['trigger', 'delay', 'webhook', 'approval', 'page', 'input', 'condition']),
    position: z.object({ x: z.number(), y: z.number() }),
    data: nodeDataSchema,
  })).min(1),
  edges: z.array(z.object({
    id: z.string(),
    source: z.string(),
    target: z.string(),
    sourceHandle: z.string().optional(),
  })),
  updatedAt: z.string().optional(),
})

export type WorkflowDefinition = z.infer<typeof workflowSchema>
export type WorkflowInputValues = { inputA: string; inputB: string }
export type ConditionField = 'inputA' | 'inputB'
export type ConditionOperator = 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'greater_or_equal' | 'less_than' | 'less_or_equal'
export type WorkflowStep = {
  id: string
  type: 'delay' | 'webhook' | 'approval' | 'page' | 'input' | 'condition'
  label: string
  seconds?: number
  url?: string
  method?: 'GET' | 'POST'
  conditionField?: ConditionField
  conditionOperator?: ConditionOperator
  conditionValue?: string
}

export type WorkflowPlan = {
  steps: WorkflowStep[]
  startStepId?: string
  nextById: Record<string, string>
  branchesById: Record<string, { ok: string; ng: string }>
}

export type WorkflowExecutionState = {
  status: 'running' | 'waiting_delay' | 'waiting_approval' | 'waiting_page' | 'waiting_input' | 'rejected' | 'completed'
  currentStepId?: string
  currentStepLabel?: string
  currentUrl?: string
  waitUntil?: number
  message?: string
  inputValues?: WorkflowInputValues
}

export const EXECUTION_STATE_QUERY = 'executionState'
export const APPROVAL_SIGNAL = 'approvalDecision'
export const PAGE_CONTINUE_SIGNAL = 'continuePage'
export const INPUT_VALUES_SIGNAL = 'submitInputValues'

export function compileWorkflow(definition: WorkflowDefinition): WorkflowPlan {
  const { nodes, edges } = definition
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const starts = nodes.filter((node) => node.type === 'trigger')
  if (starts.length !== 1) throw new Error('開始ノードは1つだけ配置してください')
  if (new Set(nodes.map((node) => node.id)).size !== nodes.length) {
    throw new Error('ノードIDが重複しています')
  }

  const nextBySource = new Map<string, string>()
  const branchesBySource = new Map<string, { ok?: string; ng?: string }>()
  const incoming = new Set<string>()
  for (const edge of edges) {
    if (!byId.has(edge.source) || !byId.has(edge.target)) {
      throw new Error('接続先のノードが見つかりません')
    }
    if (incoming.has(edge.target)) {
      throw new Error('同じノードに複数の接続はできません')
    }
    incoming.add(edge.target)

    const source = byId.get(edge.source)!
    if (source.type === 'condition') {
      if (edge.sourceHandle !== 'ok' && edge.sourceHandle !== 'ng') {
        throw new Error('条件ノードの接続はOKまたはNGの分岐先を選択してください')
      }
      const branches = branchesBySource.get(edge.source) ?? {}
      if (branches[edge.sourceHandle]) throw new Error('条件ノードの同じ分岐先が重複しています')
      branches[edge.sourceHandle] = edge.target
      branchesBySource.set(edge.source, branches)
    } else {
      if (edge.sourceHandle || nextBySource.has(edge.source)) {
        throw new Error('条件ノード以外は1つの接続先のみ設定できます')
      }
      nextBySource.set(edge.source, edge.target)
    }
  }

  const ordered: WorkflowDefinition['nodes'][number][] = []
  const visited = new Set<string>()
  const visiting = new Set<string>()
  const visit = (nodeId: string) => {
    if (visiting.has(nodeId)) throw new Error('フローに循環接続があります')
    if (visited.has(nodeId)) return
    const current = byId.get(nodeId)
    if (!current) throw new Error('接続先のノードが見つかりません')
    visiting.add(nodeId)
    visited.add(current.id)

    if (current.type !== 'trigger') {
      if (current.type === 'delay' && !current.data.seconds) {
        throw new Error(`「${current.data.label}」の待機秒数を設定してください`)
      }
      if (current.type === 'webhook' && !current.data.url) {
        throw new Error(`「${current.data.label}」のURLを設定してください`)
      }
      if (current.type === 'page' && !current.data.url) {
        throw new Error(`「${current.data.label}」の表示URLを設定してください`)
      }
      if (current.type === 'condition') {
        const { conditionField, conditionOperator, conditionValue } = current.data
        if (!conditionField || !conditionOperator || conditionValue === undefined || conditionValue.length === 0) {
          throw new Error(`「${current.data.label}」の条件を設定してください`)
        }
        if (conditionField === 'inputA' && !['equals', 'not_equals', 'contains'].includes(conditionOperator)) {
          throw new Error('入力Aには一致・不一致・含む演算子を設定してください')
        }
        if (conditionField === 'inputB' && conditionOperator === 'contains') {
          throw new Error('入力Bには数値比較の演算子を設定してください')
        }
        if (conditionField === 'inputB' && !/^\d+$/.test(conditionValue)) {
          throw new Error('入力Bの比較値は数字のみ入力できます')
        }
        const branches = branchesBySource.get(current.id)
        if (!branches?.ok || !branches.ng) {
          throw new Error(`「${current.data.label}」のOKとNGの接続先を選択してください`)
        }
      }
      ordered.push(current)
    }

    const branch = branchesBySource.get(current.id)
    if (branch?.ok) visit(branch.ok)
    if (branch?.ng) visit(branch.ng)
    const nextId = nextBySource.get(current.id)
    if (nextId) visit(nextId)
    visiting.delete(nodeId)
  }

  visit(starts[0].id)
  if (visited.size !== nodes.length) throw new Error('開始ノードから到達できないノードがあります')
  const branchesById = Object.fromEntries([...branchesBySource].map(([id, branches]) => [id, { ok: branches.ok!, ng: branches.ng! }]))
  return {
    steps: ordered.flatMap((node) => node.type === 'trigger' ? [] : [{ id: node.id, type: node.type, ...node.data }]),
    startStepId: nextBySource.get(starts[0].id) ?? branchesById[starts[0].id]?.ok,
    nextById: Object.fromEntries(nextBySource),
    branchesById,
  }
}
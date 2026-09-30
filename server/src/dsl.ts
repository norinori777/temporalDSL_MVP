import { z } from 'zod'

const nodeDataSchema = z.object({
  label: z.string().min(1).max(80),
  seconds: z.number().int().min(1).max(86400).optional(),
  url: z.string().url().optional(),
  method: z.enum(['GET', 'POST']).optional(),
})

export const workflowSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(80),
  nodes: z.array(z.object({
    id: z.string().min(1),
    type: z.enum(['trigger', 'delay', 'webhook']),
    position: z.object({ x: z.number(), y: z.number() }),
    data: nodeDataSchema,
  })).min(1),
  edges: z.array(z.object({
    id: z.string(),
    source: z.string(),
    target: z.string(),
  })),
  updatedAt: z.string().optional(),
})

export type WorkflowDefinition = z.infer<typeof workflowSchema>
export type WorkflowStep = {
  id: string
  type: 'delay' | 'webhook'
  label: string
  seconds?: number
  url?: string
  method?: 'GET' | 'POST'
}

export function compileWorkflow(definition: WorkflowDefinition): WorkflowStep[] {
  const { nodes, edges } = definition
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const starts = nodes.filter((node) => node.type === 'trigger')
  if (starts.length !== 1) throw new Error('開始ノードは1つだけ配置してください')
  if (new Set(nodes.map((node) => node.id)).size !== nodes.length) {
    throw new Error('ノードIDが重複しています')
  }

  const nextBySource = new Map<string, string>()
  const incoming = new Set<string>()
  for (const edge of edges) {
    if (!byId.has(edge.source) || !byId.has(edge.target)) {
      throw new Error('接続先のノードが見つかりません')
    }
    if (nextBySource.has(edge.source) || incoming.has(edge.target)) {
      throw new Error('MVPでは分岐のない1本道のフローのみ利用できます')
    }
    nextBySource.set(edge.source, edge.target)
    incoming.add(edge.target)
  }

  const ordered = []
  const visited = new Set<string>()
  let current: WorkflowDefinition['nodes'][number] | undefined = starts[0]
  while (current) {
    if (visited.has(current.id)) throw new Error('フローに循環接続があります')
    visited.add(current.id)
    if (current.type !== 'trigger') {
      if (current.type === 'delay' && !current.data.seconds) {
        throw new Error(`「${current.data.label}」の待機秒数を設定してください`)
      }
      if (current.type === 'webhook' && !current.data.url) {
        throw new Error(`「${current.data.label}」のURLを設定してください`)
      }
      ordered.push({ id: current.id, type: current.type, ...current.data })
    }
    const nextId = nextBySource.get(current.id)
    current = nextId ? byId.get(nextId) : undefined
  }

  if (visited.size !== nodes.length) throw new Error('開始ノードから到達できないノードがあります')
  return ordered
}
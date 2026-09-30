import cors from 'cors'
import express from 'express'
import { Client, Connection } from '@temporalio/client'
import { z } from 'zod'
import {
  APPROVAL_SIGNAL,
  EXECUTION_STATE_QUERY,
  INPUT_VALUES_SIGNAL,
  PAGE_CONTINUE_SIGNAL,
  compileWorkflow,
  workflowSchema,
  type WorkflowDefinition,
  type WorkflowInputValues,
} from './dsl.js'

const app = express()
const port = Number(process.env.PORT ?? 4000)
const address = process.env.TEMPORAL_ADDRESS ?? 'localhost:7233'
const taskQueue = process.env.TEMPORAL_TASK_QUEUE ?? 'workflow-studio'
const workflows = new Map<string, WorkflowDefinition>()
let temporalClient: Client | undefined

async function getTemporalClient() {
  if (!temporalClient) {
    const connection = await Connection.connect({ address })
    temporalClient = new Client({ connection, namespace: process.env.TEMPORAL_NAMESPACE ?? 'default' })
  }
  return temporalClient
}

app.use(cors({ origin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173' }))
app.use(express.json({ limit: '256kb' }))

app.get('/api/health', (_request, response) => {
  response.json({ status: 'ok', temporalAddress: address, persistence: 'memory' })
})

app.get('/api/workflows', (_request, response) => {
  response.json([...workflows.values()])
})

app.post('/api/workflows', (request, response) => {
  const parsed = workflowSchema.safeParse(request.body)
  if (!parsed.success) return response.status(400).json({ error: parsed.error.issues[0]?.message })
  try {
    compileWorkflow(parsed.data)
  } catch (error) {
    return response.status(400).json({ error: error instanceof Error ? error.message : 'DSLが不正です' })
  }
  const definition = { ...parsed.data, updatedAt: new Date().toISOString() }
  workflows.set(definition.id, definition)
  response.status(201).json(definition)
})

app.put('/api/workflows/:id', (request, response) => {
  const parsed = workflowSchema.safeParse({ ...request.body, id: request.params.id })
  if (!parsed.success) return response.status(400).json({ error: parsed.error.issues[0]?.message })
  try {
    compileWorkflow(parsed.data)
  } catch (error) {
    return response.status(400).json({ error: error instanceof Error ? error.message : 'DSLが不正です' })
  }
  const definition = { ...parsed.data, updatedAt: new Date().toISOString() }
  workflows.set(definition.id, definition)
  response.json(definition)
})

app.post('/api/workflows/:id/run', async (request, response) => {
  const definition = workflows.get(request.params.id)
  if (!definition) return response.status(404).json({ error: 'ワークフローが見つかりません。先に保存してください' })
  try {
    const plan = compileWorkflow(definition)
    const client = await getTemporalClient()
    const handle = await client.workflow.start('runDslWorkflow', {
      taskQueue,
      workflowId: `${definition.id}-${Date.now()}`,
      args: [plan],
    })
    response.status(202).json({ workflowId: handle.workflowId, runId: handle.firstExecutionRunId })
  } catch (error) {
    response.status(503).json({ error: `Temporalに接続できません: ${error instanceof Error ? error.message : '接続エラー'}` })
  }
})

app.get('/api/executions/:workflowId', async (request, response) => {
  try {
    const client = await getTemporalClient()
    const handle = client.workflow.getHandle(request.params.workflowId)
    const state = await handle.query(EXECUTION_STATE_QUERY)
    response.json(state)
  } catch (error) {
    response.status(404).json({ error: `実行状態を取得できません: ${error instanceof Error ? error.message : '実行が見つかりません'}` })
  }
})

app.post('/api/executions/:workflowId/approval', async (request, response) => {
  const parsed = z.object({ decision: z.enum(['yes', 'no']) }).safeParse(request.body)
  if (!parsed.success) return response.status(400).json({ error: '承認結果はyesまたはnoを指定してください' })
  try {
    const client = await getTemporalClient()
    const handle = client.workflow.getHandle(request.params.workflowId)
    const state = await handle.query<{ status: string }>(EXECUTION_STATE_QUERY)
    if (state.status !== 'waiting_approval') {
      return response.status(409).json({ error: 'この実行は承認待ちではありません' })
    }
    await handle.signal(APPROVAL_SIGNAL, parsed.data.decision)
    response.status(202).json({ accepted: true })
  } catch (error) {
    response.status(404).json({ error: `承認結果を送信できません: ${error instanceof Error ? error.message : '実行が見つかりません'}` })
  }
})

app.post('/api/executions/:workflowId/continue', async (request, response) => {
  try {
    const client = await getTemporalClient()
    const handle = client.workflow.getHandle(request.params.workflowId)
    const state = await handle.query<{ status: string }>(EXECUTION_STATE_QUERY)
    if (state.status !== 'waiting_page') {
      return response.status(409).json({ error: 'この実行は画面確認待ちではありません' })
    }
    await handle.signal(PAGE_CONTINUE_SIGNAL)
    response.status(202).json({ accepted: true })
  } catch (error) {
    response.status(404).json({ error: `次のノードへ進めません: ${error instanceof Error ? error.message : '実行が見つかりません'}` })
  }
})

app.post('/api/executions/:workflowId/input', async (request, response) => {
  const parsed = z.object({
    inputA: z.string().min(1, '入力Aを入力してください'),
    inputB: z.string().regex(/^\d+$/, '入力Bは数字のみ入力できます'),
  }).safeParse(request.body)
  if (!parsed.success) return response.status(400).json({ error: parsed.error.issues[0]?.message ?? '入力値が不正です' })
  try {
    const client = await getTemporalClient()
    const handle = client.workflow.getHandle(request.params.workflowId)
    const state = await handle.query<{ status: string }>(EXECUTION_STATE_QUERY)
    if (state.status !== 'waiting_input') {
      return response.status(409).json({ error: 'この実行は入力待ちではありません' })
    }
    await handle.signal(INPUT_VALUES_SIGNAL, parsed.data as WorkflowInputValues)
    response.status(202).json({ accepted: true })
  } catch (error) {
    response.status(404).json({ error: `入力値を送信できません: ${error instanceof Error ? error.message : '実行が見つかりません'}` })
  }
})

app.listen(port, () => console.info(`Workflow API listening on http://localhost:${port}`))
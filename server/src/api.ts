import cors from 'cors'
import express from 'express'
import { Client, Connection } from '@temporalio/client'
import { compileWorkflow, workflowSchema, type WorkflowDefinition } from './dsl.js'

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
    const steps = compileWorkflow(definition)
    const client = await getTemporalClient()
    const handle = await client.workflow.start('runDslWorkflow', {
      taskQueue,
      workflowId: `${definition.id}-${Date.now()}`,
      args: [steps],
    })
    response.status(202).json({ workflowId: handle.workflowId, runId: handle.firstExecutionRunId })
  } catch (error) {
    response.status(503).json({ error: `Temporalに接続できません: ${error instanceof Error ? error.message : '接続エラー'}` })
  }
})

app.listen(port, () => console.info(`Workflow API listening on http://localhost:${port}`))
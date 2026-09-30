import type { WorkflowInputValues } from './dsl.js'

export async function sendWebhook(input: {
  url: string
  method: 'GET' | 'POST'
  workflowId: string
  inputValues?: WorkflowInputValues
}): Promise<{ status: number }> {
  const url = new URL(input.url)
  if (input.method === 'GET' && input.inputValues) {
    url.searchParams.set('inputA', input.inputValues.inputA)
    url.searchParams.set('inputB', input.inputValues.inputB)
  }
  const response = await fetch(url, {
    method: input.method,
    headers: input.method === 'POST' ? { 'content-type': 'application/json' } : undefined,
    body: input.method === 'POST' ? JSON.stringify({ workflowId: input.workflowId, ...input.inputValues }) : undefined,
    signal: AbortSignal.timeout(15000),
  })
  if (!response.ok) throw new Error(`WebhookがHTTP ${response.status}を返しました`)
  return { status: response.status }
}
export async function sendWebhook(input: {
  url: string
  method: 'GET' | 'POST'
  workflowId: string
}): Promise<{ status: number }> {
  const response = await fetch(input.url, {
    method: input.method,
    headers: input.method === 'POST' ? { 'content-type': 'application/json' } : undefined,
    body: input.method === 'POST' ? JSON.stringify({ workflowId: input.workflowId }) : undefined,
    signal: AbortSignal.timeout(15000),
  })
  if (!response.ok) throw new Error(`WebhookがHTTP ${response.status}を返しました`)
  return { status: response.status }
}
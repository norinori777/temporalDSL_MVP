import { proxyActivities, sleep, workflowInfo } from '@temporalio/workflow'
import type * as activities from './activities.js'
import type { WorkflowStep } from './dsl.js'

const { sendWebhook } = proxyActivities<typeof activities>({
  startToCloseTimeout: '20 seconds',
  retry: { maximumAttempts: 3 },
})

export async function runDslWorkflow(steps: WorkflowStep[]): Promise<{ completed: number }> {
  for (const step of steps) {
    if (step.type === 'delay') {
      await sleep((step.seconds ?? 1) * 1000)
    } else if (step.type === 'webhook' && step.url) {
      await sendWebhook({
        url: step.url,
        method: step.method ?? 'POST',
        workflowId: workflowInfo().workflowId,
      })
    }
  }
  return { completed: steps.length }
}
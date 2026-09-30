import { condition, defineQuery, defineSignal, proxyActivities, setHandler, sleep, workflowInfo } from '@temporalio/workflow'
import type * as activities from './activities.js'
import { APPROVAL_SIGNAL, EXECUTION_STATE_QUERY, PAGE_CONTINUE_SIGNAL, type WorkflowExecutionState, type WorkflowStep } from './dsl.js'

const executionStateQuery = defineQuery<WorkflowExecutionState>(EXECUTION_STATE_QUERY)
const approvalSignal = defineSignal<[decision: 'yes' | 'no']>(APPROVAL_SIGNAL)
const pageContinueSignal = defineSignal(PAGE_CONTINUE_SIGNAL)

const { sendWebhook } = proxyActivities<typeof activities>({
  startToCloseTimeout: '20 seconds',
  retry: { maximumAttempts: 3 },
})

export async function runDslWorkflow(steps: WorkflowStep[]): Promise<{ completed: number; status: 'completed' | 'rejected' }> {
  let state: WorkflowExecutionState = { status: 'running' }
  let approvalDecision: 'yes' | 'no' | undefined
  let pageContinued = false

  setHandler(executionStateQuery, () => state)
  setHandler(approvalSignal, (decision) => {
    if (state.status === 'waiting_approval' && approvalDecision === undefined) approvalDecision = decision
  })
  setHandler(pageContinueSignal, () => {
    if (state.status === 'waiting_page') pageContinued = true
  })

  for (const step of steps) {
    state = { status: 'running', currentStepId: step.id, currentStepLabel: step.label }
    if (step.type === 'delay') {
      state = {
        ...state,
        status: 'waiting_delay',
        waitUntil: Date.now() + (step.seconds ?? 1) * 1000,
      }
      await sleep((step.seconds ?? 1) * 1000)
    } else if (step.type === 'webhook' && step.url) {
      await sendWebhook({
        url: step.url,
        method: step.method ?? 'POST',
        workflowId: workflowInfo().workflowId,
      })
    } else if (step.type === 'approval') {
      approvalDecision = undefined
      state = { ...state, status: 'waiting_approval' }
      await condition(() => approvalDecision !== undefined)
      if (approvalDecision === 'no') {
        state = { ...state, status: 'rejected', message: '拒否されました' }
        return { completed: 0, status: 'rejected' }
      }
    } else if (step.type === 'page' && step.url) {
      pageContinued = false
      state = { ...state, status: 'waiting_page', currentUrl: step.url }
      await condition(() => pageContinued)
    }
  }
  state = { status: 'completed' }
  return { completed: steps.length, status: 'completed' }
}
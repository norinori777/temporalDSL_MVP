import { condition, defineQuery, defineSignal, proxyActivities, setHandler, sleep, workflowInfo } from '@temporalio/workflow'
import type * as activities from './activities.js'
import { APPROVAL_SIGNAL, EXECUTION_STATE_QUERY, INPUT_VALUES_SIGNAL, PAGE_CONTINUE_SIGNAL, type ConditionField, type ConditionOperator, type WorkflowExecutionState, type WorkflowInputValues, type WorkflowPlan, type WorkflowStep } from './dsl.js'

const executionStateQuery = defineQuery<WorkflowExecutionState>(EXECUTION_STATE_QUERY)
const approvalSignal = defineSignal<[decision: 'yes' | 'no']>(APPROVAL_SIGNAL)
const pageContinueSignal = defineSignal(PAGE_CONTINUE_SIGNAL)
const inputValuesSignal = defineSignal<[values: WorkflowInputValues]>(INPUT_VALUES_SIGNAL)

const { sendWebhook } = proxyActivities<typeof activities>({
  startToCloseTimeout: '20 seconds',
  retry: { maximumAttempts: 3 },
})

export async function runDslWorkflow(plan: WorkflowPlan): Promise<{ completed: number; status: 'completed' | 'rejected' }> {
  let state: WorkflowExecutionState = { status: 'running' }
  let approvalDecision: 'yes' | 'no' | undefined
  let pageContinued = false
  let inputValues: WorkflowInputValues | undefined
  const stepsById = new Map(plan.steps.map((step) => [step.id, step]))

  setHandler(executionStateQuery, () => state)
  setHandler(approvalSignal, (decision) => {
    if (state.status === 'waiting_approval' && approvalDecision === undefined) approvalDecision = decision
  })
  setHandler(pageContinueSignal, () => {
    if (state.status === 'waiting_page') pageContinued = true
  })
  setHandler(inputValuesSignal, (values) => {
    if (state.status === 'waiting_input' && inputValues === undefined) inputValues = values
  })

  let currentStepId = plan.startStepId
  let completed = 0
  while (currentStepId) {
    const step = stepsById.get(currentStepId)
    if (!step) throw new Error(`実行ステップが見つかりません: ${currentStepId}`)
    state = {
      status: 'running',
      currentStepId: step.id,
      currentStepLabel: step.label,
      ...(inputValues ? { inputValues } : {}),
    }
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
        inputValues,
      })
    } else if (step.type === 'approval') {
      approvalDecision = undefined
      state = { ...state, status: 'waiting_approval' }
      await condition(() => approvalDecision !== undefined)
      if (approvalDecision === 'no') {
        const returnStepId = plan.approvalNoReturnsById[step.id]
        if (returnStepId) {
          currentStepId = returnStepId
          completed += 1
          continue
        }
        state = { ...state, status: 'rejected', message: '拒否されました' }
        return { completed, status: 'rejected' }
      }
    } else if (step.type === 'page' && step.url) {
      pageContinued = false
      state = { ...state, status: 'waiting_page', currentUrl: step.url }
      await condition(() => pageContinued)
    } else if (step.type === 'input') {
      inputValues = undefined
      state = { status: 'waiting_input', currentStepId: step.id, currentStepLabel: step.label }
      await condition(() => inputValues !== undefined)
      state = { ...state, inputValues }
    } else if (step.type === 'condition') {
      const matched = evaluateCondition(step, inputValues)
      currentStepId = matched
        ? plan.branchesById[step.id].ok
        : plan.conditionNgReturnsById[step.id] ?? plan.branchesById[step.id].ng
      if (!currentStepId) throw new Error(`条件分岐の接続先がありません: ${step.id}`)
      completed += 1
      continue
    }
    completed += 1
    currentStepId = plan.nextById[step.id]
  }
  state = { status: 'completed', ...(inputValues ? { inputValues } : {}) }
  return { completed, status: 'completed' }
}

function evaluateCondition(step: WorkflowStep, inputValues: WorkflowInputValues | undefined): boolean {
  const field = step.conditionField as ConditionField | undefined
  const operator = step.conditionOperator as ConditionOperator | undefined
  const actual = field ? inputValues?.[field] : undefined
  const expected = step.conditionValue
  if (actual === undefined || expected === undefined || !field || !operator) return false

  if (field === 'inputA') {
    if (operator === 'equals') return actual === expected
    if (operator === 'not_equals') return actual !== expected
    if (operator === 'contains') return actual.includes(expected)
    return false
  }

  const numericActual = Number(actual)
  const numericExpected = Number(expected)
  if (operator === 'equals') return numericActual === numericExpected
  if (operator === 'not_equals') return numericActual !== numericExpected
  if (operator === 'greater_than') return numericActual > numericExpected
  if (operator === 'greater_or_equal') return numericActual >= numericExpected
  if (operator === 'less_than') return numericActual < numericExpected
  if (operator === 'less_or_equal') return numericActual <= numericExpected
  return false
}
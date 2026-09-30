import { condition, defineQuery, defineSignal, proxyActivities, setHandler, sleep, workflowInfo } from '@temporalio/workflow'
import type * as activities from './activities.js'
import { APPROVAL_SIGNAL, EXECUTION_STATE_QUERY, INPUT_VALUES_SIGNAL, PAGE_CONTINUE_SIGNAL, type ConditionField, type ConditionOperator, type WorkflowExecutionState, type WorkflowInputValues, type WorkflowPlan, type WorkflowReturnRoute, type WorkflowStep } from './dsl.js'

const executionStateQuery = defineQuery<WorkflowExecutionState>(EXECUTION_STATE_QUERY)
const approvalSignal = defineSignal<[decision: 'yes' | 'no']>(APPROVAL_SIGNAL)
const pageContinueSignal = defineSignal(PAGE_CONTINUE_SIGNAL)
const inputValuesSignal = defineSignal<[values: WorkflowInputValues]>(INPUT_VALUES_SIGNAL)

const { sendWebhook } = proxyActivities<typeof activities>({
  startToCloseTimeout: '20 seconds',
  retry: { maximumAttempts: 3 },
})

export async function runDslWorkflow(plan: WorkflowPlan): Promise<{ completed: number; status: 'completed' | 'rejected' | 'loop_limit_reached' }> {
  let state: WorkflowExecutionState = { status: 'running' }
  let approvalDecision: 'yes' | 'no' | undefined
  let pageContinued = false
  let inputValues: WorkflowInputValues | undefined
  const stepsById = new Map(plan.steps.map((step) => [step.id, step]))
  const returnCounts = new Map<string, number>()

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

  const attemptReturn = (step: WorkflowStep, route: WorkflowReturnRoute | undefined): 'returned' | 'limit_reached' | 'no_route' => {
    if (!route) return 'no_route'
    const returnCount = returnCounts.get(step.id) ?? 0
    if (returnCount >= route.maxReturns) {
      state = {
        ...state,
        status: 'loop_limit_reached',
        message: `「${step.label}」からの戻り回数が上限の${route.maxReturns}回に達しました`,
      }
      return 'limit_reached'
    }
    returnCounts.set(step.id, returnCount + 1)
    currentStepId = route.targetId
    completed += 1
    return 'returned'
  }

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
        const returnResult = attemptReturn(step, plan.approvalNoReturnsById[step.id])
        if (returnResult === 'returned') continue
        if (returnResult === 'limit_reached') return { completed, status: 'loop_limit_reached' }
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
      if (matched) {
        currentStepId = plan.branchesById[step.id].ok
      } else {
        const returnResult = attemptReturn(step, plan.conditionNgReturnsById[step.id])
        if (returnResult === 'returned') continue
        if (returnResult === 'limit_reached') return { completed, status: 'loop_limit_reached' }
        currentStepId = plan.branchesById[step.id].ng
      }
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
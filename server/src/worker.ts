import { NativeConnection, Worker } from '@temporalio/worker'
import { fileURLToPath } from 'node:url'
import * as activities from './activities.js'

const address = process.env.TEMPORAL_ADDRESS ?? 'localhost:7233'
const taskQueue = process.env.TEMPORAL_TASK_QUEUE ?? 'workflow-studio'

async function run() {
  while (true) {
    let connection: NativeConnection | undefined
    try {
      connection = await NativeConnection.connect({ address })
      const worker = await Worker.create({
        connection,
        namespace: process.env.TEMPORAL_NAMESPACE ?? 'default',
        taskQueue,
        workflowsPath: fileURLToPath(new URL('./workflows.ts', import.meta.url)),
        activities,
      })
      console.info(`Temporal Worker connected: ${address} (${taskQueue})`)
      await worker.run()
      return
    } catch (error) {
      console.error('Temporal Workerに接続できません。5秒後に再試行します:', error)
      await new Promise((resolve) => setTimeout(resolve, 5000))
    } finally {
      await connection?.close()
    }
  }
}

run().catch((error: unknown) => {
  console.error('Temporal Workerを起動できませんでした:', error)
  process.exit(1)
})
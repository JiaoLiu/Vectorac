// ============================================================
// 房间串行事件队列（mahjong-service/rooms/room-queue.js）
// ------------------------------------------------------------
// 文档 §26 / §27 / §54：每个房间一条「逻辑串行队列」，但不是线程也不是进程。
// Node 是单线程事件循环，用一条 promise 链即可保证：
//   同一个 Room 永远不会有两个异步流程同时修改 GameState。
//
// 典型冲突：玩家在倒计时最后 1ms 发 DISCARD，同时服务器 TIMEOUT 触发 AI 出牌。
// 两者都 enqueue，先到先执行；后到者进队后重新校验 windowId，过期即丢弃。
// ============================================================

export class RoomQueue {
  constructor() {
    this.tail = Promise.resolve()
    this.depth = 0
    this.maxDepth = 0
    this.closed = false
  }

  /** 排队执行（返回该任务的 Promise，调用方需自行 catch） */
  push(task) {
    const run = this.tail.then(() => {
      if (this.closed) return undefined
      return task()
    })
    // 队列链自身必须始终是 resolved，否则一次异常会卡死后续所有任务
    this.tail = run.then(
      () => undefined,
      () => undefined
    )
    this.depth++
    if (this.depth > this.maxDepth) this.maxDepth = this.depth
    const done = () => {
      this.depth--
    }
    run.then(done, done)
    return run
  }

  /** 销毁时关闭：后续任务直接跳过（不再修改已销毁房间） */
  close() {
    this.closed = true
  }
}
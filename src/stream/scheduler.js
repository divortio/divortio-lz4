/**
 * src/scheduler/scheduler.js
 * * Task Scheduler.
 * * A simple concurrency limiter (Semaphore) to manage async task execution.
 * * It ensures that no more than `concurrency` tasks are running at the same time.
 * Pending tasks are queued and executed FIFO as slots become available.
 * @module scheduler
 */

export class TaskScheduler {
    /**
     * Creates a TaskScheduler.
     * @param {number} concurrency - Maximum number of concurrent tasks (default 1).
     */
    constructor(concurrency = 1) {
        this.concurrency = concurrency;
        this.running = 0;
        this.queue = [];
    }

    /**
     * Schedules a task for execution.
     * @param {Function} task - An async function to execute.
     * @returns {Promise<any>} A promise that resolves with the task's result.
     */
    async schedule(task) {
        if (this.running >= this.concurrency) {
            await new Promise(resolve => this.queue.push(resolve));
        }

        this.running++;
        try {
            return await task();
        } finally {
            this.running--;
            if (this.queue.length > 0) {
                const next = this.queue.shift();
                next();
            }
        }
    }
}
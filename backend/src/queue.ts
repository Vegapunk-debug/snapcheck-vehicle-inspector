import { EventEmitter } from "node:events";

/**
 * In-memory job queue backed by Node's EventEmitter.
 *
 * Why not Redis / BullMQ:
 *   - Same producer-consumer pattern with zero external dependencies.
 *   - Trade-off: pending jobs are lost if the process restarts.
 *   - For production: swap this file for a BullMQ wrapper; nothing else
 *     in the codebase needs to change.
 */

type Job = {
  imageId: string;
};

const JOB_ADDED_EVENT = "job:added";

const pendingJobs: Job[] = [];
const events = new EventEmitter();

// Add a new job to the queue and notify any listening worker.
export function enqueue(imageId: string): void {
  pendingJobs.push({ imageId });
  events.emit(JOB_ADDED_EVENT);
}

// Remove and return the oldest job (FIFO). Undefined if the queue is empty.
export function dequeue(): Job | undefined {
  return pendingJobs.shift();
}

// Register a callback that fires every time a job is enqueued.
export function onJob(handler: () => void): void {
  events.on(JOB_ADDED_EVENT, handler);
}

// How many jobs are currently waiting to be picked up.
export function pendingCount(): number {
  return pendingJobs.length;
}

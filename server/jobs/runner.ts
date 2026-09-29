import { Job, JobProgress } from '../../shared/types.ts';
import { CONFIG } from '../../shared/config.ts';
import { getRepositories } from '../repositories/index.ts';
import { AppError } from '../errors/AppError.ts';

export interface JobExecutionContext {
  jobId: string;
  updateProgress: (done: number, total: number, message: string) => Promise<void>;
  isCancelled: () => Promise<boolean>;
}

export type JobHandler<T = unknown> = (ctx: JobExecutionContext) => Promise<T>;

export class JobRunner {
  private activeHandlers: Map<string, { cancelRequested: boolean }> = new Map();

  async createJob<T>(
    type: string,
    campaignId: string,
    ownerId: string,
    handler: JobHandler<T>
  ): Promise<Job> {
    const repos = getRepositories();

    // Check if job of this type is already running for the campaign
    const runningJobs = await repos.jobs.listRunningByCampaign(campaignId);
    const existing = runningJobs.find((j) => j.type === type && (j.status === 'running' || j.status === 'queued'));
    if (existing) {
      console.log(`[JobRunner] Duplicate job requested for campaign ${campaignId} type ${type}. Returning existing job ${existing.id}`);
      return existing;
    }

    const job = await repos.jobs.create({
      campaignId,
      ownerId,
      type,
      status: 'running',
      progress: { done: 0, total: 100, message: 'Job started...' },
      result: null,
      error: null,
      cancelRequested: false,
    });

    this.activeHandlers.set(job.id, { cancelRequested: false });

    // Run asynchronously in-process
    this.runJobAsync(job.id, handler).catch((err) => {
      console.error(`[JobRunner] Unhandled failure in job ${job.id}:`, err);
    });

    return job;
  }

  private async runJobAsync<T>(jobId: string, handler: JobHandler<T>): Promise<void> {
    const repos = getRepositories();

    const isCancelled = async (): Promise<boolean> => {
      const active = this.activeHandlers.get(jobId);
      if (active && active.cancelRequested) return true;
      const current = await repos.jobs.getById(jobId);
      return Boolean(current?.cancelRequested);
    };

    const updateProgress = async (done: number, total: number, message: string): Promise<void> => {
      await repos.jobs.update(jobId, {
        progress: { done, total, message },
      });
    };

    try {
      const result = await handler({ jobId, updateProgress, isCancelled });

      if (await isCancelled()) {
        await repos.jobs.update(jobId, {
          status: 'cancelled',
          progress: { done: 100, total: 100, message: 'Cancelled by user' },
        });
      } else {
        await repos.jobs.update(jobId, {
          status: 'succeeded',
          result,
          progress: { done: 100, total: 100, message: 'Completed successfully' },
        });
      }
    } catch (err: unknown) {
      const isCancellation = (err as Error).message === 'JOB_CANCELLED' || (await isCancelled());
      if (isCancellation) {
        await repos.jobs.update(jobId, {
          status: 'cancelled',
          progress: { done: 100, total: 100, message: 'Cancelled' },
        });
      } else {
        const errorMsg = (err as Error).message || 'Internal job failure';
        const errorCode = (err as AppError).code || 'INTERNAL_ERROR';
        await repos.jobs.update(jobId, {
          status: 'failed',
          error: { code: String(errorCode), message: errorMsg },
        });
      }
    } finally {
      this.activeHandlers.delete(jobId);
    }
  }

  async getJob(jobId: string): Promise<Job> {
    const repos = getRepositories();
    const job = await repos.jobs.getById(jobId);
    if (!job) {
      throw AppError.notFound(`Job with ID ${jobId} not found`);
    }

    // Check for timeout if status is running
    if (job.status === 'running') {
      const startTime = new Date(job.createdAt).getTime();
      const elapsedMinutes = (Date.now() - startTime) / (1000 * 60);
      if (elapsedMinutes > CONFIG.JOB_TIMEOUT_MINUTES) {
        const updated = await repos.jobs.update(jobId, {
          status: 'failed',
          error: { code: 'JOB_TIMEOUT', message: `Job exceeded execution timeout of ${CONFIG.JOB_TIMEOUT_MINUTES} minutes` },
        });
        return updated;
      }
    }

    return job;
  }

  async requestCancel(jobId: string): Promise<Job> {
    const repos = getRepositories();
    const active = this.activeHandlers.get(jobId);
    if (active) {
      active.cancelRequested = true;
    }
    const updated = await repos.jobs.update(jobId, { cancelRequested: true });
    return updated;
  }
}

export const globalJobRunner = new JobRunner();

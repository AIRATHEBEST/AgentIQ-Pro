/**
 * JobQueue.js
 * 
 * Asynchronous cloud execution system with:
 * - Detached execution (runs without session)
 * - Job queue management
 * - Task resumption after crash
 * - Parallel job scheduling
 * - Persistent job state
 * 
 * TOP PRIORITY FEATURE #5
 */

class JobQueue {
  constructor(maxConcurrent = 5, storageProvider = null) {
    this.jobs = new Map();
    this.queue = [];
    this.runningJobs = new Set();
    this.maxConcurrent = maxConcurrent;
    this.storage = storageProvider || new LocalStorageProvider();
    this.listeners = {};
    this.config = {
      persistJobs: true,
      maxRetries: 3,
      defaultTimeout: 3600000, // 1 hour
      autoResume: true,
    };
  }

  on(event, cb) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(cb);
    return () => { this.listeners[event] = this.listeners[event].filter(x => x !== cb); };
  }

  emit(event, data) {
    if (this.listeners[event]) this.listeners[event].forEach(cb => cb(data));
  }

  /**
   * Submit a job to the queue
   */
  submitJob(jobDef) {
    const job = {
      id: `job-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: jobDef.name,
      description: jobDef.description,
      task: jobDef.task,
      priority: jobDef.priority || 0,
      status: 'queued',
      createdAt: Date.now(),
      startedAt: null,
      completedAt: null,
      progress: 0,
      result: null,
      error: null,
      retries: 0,
      maxRetries: jobDef.maxRetries || this.config.maxRetries,
      timeout: jobDef.timeout || this.config.defaultTimeout,
      metadata: jobDef.metadata || {},
    };

    this.jobs.set(job.id, job);
    this.queue.push(job.id);

    // Sort by priority
    this.queue.sort((aId, bId) => {
      const a = this.jobs.get(aId);
      const b = this.jobs.get(bId);
      return b.priority - a.priority;
    });

    // Persist job
    if (this.config.persistJobs) {
      this.storage.saveJob(job);
    }

    this.emit('job_submitted', { job });
    this.processQueue();

    return job.id;
  }

  /**
   * Process the job queue
   */
  async processQueue() {
    while (this.runningJobs.size < this.maxConcurrent && this.queue.length > 0) {
      const jobId = this.queue.shift();
      const job = this.jobs.get(jobId);

      if (job && job.status === 'queued') {
        this.runningJobs.add(jobId);
        this.executeJob(job).catch(err => {
          console.error(`Job ${jobId} execution error:`, err);
        });
      }
    }
  }

  /**
   * Execute a single job
   */
  async executeJob(job) {
    job.status = 'running';
    job.startedAt = Date.now();
    this.emit('job_started', { jobId: job.id, job });

    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Job timeout')), job.timeout)
    );

    try {
      const taskExecutor = typeof job.task === 'function' ? job.task : async () => job.task;

      // Race between task execution and timeout
      const result = await Promise.race([
        taskExecutor({
          jobId: job.id,
          updateProgress: (progress) => this.updateJobProgress(job.id, progress),
          onCheckpoint: (checkpoint) => this.createJobCheckpoint(job.id, checkpoint),
        }),
        timeout,
      ]);

      job.status = 'completed';
      job.result = result;
      job.completedAt = Date.now();
      job.duration = job.completedAt - job.startedAt;

      if (this.config.persistJobs) {
        this.storage.saveJob(job);
      }

      this.emit('job_completed', { jobId: job.id, job, result });
    } catch (err) {
      job.error = err.message;
      job.retries++;

      if (job.retries < job.maxRetries) {
        job.status = 'queued';
        this.queue.unshift(job.id);
        this.emit('job_retrying', { jobId: job.id, attempt: job.retries, error: err.message });
      } else {
        job.status = 'failed';
        job.completedAt = Date.now();
        this.emit('job_failed', { jobId: job.id, job, error: err.message });
      }

      if (this.config.persistJobs) {
        this.storage.saveJob(job);
      }
    } finally {
      this.runningJobs.delete(job.id);
      this.processQueue();
    }
  }

  /**
   * Update job progress
   */
  updateJobProgress(jobId, progress) {
    const job = this.jobs.get(jobId);
    if (job) {
      job.progress = Math.min(100, Math.max(0, progress));
      this.emit('job_progress', { jobId, progress: job.progress });
    }
  }

  /**
   * Create a checkpoint for a job
   */
  createJobCheckpoint(jobId, checkpoint) {
    const job = this.jobs.get(jobId);
    if (job) {
      job.checkpoint = {
        ...checkpoint,
        timestamp: Date.now(),
      };

      if (this.config.persistJobs) {
        this.storage.saveJob(job);
      }

      this.emit('job_checkpoint', { jobId, checkpoint });
    }
  }

  /**
   * Get job by ID
   */
  getJob(jobId) {
    return this.jobs.get(jobId);
  }

  /**
   * Get all jobs with optional filter
   */
  getJobs(filter = {}) {
    let jobs = Array.from(this.jobs.values());

    if (filter.status) {
      jobs = jobs.filter(j => j.status === filter.status);
    }

    if (filter.name) {
      jobs = jobs.filter(j => j.name.includes(filter.name));
    }

    if (filter.limit) {
      jobs = jobs.slice(-filter.limit);
    }

    return jobs;
  }

  /**
   * Cancel a job
   */
  cancelJob(jobId) {
    const job = this.jobs.get(jobId);
    if (job && ['queued', 'running'].includes(job.status)) {
      job.status = 'cancelled';
      job.completedAt = Date.now();
      this.queue = this.queue.filter(id => id !== jobId);
      this.emit('job_cancelled', { jobId, job });
      return true;
    }
    return false;
  }

  /**
   * Retry a failed job
   */
  retryJob(jobId) {
    const job = this.jobs.get(jobId);
    if (job && job.status === 'failed') {
      job.status = 'queued';
      job.retries = 0;
      this.queue.push(jobId);
      this.emit('job_retried', { jobId });
      this.processQueue();
      return true;
    }
    return false;
  }

  /**
   * Resume all jobs from storage
   */
  async resumeJobs() {
    const storedJobs = this.storage.loadJobs();

    for (const job of storedJobs) {
      if (['queued', 'running'].includes(job.status)) {
        job.status = 'queued';
        this.jobs.set(job.id, job);
        this.queue.push(job.id);
      } else {
        this.jobs.set(job.id, job);
      }
    }

    this.emit('jobs_resumed', { count: this.queue.length });
    this.processQueue();
  }

  /**
   * Get queue statistics
   */
  getStats() {
    const jobs = Array.from(this.jobs.values());
    return {
      totalJobs: jobs.length,
      queuedJobs: this.queue.length,
      runningJobs: this.runningJobs.size,
      completedJobs: jobs.filter(j => j.status === 'completed').length,
      failedJobs: jobs.filter(j => j.status === 'failed').length,
      cancelledJobs: jobs.filter(j => j.status === 'cancelled').length,
      successRate: jobs.length > 0
        ? (jobs.filter(j => j.status === 'completed').length / jobs.length) * 100
        : 0,
      averageDuration: jobs.filter(j => j.duration).length > 0
        ? jobs.filter(j => j.duration).reduce((sum, j) => sum + j.duration, 0) / jobs.filter(j => j.duration).length
        : 0,
    };
  }

  /**
   * Clear completed jobs
   */
  clearCompleted() {
    const before = this.jobs.size;
    for (const [id, job] of this.jobs) {
      if (['completed', 'failed', 'cancelled'].includes(job.status)) {
        this.jobs.delete(id);
      }
    }
    const cleared = before - this.jobs.size;
    this.emit('jobs_cleared', { count: cleared });
  }

  /**
   * Set configuration
   */
  setConfig(config) {
    this.config = { ...this.config, ...config };
  }
}

/**
 * Default localStorage storage provider
 */
class LocalStorageProvider {
  saveJob(job) {
    try {
      const jobs = JSON.parse(localStorage.getItem('agentiq_jobs') || '[]');
      const index = jobs.findIndex(j => j.id === job.id);
      if (index >= 0) {
        jobs[index] = job;
      } else {
        jobs.push(job);
      }
      localStorage.setItem('agentiq_jobs', JSON.stringify(jobs));
    } catch (err) {
      console.error('Failed to save job:', err);
    }
  }

  loadJobs() {
    try {
      return JSON.parse(localStorage.getItem('agentiq_jobs') || '[]');
    } catch {
      return [];
    }
  }

  deleteJob(jobId) {
    try {
      const jobs = JSON.parse(localStorage.getItem('agentiq_jobs') || '[]');
      localStorage.setItem('agentiq_jobs', JSON.stringify(jobs.filter(j => j.id !== jobId)));
    } catch (err) {
      console.error('Failed to delete job:', err);
    }
  }
}

export default new JobQueue();
export { LocalStorageProvider };

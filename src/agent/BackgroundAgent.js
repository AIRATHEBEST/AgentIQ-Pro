/**
 * Background Agent - AgentIQ Pro
 * Run agents asynchronously with job queue management
 */

const EventEmitter = require('events');

const AGENT_PRIORITY = {
  LOW: 0,
  NORMAL: 1,
  HIGH: 2,
  CRITICAL: 3
};

const JOB_STATUS = {
  PENDING: 'pending',
  QUEUED: 'queued',
  RUNNING: 'running',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  TIMEOUT: 'timeout'
};

const JOB_EVENTS = {
  CREATED: 'job:created',
  QUEUED: 'job:queued',
  STARTED: 'job:started',
  PROGRESS: 'job:progress',
  PAUSED: 'job:paused',
  RESUMED: 'job:resumed',
  COMPLETED: 'job:completed',
  FAILED: 'job:failed',
  CANCELLED: 'job:cancelled',
  LOG: 'job:log'
};

class AgentJob {
  constructor(id, agentType, task, config = {}) {
    this.id = id;
    this.agentType = agentType;
    this.task = task;
    this.config = {
      priority: config.priority || AGENT_PRIORITY.NORMAL,
      timeout: config.timeout || 300000,
      maxRetries: config.maxRetries || 3,
      dependencies: config.dependencies || [],
      metadata: config.metadata || {},
      environment: config.environment || {},
      onProgress: config.onProgress || null,
      onComplete: config.onComplete || null,
      onError: config.onError || null
    };
    this.status = JOB_STATUS.PENDING;
    this.result = null;
    this.error = null;
    this.progress = 0;
    this.progressMessage = '';
    this.attempts = 0;
    this.createdAt = Date.now();
    this.queuedAt = null;
    this.startedAt = null;
    this.completedAt = null;
    this.logs = [];
    this.checkpoints = [];
    this.parentJobId = config.parentJobId || null;
  }

  getDuration() {
    if (this.startedAt) {
      const endTime = this.completedAt || Date.now();
      return endTime - this.startedAt;
    }
    return null;
  }

  getQueueTime() {
    if (this.queuedAt && this.startedAt) {
      return this.startedAt - this.queuedAt;
    }
    return null;
  }

  addLog(level, message, data = null) {
    const log = {
      timestamp: Date.now(),
      level,
      message,
      data: data ? JSON.parse(JSON.stringify(data)) : null
    };
    this.logs.push(log);
    return log;
  }

  addCheckpoint(data) {
    const checkpoint = {
      timestamp: Date.now(),
      data: JSON.parse(JSON.stringify(data)),
      progress: this.progress
    };
    this.checkpoints.push(checkpoint);
    return checkpoint;
  }

  toJSON() {
    return {
      id: this.id,
      agentType: this.agentType,
      task: this.task,
      status: this.status,
      result: this.result,
      error: this.error,
      progress: this.progress,
      progressMessage: this.progressMessage,
      attempts: this.attempts,
      duration: this.getDuration(),
      queueTime: this.getQueueTime(),
      createdAt: this.createdAt,
      queuedAt: this.queuedAt,
      startedAt: this.startedAt,
      completedAt: this.completedAt,
      logs: this.logs.length,
      checkpoints: this.checkpoints.length
    };
  }
}

class JobQueue extends EventEmitter {
  constructor(options = {}) {
    super();
    this.name = options.name || 'default';
    this.maxConcurrent = options.maxConcurrent || 5;
    this.maxQueueSize = options.maxQueueSize || 1000;
    this.defaultTimeout = options.defaultTimeout || 300000;
    this.jobs = new Map();
    this.pendingJobs = [];
    this.runningJobs = new Map();
    this.completedJobs = new Map();
    this.failedJobs = new Map();
    this.priorityQueues = {
      [AGENT_PRIORITY.CRITICAL]: [],
      [AGENT_PRIORITY.HIGH]: [],
      [AGENT_PRIORITY.NORMAL]: [],
      [AGENT_PRIORITY.LOW]: []
    };
    this.isProcessing = false;
    this.processors = [];
  }

  enqueue(job) {
    if (this.jobs.size >= this.maxQueueSize) {
      throw new Error(`Queue ${this.name} is full (max ${this.maxQueueSize})`);
    }

    job.status = JOB_STATUS.QUEUED;
    job.queuedAt = Date.now();
    
    this.jobs.set(job.id, job);
    this.priorityQueues[job.config.priority].push(job);
    
    this.emit(JOB_EVENTS.QUEUED, job);
    this.emit('queue:update', { size: this.size(), pending: this.pendingCount() });
    
    this.process();
    
    return job;
  }

  dequeue(jobId) {
    const job = this.jobs.get(jobId);
    
    if (!job) return null;
    
    if (job.status === JOB_STATUS.QUEUED || job.status === JOB_STATUS.PENDING) {
      const queue = this.priorityQueues[job.config.priority];
      const index = queue.findIndex(j => j.id === jobId);
      if (index >= 0) {
        queue.splice(index, 1);
      }
    }
    
    job.status = JOB_STATUS.CANCELLED;
    job.completedAt = Date.now();
    this.emit(JOB_EVENTS.CANCELLED, job);
    
    return job;
  }

  async process() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    while (this.hasPendingJobs() && this.hasAvailableCapacity()) {
      const job = this.getNextJob();
      
      if (job) {
        this.executeJob(job);
      }
    }

    this.isProcessing = false;
  }

  getNextJob() {
    for (const priority of Object.keys(this.priorityQueues).sort((a, b) => b - a)) {
      const queue = this.priorityQueues[priority];
      if (queue.length > 0) {
        const job = queue.shift();
        return job;
      }
    }
    return null;
  }

  hasPendingJobs() {
    return this.priorityQueues[AGENT_PRIORITY.CRITICAL].length > 0 ||
           this.priorityQueues[AGENT_PRIORITY.HIGH].length > 0 ||
           this.priorityQueues[AGENT_PRIORITY.NORMAL].length > 0 ||
           this.priorityQueues[AGENT_PRIORITY.LOW].length > 0;
  }

  hasAvailableCapacity() {
    return this.runningJobs.size < this.maxConcurrent;
  }

  pendingCount() {
    let count = 0;
    for (const queue of Object.values(this.priorityQueues)) {
      count += queue.length;
    }
    return count;
  }

  async executeJob(job) {
    job.status = JOB_STATUS.RUNNING;
    job.startedAt = Date.now();
    this.runningJobs.set(job.id, job);
    
    this.emit(JOB_EVENTS.STARTED, job);

    const timeout = job.config.timeout || this.defaultTimeout;
    let timeoutId;
    
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`Job ${job.id} timed out after ${timeout}ms`));
      }, timeout);
    });

    try {
      const executor = this.getExecutor(job.agentType);
      const executePromise = executor(job.task, job.config, {
        onProgress: (progress, message) => {
          job.progress = progress;
          job.progressMessage = message || '';
          this.emit(JOB_EVENTS.PROGRESS, { job, progress, message });
        },
        onLog: (level, message, data) => {
          job.addLog(level, message, data);
          this.emit(JOB_EVENTS.LOG, { job, level, message, data });
        }
      });

      job.result = await Promise.race([executePromise, timeoutPromise]);
      job.status = JOB_STATUS.COMPLETED;
      job.completedAt = Date.now();
      this.runningJobs.delete(job.id);
      this.completedJobs.set(job.id, job);
      
      this.emit(JOB_EVENTS.COMPLETED, job);
      
      if (job.config.onComplete) {
        job.config.onComplete(job.result);
      }
    } catch (error) {
      job.attempts++;
      job.error = error.message;
      
      if (job.attempts < job.config.maxRetries) {
        job.addLog('warn', `Job failed, retrying (attempt ${job.attempts}/${job.config.maxRetries})`);
        job.status = JOB_STATUS.QUEUED;
        job.queuedAt = Date.now();
        this.runningJobs.delete(job.id);
        this.priorityQueues[job.config.priority].unshift(job);
      } else {
        job.status = JOB_STATUS.FAILED;
        job.completedAt = Date.now();
        this.runningJobs.delete(job.id);
        this.failedJobs.set(job.id, job);
        
        this.emit(JOB_EVENTS.FAILED, { job, error });
        
        if (job.config.onError) {
          job.config.onError(error);
        }
      }
    } finally {
      clearTimeout(timeoutId);
      this.emit('queue:update', { size: this.size(), pending: this.pendingCount() });
    }
  }

  getExecutor(agentType) {
    const processor = this.processors.find(p => p.type === agentType);
    return processor ? processor.handler : this.defaultExecutor;
  }

  defaultExecutor(task, config, callbacks) {
    return new Promise((resolve) => {
      callbacks.onProgress(100, 'Completed');
      resolve({ success: true, output: task });
    });
  }

  registerProcessor(type, handler) {
    this.processors.push({ type, handler });
  }

  size() {
    return this.jobs.size;
  }

  getJob(jobId) {
    return this.jobs.get(jobId) || null;
  }

  getRunningJobs() {
    return Array.from(this.runningJobs.values());
  }

  getCompletedJobs(limit = 100) {
    return Array.from(this.completedJobs.values()).slice(-limit);
  }

  getFailedJobs(limit = 100) {
    return Array.from(this.failedJobs.values()).slice(-limit);
  }

  getStats() {
    return {
      name: this.name,
      size: this.size(),
      pending: this.pendingCount(),
      running: this.runningJobs.size,
      completed: this.completedJobs.size,
      failed: this.failedJobs.size,
      maxConcurrent: this.maxConcurrent,
      priorityQueues: {
        critical: this.priorityQueues[AGENT_PRIORITY.CRITICAL].length,
        high: this.priorityQueues[AGENT_PRIORITY.HIGH].length,
        normal: this.priorityQueues[AGENT_PRIORITY.NORMAL].length,
        low: this.priorityQueues[AGENT_PRIORITY.LOW].length
      }
    };
  }
}

class BackgroundAgent extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = {
      id: config.id || `agent_${Date.now()}`,
      name: config.name || 'Background Agent',
      type: config.type || 'generic',
      maxConcurrent: config.maxConcurrent || 5,
      workerCount: config.workerCount || 3,
      defaultTimeout: config.defaultTimeout || 300000,
      enablePersistence: config.enablePersistence || false,
      enableMetrics: config.enableMetrics || true,
      ...config
    };

    this.queues = new Map();
    this.workers = new Map();
    this.activeJobs = new Map();
    this.completedJobs = new Map();
    this.jobHistory = [];
    this.metrics = {
      totalJobs: 0,
      completedJobs: 0,
      failedJobs: 0,
      totalRuntime: 0,
      averageRuntime: 0,
      uptime: Date.now()
    };

    this.setupDefaultQueue();
    this.setupWorkers();
  }

  setupDefaultQueue() {
    const defaultQueue = new JobQueue({
      name: 'default',
      maxConcurrent: this.config.maxConcurrent,
      maxQueueSize: 1000,
      defaultTimeout: this.config.defaultTimeout
    });

    defaultQueue.on(JOB_EVENTS.COMPLETED, (job) => {
      this.onJobCompleted(job);
    });

    defaultQueue.on(JOB_EVENTS.FAILED, (data) => {
      this.onJobFailed(data.job, data.error);
    });

    this.queues.set('default', defaultQueue);
  }

  setupWorkers() {
    for (let i = 0; i < this.config.workerCount; i++) {
      const worker = {
        id: `worker_${i}`,
        status: 'idle',
        currentJob: null,
        startedAt: Date.now(),
        jobsCompleted: 0
      };
      this.workers.set(worker.id, worker);
    }
  }

  createQueue(name, options = {}) {
    const queue = new JobQueue({
      name,
      maxConcurrent: options.maxConcurrent || this.config.maxConcurrent,
      maxQueueSize: options.maxQueueSize || 1000,
      defaultTimeout: options.defaultTimeout || this.config.defaultTimeout
    });

    this.queues.set(name, queue);
    
    queue.on(JOB_EVENTS.COMPLETED, (job) => {
      this.onJobCompleted(job);
    });

    queue.on(JOB_EVENTS.FAILED, (data) => {
      this.onJobFailed(data.job, data.error);
    });

    return queue;
  }

  getQueue(name = 'default') {
    return this.queues.get(name) || null;
  }

  submitJob(agentType, task, options = {}) {
    const jobId = options.id || `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const queueName = options.queue || 'default';
    
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    const job = new AgentJob(jobId, agentType, task, {
      ...options,
      timeout: options.timeout || this.config.defaultTimeout
    });

    this.metrics.totalJobs++;
    this.activeJobs.set(jobId, job);
    
    this.emit(JOB_EVENTS.CREATED, job);
    
    return queue.enqueue(job);
  }

  submitBatch(jobs, queueName = 'default') {
    return jobs.map(job => {
      const options = { ...job, queue: queueName };
      return this.submitJob(job.agentType, job.task, options);
    });
  }

  cancelJob(jobId) {
    for (const [name, queue] of this.queues.entries()) {
      const job = queue.dequeue(jobId);
      if (job) {
        this.activeJobs.delete(jobId);
        this.emit(JOB_EVENTS.CANCELLED, job);
        return job;
      }
    }
    return null;
  }

  pauseJob(jobId) {
    const job = this.activeJobs.get(jobId);
    if (job && job.status === JOB_STATUS.RUNNING) {
      job.status = JOB_STATUS.PAUSED;
      this.emit(JOB_EVENTS.PAUSED, job);
      return job;
    }
    return null;
  }

  resumeJob(jobId) {
    const job = this.activeJobs.get(jobId);
    if (job && job.status === JOB_STATUS.PAUSED) {
      job.status = JOB_STATUS.QUEUED;
      this.emit(JOB_EVENTS.RESUMED, job);
      return job;
    }
    return null;
  }

  retryJob(jobId) {
    const job = this.completedJobs.get(jobId) || this.failedJobs.get(jobId);
    if (job) {
      const newJob = new AgentJob(
        `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        job.agentType,
        job.task,
        { ...job.config }
      );
      
      this.activeJobs.set(newJob.id, newJob);
      const queue = this.queues.get('default');
      return queue.enqueue(newJob);
    }
    return null;
  }

  onJobCompleted(job) {
    this.activeJobs.delete(job.id);
    this.completedJobs.set(job.id, job);
    
    if (this.metrics.enableMetrics) {
      this.metrics.completedJobs++;
      const duration = job.getDuration() || 0;
      this.metrics.totalRuntime += duration;
      this.metrics.averageRuntime = this.metrics.totalRuntime / this.metrics.completedJobs;
    }

    this.emit(JOB_EVENTS.COMPLETED, job);
  }

  onJobFailed(job, error) {
    this.activeJobs.delete(job.id);
    
    if (this.metrics.enableMetrics) {
      this.metrics.failedJobs++;
    }

    this.emit(JOB_EVENTS.FAILED, { job, error });
  }

  registerAgentHandler(agentType, handler) {
    const defaultQueue = this.queues.get('default');
    defaultQueue.registerProcessor(agentType, handler);
  }

  getJob(jobId) {
    return this.activeJobs.get(jobId) ||
           this.completedJobs.get(jobId) ||
           this.failedJobs.get(jobId) ||
           null;
  }

  getActiveJobs() {
    return Array.from(this.activeJobs.values());
  }

  getCompletedJobs(limit = 100) {
    return Array.from(this.completedJobs.values()).slice(-limit);
  }

  getFailedJobs(limit = 100) {
    return Array.from(this.failedJobs.values()).slice(-limit);
  }

  getMetrics() {
    const uptime = Date.now() - this.metrics.uptime;
    const jobsPerMinute = uptime > 0 ? (this.metrics.totalJobs / (uptime / 60000)) : 0;
    
    return {
      ...this.metrics,
      uptime,
      jobsPerMinute,
      activeJobs: this.activeJobs.size,
      completedJobs: this.completedJobs.size,
      failedJobs: this.failedJobs.size,
      queues: Array.from(this.queues.keys()).map(name => {
        const queue = this.queues.get(name);
        return queue.getStats();
      }),
      workers: Array.from(this.workers.values())
    };
  }

  getStats() {
    return {
      id: this.config.id,
      name: this.config.name,
      type: this.config.type,
      queues: this.queues.size,
      workers: this.workers.size,
      activeJobs: this.activeJobs.size,
      metrics: this.getMetrics()
    };
  }

  exportJobs(filter = {}) {
    const jobs = [];
    
    if (filter.status === JOB_STATUS.COMPLETED || !filter.status) {
      jobs.push(...this.getCompletedJobs(filter.limit));
    }
    
    if (filter.status === JOB_STATUS.FAILED || !filter.status) {
      jobs.push(...this.getFailedJobs(filter.limit));
    }
    
    if (filter.status === JOB_STATUS.RUNNING || !filter.status) {
      jobs.push(...this.getActiveJobs().filter(j => j.status === JOB_STATUS.RUNNING));
    }
    
    return jobs.map(j => j.toJSON());
  }

  clearHistory(olderThan = null) {
    let cleared = 0;
    
    if (olderThan) {
      const cutoff = olderThan instanceof Date ? olderThan.getTime() : Date.now() - olderThan;
      
      for (const [jobId, job] of this.completedJobs.entries()) {
        if (job.completedAt < cutoff) {
          this.completedJobs.delete(jobId);
          cleared++;
        }
      }
      
      for (const [jobId, job] of this.failedJobs.entries()) {
        if (job.completedAt < cutoff) {
          this.failedJobs.delete(jobId);
          cleared++;
        }
      }
    } else {
      cleared = this.completedJobs.size + this.failedJobs.size;
      this.completedJobs.clear();
      this.failedJobs.clear();
    }
    
    return cleared;
  }

  shutdown() {
    this.emit('agent:shutdown', { id: this.config.id });
    
    for (const [name, queue] of this.queues.entries()) {
      this.cancelJob;
    }
    
    this.queues.clear();
    this.workers.clear();
  }
}

module.exports = {
  BackgroundAgent,
  AgentJob,
  JobQueue,
  AGENT_PRIORITY,
  JOB_STATUS,
  JOB_EVENTS

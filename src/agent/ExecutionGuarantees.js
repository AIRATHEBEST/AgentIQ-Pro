/**
 * ExecutionGuarantees.js
 * 
 * Ensures deterministic task completion with:
 * - Step verification before moving forward
 * - Automatic retry strategies when a step fails
 * - Done criteria enforcement
 * - Checkpoint-based recovery
 * 
 * TOP PRIORITY FEATURE #1
 */

class ExecutionGuarantees {
  constructor(maxRetries = 3, checkpointInterval = 5) {
    this.maxRetries = maxRetries;
    this.checkpointInterval = checkpointInterval;
    this.executionHistory = [];
    this.checkpoints = {};
    this.failureLog = [];
    this.listeners = {};
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
   * Execute a task with guaranteed completion or explicit failure
   */
  async executeWithGuarantee(taskId, taskDefinition) {
    const execution = {
      taskId,
      startTime: Date.now(),
      steps: [],
      status: 'pending',
      retries: 0,
      completionCriteria: taskDefinition.completionCriteria || [],
      maxAttempts: taskDefinition.maxAttempts || this.maxRetries,
    };

    this.emit('task_started', { taskId, execution });

    try {
      // Check for checkpoint recovery
      const checkpoint = this.checkpoints[taskId];
      if (checkpoint && checkpoint.completed < taskDefinition.steps.length) {
        execution.steps = [...checkpoint.steps];
        execution.resumedFromStep = checkpoint.completed;
        this.emit('task_resumed', { taskId, fromStep: checkpoint.completed });
      }

      // Execute each step with verification
      for (let i = execution.resumedFromStep || 0; i < taskDefinition.steps.length; i++) {
        const step = taskDefinition.steps[i];
        const stepExecution = await this.executeStepWithRetry(step, i, taskId);

        execution.steps.push(stepExecution);

        // Checkpoint every N steps
        if ((i + 1) % this.checkpointInterval === 0) {
          this.createCheckpoint(taskId, execution);
        }

        // Step verification
        if (!await this.verifyStep(stepExecution, step)) {
          throw new Error(`Step ${i} verification failed: ${step.name}`);
        }

        this.emit('step_completed', { taskId, stepIndex: i, step: stepExecution });
      }

      // Verify completion criteria
      const criteriaResult = await this.verifyCompletionCriteria(execution, taskDefinition.completionCriteria);
      if (!criteriaResult.passed) {
        throw new Error(`Completion criteria failed: ${criteriaResult.failures.join(', ')}`);
      }

      execution.status = 'completed';
      execution.endTime = Date.now();
      execution.duration = execution.endTime - execution.startTime;
      this.executionHistory.push(execution);
      this.emit('task_completed', { taskId, execution });

      return {
        success: true,
        execution,
        output: execution.steps[execution.steps.length - 1]?.result,
      };
    } catch (err) {
      execution.status = 'failed';
      execution.error = err.message;
      execution.endTime = Date.now();
      this.failureLog.push({ taskId, error: err.message, timestamp: Date.now() });
      this.emit('task_failed', { taskId, error: err.message });
      return { success: false, execution, error: err.message };
    }
  }

  /**
   * Execute a single step with automatic retry
   */
  async executeStepWithRetry(step, stepIndex, taskId, attempt = 0) {
    const stepExecution = {
      name: step.name,
      description: step.description,
      stepIndex,
      attempt,
      startTime: Date.now(),
      retryCount: attempt,
      status: 'pending',
    };

    try {
      // Pre-validation (check preconditions)
      if (step.preconditions && !await this.validatePreconditions(step.preconditions)) {
        throw new Error(`Preconditions not met for step: ${step.name}`);
      }

      // Execute the step
      this.emit('step_started', { taskId, stepIndex, attempt, step: step.name });

      const result = await this.executeFunction(step.execute, {
        stepIndex,
        taskId,
        attempt,
      });

      stepExecution.result = result;
      stepExecution.status = 'completed';
      stepExecution.endTime = Date.now();
      stepExecution.duration = stepExecution.endTime - stepExecution.startTime;

      return stepExecution;
    } catch (err) {
      stepExecution.error = err.message;
      stepExecution.endTime = Date.now();

      // Retry logic
      if (attempt < step.maxRetries || (step.maxRetries === undefined && attempt < this.maxRetries)) {
        const backoffDelay = this.calculateBackoff(attempt, step.backoffStrategy);
        this.emit('step_retry', {
          taskId,
          stepIndex,
          attempt,
          nextAttempt: attempt + 1,
          delay: backoffDelay,
          reason: err.message,
        });

        await new Promise(r => setTimeout(r, backoffDelay));
        return this.executeStepWithRetry(step, stepIndex, taskId, attempt + 1);
      }

      stepExecution.status = 'failed';
      return stepExecution;
    }
  }

  /**
   * Verify a step completed successfully
   */
  async verifyStep(stepExecution, stepDefinition) {
    if (stepExecution.status === 'failed') return false;

    // Custom verification function
    if (stepDefinition.verify) {
      try {
        const isValid = await this.executeFunction(stepDefinition.verify, stepExecution);
        return isValid;
      } catch {
        return false;
      }
    }

    // Basic checks
    if (stepDefinition.expectedOutputType) {
      const actualType = typeof stepExecution.result;
      if (actualType !== stepDefinition.expectedOutputType) return false;
    }

    if (stepDefinition.expectedOutputSchema) {
      return this.validateSchema(stepExecution.result, stepDefinition.expectedOutputSchema);
    }

    return true;
  }

  /**
   * Verify completion criteria
   */
  async verifyCompletionCriteria(execution, criteria = []) {
    const results = {
      passed: true,
      failures: [],
    };

    for (const criterion of criteria) {
      try {
        const isMet = await this.executeFunction(criterion.check, execution);
        if (!isMet) {
          results.passed = false;
          results.failures.push(criterion.name);
        }
      } catch (err) {
        results.passed = false;
        results.failures.push(`${criterion.name}: ${err.message}`);
      }
    }

    return results;
  }

  /**
   * Validate preconditions
   */
  async validatePreconditions(preconditions) {
    for (const precond of preconditions) {
      const isValid = await this.executeFunction(precond.check, {});
      if (!isValid) return false;
    }
    return true;
  }

  /**
   * Create a checkpoint for recovery
   */
  createCheckpoint(taskId, execution) {
    this.checkpoints[taskId] = {
      taskId,
      steps: execution.steps,
      completed: execution.steps.length,
      timestamp: Date.now(),
    };
    this.emit('checkpoint_created', { taskId, completed: execution.steps.length });
  }

  /**
   * Calculate exponential backoff
   */
  calculateBackoff(attempt, strategy = 'exponential') {
    const baseDelay = 1000; // 1 second
    if (strategy === 'exponential') {
      return baseDelay * Math.pow(2, attempt) + Math.random() * 1000;
    } else if (strategy === 'linear') {
      return baseDelay * (attempt + 1);
    }
    return baseDelay;
  }

  /**
   * Execute a function safely
   */
  async executeFunction(fn, context) {
    if (typeof fn === 'function') {
      return await fn(context);
    }
    return fn;
  }

  /**
   * Validate against a schema
   */
  validateSchema(data, schema) {
    try {
      for (const key in schema) {
        if (schema.hasOwnProperty(key)) {
          const expectedType = schema[key];
          if (typeof data[key] !== expectedType) return false;
        }
      }
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get execution history
   */
  getExecutionHistory() {
    return this.executionHistory;
  }

  /**
   * Get failure log
   */
  getFailureLog() {
    return this.failureLog;
  }

  /**
   * Get success rate
   */
  getSuccessRate() {
    if (this.executionHistory.length === 0) return 0;
    const successful = this.executionHistory.filter(e => e.status === 'completed').length;
    return (successful / this.executionHistory.length) * 100;
  }

  /**
   * Clear history (optional)
   */
  clearHistory() {
    this.executionHistory = [];
    this.failureLog = [];
    this.checkpoints = {};
  }
}

export default new ExecutionGuarantees();

/**
 * Execution Engine - Retry/refine loop, context compression, step-level token budgeting
 * Handles agent execution with automatic retries, verification, and resource management
 */

import { eventBus } from './EventBus';

export class ExecutionEngine {
  constructor(config = {}) {
    this.config = {
      maxRetries: 3,
      maxContextTokens: 8192,
      stepBudgetPercent: 0.3, // 30% of context for each step
      compressionThreshold: 0.85, // Compress when 85% full
      refineAttempts: 2,
      verifyBeforeProceed: true,
      ...config
    };

this.eventBus = eventBus;
    this.executionHistory = [];
    this.activeExecution = null;
    this.contextWindows = new Map();
  }

  /**
   * Execute a task with automatic retry and refinement
   */
  async execute(task, executor) {
    const executionId = `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    this.eventBus.emit('execution:start', { executionId, task });
    
    const context = {
      executionId,
      task,
      attempts: 0,
      history: [],
      compressed: false,
      tokenBudget: this.calculateStepBudget()
    };

    this.activeExecution = context;
    this.contextWindows.set(executionId, {
      messages: [],
      totalTokens: 0,
      checkpoints: []
    });

    try {
      let result = null;
      let shouldRetry = true;

      while (shouldRetry && context.attempts < this.config.maxRetries) {
        context.attempts++;
        
        this.eventBus.emit('execution:attempt', {
          executionId,
          attempt: context.attempts,
          maxRetries: this.config.maxRetries
        });

        try {
          // Check if context needs compression
          if (this.shouldCompress(context)) {
            await this.compressContext(context);
          }

          // Execute with token budget
          result = await this.executeWithBudget(context, executor);
          
          // Verify result if enabled
          if (this.config.verifyBeforeProceed && result) {
            const verified = await this.verifyResult(result, context);
            
            if (!verified.success) {
              this.eventBus.emit('execution:verify_fail', {
                executionId,
                attempt: context.attempts,
                reason: verified.reason
              });
              
              // Refine the result
              result = await this.refineResult(result, verified.feedback, context);
            } else {
              this.eventBus.emit('execution:verify_success', { executionId, attempt: context.attempts });
              shouldRetry = false;
            }
          } else {
            shouldRetry = false;
          }

          if (result) {
            this.recordStep(context, result);
          }
        } catch (error) {
          this.eventBus.emit('execution:error', {
            executionId,
            attempt: context.attempts,
            error: error.message
          });

          if (context.attempts >= this.config.maxRetries) {
            throw error;
          }

          // Exponential backoff
          await this.delay(Math.pow(2, context.attempts) * 1000);
        }
      }

      this.eventBus.emit('execution:complete', {
        executionId,
        attempts: context.attempts,
        result
      });

      return result;
    } finally {
      this.activeExecution = null;
    }
  }

  /**
   * Execute with step-level token budget
   */
  async executeWithBudget(context, executor) {
    const window = this.contextWindows.get(context.executionId);
    
    const result = await executor({
      messages: window.messages,
      tokenBudget: context.tokenBudget,
      onTokenUsage: (tokens) => {
        window.totalTokens += tokens;
        context.tokenBudget -= tokens;
        
        this.eventBus.emit('execution:token_usage', {
          executionId: context.executionId,
          used: tokens,
          remaining: context.tokenBudget,
          total: window.totalTokens
        });
      }
    });

    return result;
  }

  /**
   * Calculate token budget for current step
   */
  calculateStepBudget() {
    return Math.floor(this.config.maxContextTokens * this.config.stepBudgetPercent);
  }

  /**
   * Check if context should be compressed
   */
  shouldCompress(context) {
    const window = this.contextWindows.get(context.executionId);
    if (!window) return false;

    const usageRatio = window.totalTokens / this.config.maxContextTokens;
    return usageRatio >= this.config.compressionThreshold && !context.compressed;
  }

  /**
   * Compress context using summarization
   */
  async compressContext(context) {
    const window = this.contextWindows.get(context.executionId);
    if (!window || window.messages.length < 4) return;

    this.eventBus.emit('execution:compress_start', {
      executionId: context.executionId,
      messageCount: window.messages.length
    });

    // Save checkpoint before compression
    const checkpoint = this.createCheckpoint(context);
    window.checkpoints.push(checkpoint);

    // Strategy: Keep first message (system), last N messages, and summaries
    const systemMessages = window.messages.filter(m => m.role === 'system');
    const nonSystem = window.messages.filter(m => m.role !== 'system');
    
    // Keep last 4 non-system messages and summarize the rest
    const recentMessages = nonSystem.slice(-4);
    const oldMessages = nonSystem.slice(0, -4);

    // Create summary of old messages
    const summary = await this.summarizeMessages(oldMessages);
    
    window.messages = [
      ...systemMessages,
      {
        role: 'system',
        content: `[Previous context summarized: ${summary}]`
      },
      ...recentMessages
    ];

    // Estimate new token count (rough approximation)
    window.totalTokens = window.totalTokens * 0.3; // Approximate compression ratio
    context.compressed = true;

    this.eventBus.emit('execution:compress_complete', {
      executionId: context.executionId,
      newMessageCount: window.messages.length,
      estimatedTokens: window.totalTokens
    });
  }

  /**
   * Summarize old messages (simplified - in production use LLM)
   */
  async summarizeMessages(messages) {
    if (messages.length === 0) return 'No previous actions';
    
    const summary = messages.map(m => {
      const preview = m.content.slice(0, 100);
      return `[${m.role}]: ${preview}...`;
    }).join('; ');

    return `${messages.length} previous interactions: ${summary}`;
  }

  /**
   * Verify result quality
   */
  async verifyResult(result, context) {
    if (!result || !result.content) {
      return { success: false, reason: 'Empty result' };
    }

    // Basic verification checks
    const checks = [
      { name: 'hasContent', pass: result.content.length > 0 },
      { name: 'notTooShort', pass: result.content.length > 50 },
      { name: 'noErrorIndicators', pass: !result.content.includes('error') && !result.content.includes('undefined') }
    ];

    const failedChecks = checks.filter(c => !c.pass);
    
    if (failedChecks.length > 0) {
      return {
        success: false,
        reason: `Failed checks: ${failedChecks.map(c => c.name).join(', ')}`,
        feedback: 'Result does not meet quality criteria'
      };
    }

    return { success: true };
  }

  /**
   * Refine result based on feedback
   */
  async refineResult(result, feedback, context) {
    this.eventBus.emit('execution:refine_start', {
      executionId: context.executionId,
      feedback
    });

    // In production, this would send back to LLM with refinement prompt
    // For now, just append feedback to history
    context.history.push({
      type: 'refinement',
      original: result,
      feedback
    });

    return {
      ...result,
      refined: true,
      originalFeedback: feedback
    };
  }

  /**
   * Record step in history
   */
  recordStep(context, result) {
    context.history.push({
      step: context.history.length + 1,
      result,
      tokens: context.tokenBudget
    });

    const window = this.contextWindows.get(context.executionId);
    if (window && result.content) {
      window.messages.push({
        role: 'assistant',
        content: result.content
      });
    }

    this.executionHistory.push({
      executionId: context.executionId,
      step: context.history.length,
      timestamp: Date.now()
    });
  }

  /**
   * Create checkpoint for crash recovery
   */
  createCheckpoint(context) {
    const window = this.contextWindows.get(context.executionId);
    return {
      timestamp: Date.now(),
      step: context.history.length,
      messages: [...window.messages],
      totalTokens: window.totalTokens,
      tokenBudget: context.tokenBudget
    };
  }

  /**
   * Restore from checkpoint
   */
  async restoreFromCheckpoint(executionId, checkpointIndex = -1) {
    const window = this.contextWindows.get(executionId);
    if (!window || window.checkpoints.length === 0) {
      throw new Error('No checkpoints available');
    }

    const checkpoint = window.checkpoints[checkpointIndex] || window.checkpoints[window.checkpoints.length - 1];
    
    this.eventBus.emit('execution:restore', {
      executionId,
      checkpoint: checkpointIndex,
      step: checkpoint.step
    });

    return checkpoint;
  }

  /**
   * Get execution statistics
   */
  getStats() {
    return {
      totalExecutions: this.executionHistory.length,
      activeExecution: this.activeExecution ? {
        id: this.activeExecution.executionId,
        attempts: this.activeExecution.attempts
      } : null,
      contextWindows: this.contextWindows.size,
      checkpoints: Array.from(this.contextWindows.values()).reduce(
        (sum, w) => sum + w.checkpoints.length, 0
      )
    };
  }

  /**
   * Utility delay function
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default ExecutionEngine;
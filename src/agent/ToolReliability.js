/**
 * ToolReliability.js
 * 
 * Tool governance system with:
 * - Tool selection scoring
 * - Tool failure detection & recovery
 * - Result validation
 * - Fallback tool chains
 * 
 * TOP PRIORITY FEATURE #4
 */

class ToolReliability {
  constructor() {
    this.tools = {};
    this.toolMetrics = {};
    this.failurePatterns = {};
    this.fallbackChains = {};
    this.listeners = {};
    this.executionLog = [];
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
   * Register a tool with reliability metadata
   */
  registerTool(toolDef) {
    const toolId = toolDef.name;
    this.tools[toolId] = {
      ...toolDef,
      registeredAt: Date.now(),
    };

    // Initialize metrics
    this.toolMetrics[toolId] = {
      totalCalls: 0,
      successfulCalls: 0,
      failedCalls: 0,
      averageResponseTime: 0,
      lastUsed: null,
      successRate: 100,
      reliability: 100,
      costEstimate: toolDef.costEstimate || 0,
    };

    this.emit('tool_registered', { toolId, tool: toolDef });
  }

  /**
   * Select best tool(s) for a task
   */
  selectBestTool(taskDescription, options = {}) {
    const candidates = Object.keys(this.tools)
      .map(toolId => ({
        toolId,
        tool: this.tools[toolId],
        score: this.calculateToolScore(toolId, taskDescription, options),
      }))
      .sort((a, b) => b.score - a.score);

    return {
      primary: candidates[0] || null,
      alternatives: candidates.slice(1, 3),
      scores: candidates,
    };
  }

  /**
   * Calculate tool suitability score
   */
  calculateToolScore(toolId, taskDescription, options = {}) {
    const metrics = this.toolMetrics[toolId];
    const tool = this.tools[toolId];

    // Base score from reliability
    let score = metrics.successRate;

    // Capability match (if keywords provided)
    if (tool.keywords) {
      const taskLower = taskDescription.toLowerCase();
      const matchCount = tool.keywords.filter(k => taskLower.includes(k.toLowerCase())).length;
      score += matchCount * 10;
    }

    // Response time efficiency
    if (metrics.averageResponseTime > 0) {
      const timeScore = Math.max(0, 100 - (metrics.averageResponseTime / 1000)); // Penalty per second
      score += timeScore * 0.2;
    }

    // Cost optimization (if specified)
    if (options.costaware && tool.costEstimate) {
      const costPenalty = tool.costEstimate * 5;
      score -= costPenalty;
    }

    // Availability bias
    const daysSinceUsed = metrics.lastUsed ? (Date.now() - metrics.lastUsed) / (1000 * 60 * 60 * 24) : null;
    if (daysSinceUsed && daysSinceUsed < 1) {
      score += 5; // Boost recently used tools
    }

    return score;
  }

  /**
   * Execute a tool with failure detection
   */
  async executeTool(toolId, input, options = {}) {
    const tool = this.tools[toolId];
    if (!tool) throw new Error(`Tool not found: ${toolId}`);

    const execution = {
      toolId,
      input,
      startTime: Date.now(),
      attempts: 0,
      status: 'pending',
      maxRetries: options.maxRetries || 2,
    };

    this.emit('tool_execution_start', { toolId, input });

    try {
      const result = await this.executeWithRetry(tool, input, execution, options);

      execution.result = result;
      execution.status = 'success';
      execution.endTime = Date.now();
      execution.duration = execution.endTime - execution.startTime;

      // Update metrics
      this.updateMetrics(toolId, execution, true);
      this.executionLog.push(execution);
      this.emit('tool_execution_success', execution);

      return { success: true, result, execution };
    } catch (err) {
      execution.error = err.message;
      execution.status = 'failed';
      execution.endTime = Date.now();

      this.updateMetrics(toolId, execution, false);
      this.recordFailurePattern(toolId, err);
      this.executionLog.push(execution);
      this.emit('tool_execution_failed', execution);

      // Try fallback chain
      if (options.useFallback) {
        return this.tryFallbackChain(toolId, input, options);
      }

      return { success: false, error: err.message, execution };
    }
  }

  /**
   * Execute with retry and backoff
   */
  async executeWithRetry(tool, input, execution, options = {}) {
    let lastError;

    for (let attempt = 0; attempt <= execution.maxRetries; attempt++) {
      execution.attempts = attempt + 1;

      try {
        if (attempt > 0) {
          const delay = 1000 * Math.pow(2, attempt - 1);
          await new Promise(r => setTimeout(r, delay));
        }

        this.emit('tool_attempt', { toolId: tool.name, attempt: attempt + 1 });

        // Execute the tool
        const result = await tool.execute(input);

        // Validate result
        if (tool.validateResult) {
          const isValid = await tool.validateResult(result);
          if (!isValid) {
            throw new Error('Tool result validation failed');
          }
        }

        return result;
      } catch (err) {
        lastError = err;
        if (attempt === execution.maxRetries) {
          throw err;
        }
      }
    }

    throw lastError;
  }

  /**
   * Try fallback tools if primary fails
   */
  async tryFallbackChain(toolId, input, options = {}) {
    const chain = this.fallbackChains[toolId] || [];

    for (const fallbackId of chain) {
      try {
        this.emit('fallback_attempted', { primaryTool: toolId, fallbackTool: fallbackId });
        const result = await this.executeTool(fallbackId, input, { useFallback: false });
        if (result.success) {
          return { ...result, usedFallback: true, fallbackTool: fallbackId };
        }
      } catch (err) {
        // Continue to next fallback
      }
    }

    return { success: false, error: 'All fallback tools failed' };
  }

  /**
   * Set fallback chain for a tool
   */
  setFallbackChain(toolId, fallbackToolIds) {
    this.fallbackChains[toolId] = fallbackToolIds;
    this.emit('fallback_chain_set', { toolId, chain: fallbackToolIds });
  }

  /**
   * Record failure patterns for analysis
   */
  recordFailurePattern(toolId, error) {
    if (!this.failurePatterns[toolId]) {
      this.failurePatterns[toolId] = {};
    }

    const errorType = error.name || error.message;
    if (!this.failurePatterns[toolId][errorType]) {
      this.failurePatterns[toolId][errorType] = 0;
    }

    this.failurePatterns[toolId][errorType]++;
  }

  /**
   * Update tool metrics after execution
   */
  updateMetrics(toolId, execution, success) {
    const metrics = this.toolMetrics[toolId];

    metrics.totalCalls++;
    metrics.lastUsed = Date.now();

    if (success) {
      metrics.successfulCalls++;
    } else {
      metrics.failedCalls++;
    }

    // Update success rate
    metrics.successRate = (metrics.successfulCalls / metrics.totalCalls) * 100;

    // Update average response time
    const newAvg = (metrics.averageResponseTime * (metrics.totalCalls - 1) + execution.duration) / metrics.totalCalls;
    metrics.averageResponseTime = newAvg;

    // Calculate reliability score (success rate + freshness + speed)
    metrics.reliability = metrics.successRate * 0.6 + (100 - Math.min(metrics.averageResponseTime / 100, 100)) * 0.4;
  }

  /**
   * Validate tool result
   */
  validateResult(result, schema) {
    if (!schema) return true;

    try {
      for (const key in schema) {
        if (schema.hasOwnProperty(key)) {
          const expectedType = schema[key];
          if (typeof result[key] !== expectedType) {
            return false;
          }
        }
      }
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get tool health report
   */
  getToolHealthReport() {
    return Object.keys(this.tools).map(toolId => ({
      toolId,
      metrics: this.toolMetrics[toolId],
      failurePatterns: this.failurePatterns[toolId] || {},
      health: this.toolMetrics[toolId].reliability,
    }));
  }

  /**
   * Detect tool issues
   */
  detectToolIssues() {
    const issues = [];

    for (const toolId in this.toolMetrics) {
      const metrics = this.toolMetrics[toolId];

      if (metrics.successRate < 50) {
        issues.push({
          toolId,
          type: 'low_success_rate',
          severity: 'high',
          message: `Tool has only ${metrics.successRate.toFixed(1)}% success rate`,
        });
      }

      if (metrics.averageResponseTime > 10000) {
        issues.push({
          toolId,
          type: 'slow_performance',
          severity: 'medium',
          message: `Tool average response time is ${metrics.averageResponseTime.toFixed(0)}ms`,
        });
      }

      const recentFailures = this.executionLog
        .filter(e => e.toolId === toolId && e.status === 'failed')
        .slice(-5);

      if (recentFailures.length >= 3) {
        issues.push({
          toolId,
          type: 'recent_failures',
          severity: 'high',
          message: `3+ failures in last 5 executions`,
          recentErrors: recentFailures.map(e => e.error),
        });
      }
    }

    return issues;
  }

  /**
   * Get execution statistics
   */
  getExecutionStats(toolId = null) {
    let logs = this.executionLog;
    if (toolId) logs = logs.filter(e => e.toolId === toolId);

    return {
      totalExecutions: logs.length,
      successful: logs.filter(e => e.status === 'success').length,
      failed: logs.filter(e => e.status === 'failed').length,
      averageDuration: logs.length > 0 ? logs.reduce((sum, e) => sum + e.duration, 0) / logs.length : 0,
      successRate: logs.length > 0 ? (logs.filter(e => e.status === 'success').length / logs.length) * 100 : 0,
    };
  }

  /**
   * Get all registered tools
   */
  getTools() {
    return this.tools;
  }

  /**
   * Clear execution log
   */
  clearExecutionLog() {
    this.executionLog = [];
  }
}

export default new ToolReliability();

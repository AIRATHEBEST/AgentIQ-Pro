/**
 * SandboxExecutor - Secure Tool Execution
 * Provides sandboxed environment for running untrusted code/tools safely
 * with resource limits, timeout handling, and result isolation.
 */

import { EventEmitter } from 'events';

// Browser-compatible stubs (these features require Node.js backend)
const fs = null;
const path = {
  resolve: (...args) => args.join('/'),
  join: (...args) => args.join('/'),
  dirname: (p) => p.split('/').slice(0, -1).join('/'),
  basename: (p) => p.split('/').pop()
};
// Execution result status
export const ExecutionStatus = {
  PENDING: 'pending',
  RUNNING: 'running',
  SUCCESS: 'success',
  TIMEOUT: 'timeout',
  ERROR: 'error',
  CANCELLED: 'cancelled'
};

// Resource limits configuration
export const DEFAULT_LIMITS = {
  maxMemoryMB: 512,
  maxCPUPercent: 80,
  maxExecutionTimeMs: 30000,
  maxOutputSize: 1024 * 1024, // 1MB
  maxFileSize: 10 * 1024 * 1024, // 10MB
  maxNetworkCalls: 10
};

// Tool execution result
export class ToolResult {
  constructor(success, output, error = null, metadata = {}) {
    this.success = success;
    this.output = output;
    this.error = error;
    this.metadata = {
      executionTime: 0,
      memoryUsed: 0,
      ...metadata
    };
  }

  toJSON() {
    return {
      success: this.success,
      output: this.output,
      error: this.error,
      metadata: this.metadata
    };
  }
}

// Sandbox context for isolated execution
export class SandboxContext {
  constructor(id, limits = DEFAULT_LIMITS) {
    this.id = id;
    this.limits = { ...DEFAULT_LIMITS, ...limits };
    this.startTime = null;
    this.endTime = null;
    this.memoryStart = 0;
    this.memoryEnd = 0;
    this.networkCalls = 0;
    this.outputLogs = [];
  }

  getExecutionTime() {
    if (!this.startTime) return 0;
    const end = this.endTime || Date.now();
    return end - this.startTime;
  }

  isTimeoutExceeded() {
    return this.getExecutionTime() > this.limits.maxExecutionTimeMs;
  }

  getMemoryUsage() {
    return this.memoryEnd - this.memoryStart;
  }

  canMakeNetworkCall() {
    return this.networkCalls < this.limits.maxNetworkCalls;
  }

  incrementNetworkCall() {
    this.networkCalls++;
  }
}

// SandboxExecutor class
export class SandboxExecutor extends EventEmitter {
  constructor(options = {}) {
    super();
    this.contexts = new Map();
    this.executionHistory = [];
    this.tools = new Map();
    this.hooks = {
      beforeExecution: options.beforeExecution || null,
      afterExecution: options.afterExecution || null,
      onError: options.onError || null
    };
    this.defaultLimits = { ...DEFAULT_LIMITS, ...options.limits };
    this.maxHistorySize = options.maxHistorySize || 100;

    // Persistence file (project root)
    this._persistencePath = path.resolve(__dirname, '../../sandbox_persistence.json');
    if (options.enablePersistence) {
      this._loadState();
    }
    
    this._registerBuiltInTools();
  }

  _saveState() {
    try {
      const state = {
        executionHistory: this.executionHistory,
        // contexts are transient; only history persisted
      };
      fs.writeFileSync(this._persistencePath, JSON.stringify(state, null, 2));
    } catch (e) {
      console.warn('Failed to persist SandboxExecutor state:', e);
    }
  }

  _loadState() {
    try {
      if (fs.existsSync(this._persistencePath)) {
        const raw = fs.readFileSync(this._persistencePath, 'utf-8');
        const data = JSON.parse(raw);
        this.executionHistory = data.executionHistory || [];
      }
    } catch (e) {
      console.warn('Failed to load SandboxExecutor state:', e);
    }
  }

  // Register built-in safe tools
  _registerBuiltInTools() {
    // String manipulation tools
    this.registerTool('string.trim', async (args) => {
      const { text } = args;
      return typeof text === 'string' ? text.trim() : '';
    });

    this.registerTool('string.replace', async (args) => {
      const { text, pattern, replacement } = args;
      return typeof text === 'string' ? text.replace(pattern, replacement || '') : '';
    });

    this.registerTool('string.match', async (args) => {
      const { text, pattern, flags = '' } = args;
      if (typeof text !== 'string') return [];
      try {
        const regex = new RegExp(pattern, flags);
        return text.match(regex) || [];
      } catch (e) {
        throw new Error(`Invalid regex pattern: ${pattern}`);
      }
    });

    // JSON tools
    this.registerTool('json.parse', async (args) => {
      const { text } = args;
      try {
        return JSON.parse(text);
      } catch (e) {
        throw new Error(`Invalid JSON: ${e.message}`);
      }
    });

    this.registerTool('json.stringify', async (args) => {
      const { value, indent } = args;
      return JSON.stringify(value, null, indent || 0);
    });

    // Math tools
    this.registerTool('math.evaluate', async (args) => {
      const { expression } = args;
      // Safe math evaluation - only allow numbers and operators
      const safeExpression = String(expression).replace(/[^0-9+\-*/().%\s]/g, '');
      try {
        // Using Function constructor as a simple safe evaluator
        const result = new Function(`return ${safeExpression}`)();
        if (typeof result !== 'number' || !isFinite(result)) {
          throw new Error('Result is not a finite number');
        }
        return result;
      } catch (e) {
        throw new Error(`Math evaluation error: ${e.message}`);
      }
    });

    // Array tools
    this.registerTool('array.filter', async (args) => {
      const { array, predicate } = args;
      if (!Array.isArray(array)) throw new Error('First argument must be an array');
      return array.filter(predicate);
    });

    this.registerTool('array.map', async (args) => {
      const { array, mapper } = args;
      if (!Array.isArray(array)) throw new Error('First argument must be an array');
      return array.map(mapper);
    });

    this.registerTool('array.reduce', async (args) => {
      const { array, reducer, initial } = args;
      if (!Array.isArray(array)) throw new Error('First argument must be an array');
      return array.reduce(reducer, initial);
    });

    // Object tools
    this.registerTool('object.keys', async (args) => {
      const { obj } = args;
      return Object.keys(obj || {});
    });

    this.registerTool('object.values', async (args) => {
      const { obj } = args;
      return Object.values(obj || {});
    });

    this.registerTool('object.merge', async (args) => {
      const { objects } = args;
      if (!Array.isArray(objects)) throw new Error('Objects must be an array');
      return Object.assign({}, ...objects);
    });

    // Date/time tools
    this.registerTool('datetime.now', async () => {
      return new Date().toISOString();
    });

    this.registerTool('datetime.format', async (args) => {
      const { date, format } = args;
      const d = date ? new Date(date) : new Date();
      return d.toISOString(); // Simple ISO format
    });

    // Validation tools
    this.registerTool('validation.isEmail', async (args) => {
      const { value } = args;
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return emailRegex.test(value || '');
    });

    this.registerTool('validation.isUrl', async (args) => {
      const { value } = args;
      try {
        new URL(value || '');
        return true;
      } catch {
        return false;
      }
    });

    this.registerTool('validation.isNumber', async (args) => {
      const { value } = args;
      return typeof value === 'number' && !isNaN(value);
    });

    // Text processing
    this.registerTool('text.truncate', async (args) => {
      const { text, maxLength = 100, suffix = '...' } = args;
      if (typeof text !== 'string') return '';
      return text.length > maxLength ? text.substring(0, maxLength - suffix.length) + suffix : text;
    });

    this.registerTool('text.wordCount', async (args) => {
      const { text } = args;
      if (typeof text !== 'string') return 0;
      return text.trim().split(/\s+/).filter(w => w.length > 0).length;
    });

    this.registerTool('text.hash', async (args) => {
      const { text } = args;
      if (typeof text !== 'string') return '';
      // Simple hash function for demonstration
      let hash = 0;
      for (let i = 0; i < text.length; i++) {
        const char = text.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
      }
      return Math.abs(hash).toString(16);
    });
  }

  /**
   * Register a custom tool for execution
   * @param {string} name - Tool name
   * @param {Function} handler - Tool handler function
   * @param {Object} options - Tool options (description, parameters, etc.)
   */
  registerTool(name, handler, options = {}) {
    if (typeof handler !== 'function') {
      throw new Error('Tool handler must be a function');
    }
    
    this.tools.set(name, {
      handler,
      description: options.description || `Tool: ${name}`,
      parameters: options.parameters || {},
      timeout: options.timeout || this.defaultLimits.maxExecutionTimeMs,
      restricted: options.restricted || false
    });

    this.emit('tool:registered', { name, options });
  }

  /**
   * Unregister a tool
   * @param {string} name - Tool name
   */
  unregisterTool(name) {
    const existed = this.tools.delete(name);
    if (existed) {
      this.emit('tool:unregistered', { name });
    }
    return existed;
  }

  /**
   * List all registered tools
   */
  listTools() {
    return Array.from(this.tools.keys());
  }

  /**
   * Check if a tool is registered
   * @param {string} name - Tool name
   */
  hasTool(name) {
    return this.tools.has(name);
  }

  /**
   * Create a new sandbox context
   * @param {Object} limits - Custom resource limits
   */
  createContext(limits = {}) {
    const id = `sandbox_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const context = new SandboxContext(id, { ...this.defaultLimits, ...limits });
    this.contexts.set(id, context);
    return context;
  }

  /**
   * Execute a tool with sandboxed environment
   * @param {string} toolName - Tool name to execute
   * @param {Object} args - Tool arguments
   * @param {Object} options - Execution options
   */
  async execute(toolName, args = {}, options = {}) {
    const context = options.context || this.createContext(options.limits);
    context.startTime = Date.now();

    // Check if tool exists
    const tool = this.tools.get(toolName);
    if (!tool) {
      const result = new ToolResult(false, null, `Tool not found: ${toolName}`);
      this._recordExecution(context, toolName, result, options);
      return result;
    }

    // Emit execution start event
    this.emit('execution:start', {
      toolName,
      args,
      contextId: context.id
    });

    // Call before hook
    if (this.hooks.beforeExecution) {
      try {
        await this.hooks.beforeExecution(toolName, args, context);
      } catch (e) {
        // Hook error is non-fatal
        console.warn('beforeExecution hook error:', e);
      }
    }

    // Execute with timeout
    const result = await this._executeWithTimeout(tool.handler, args, context, tool.timeout);

    // Update context end time
    context.endTime = Date.now();

    // Call after hook
    if (this.hooks.afterExecution) {
      try {
        await this.hooks.afterExecution(toolName, result, context);
      } catch (e) {
        console.warn('afterExecution hook error:', e);
      }
    }

    // Record execution
    this._recordExecution(context, toolName, result, options);

    // Emit completion event
    this.emit('execution:complete', {
      toolName,
      result: result.toJSON(),
      contextId: context.id,
      executionTime: context.getExecutionTime()
    });

    return result;
  }

  /**
   * Execute tool with timeout handling
   */
  async _executeWithTimeout(handler, args, context, timeout) {
    let timeoutId;

    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`Execution timeout after ${timeout}ms`));
      }, timeout);
    });

    try {
      const output = await Promise.race([
        handler(args, context),
        timeoutPromise
      ]);

      clearTimeout(timeoutId);

      // Check output size limit
      if (typeof output === 'string' && output.length > context.limits.maxOutputSize) {
        return new ToolResult(false, null, 'Output exceeds size limit', {
          executionTime: context.getExecutionTime(),
          outputSize: output.length,
          limitExceeded: 'maxOutputSize'
        });
      }

      return new ToolResult(true, output, null, {
        executionTime: context.getExecutionTime()
      });
    } catch (error) {
      clearTimeout(timeoutId);
      
      // Call error hook
      if (this.hooks.onError) {
        try {
          await this.hooks.onError(error, context);
        } catch (e) {
          console.warn('onError hook error:', e);
        }
      }

      // Determine if it's a timeout error
      if (error.message.includes('timeout')) {
        return new ToolResult(false, null, error.message, {
          executionTime: context.getExecutionTime(),
          status: ExecutionStatus.TIMEOUT
        });
      }

      return new ToolResult(false, null, error.message, {
        executionTime: context.getExecutionTime()
      });
    }
  }

  /**
   * Record execution in history
   */
  _recordExecution(context, toolName, result, options = {}) {
    const record = {
      id: `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      toolName,
      args: options.hideArgs ? '[hidden]' : options.args,
      result: result.toJSON(),
      contextId: context.id,
      timestamp: new Date().toISOString(),
      executionTime: context.getExecutionTime()
    };

    this.executionHistory.push(record);

    // Trim history if needed
    if (this.executionHistory.length > this.maxHistorySize) {
      this.executionHistory = this.executionHistory.slice(-this.maxHistorySize);
    }

    // Cleanup context
    this.contexts.delete(context.id);

    // Persist after each execution
    this._saveState();
  }

  /**
   * Get execution history
   * @param {Object} filter - Filter options
   */
  getHistory(filter = {}) {
    let history = [...this.executionHistory];

    if (filter.toolName) {
      history = history.filter(h => h.toolName === filter.toolName);
    }

    if (filter.status) {
      history = history.filter(h => h.result.success === (filter.status === 'success'));
    }

    if (filter.limit) {
      history = history.slice(-filter.limit);
    }

    return history;
  }

  /**
   * Get execution statistics
   */
  getStats() {
    const total = this.executionHistory.length;
    const successful = this.executionHistory.filter(h => h.result.success).length;
    const failed = total - successful;
    const timeouts = this.executionHistory.filter(h => h.result.metadata?.status === ExecutionStatus.TIMEOUT).length;

    const avgExecutionTime = total > 0
      ? this.executionHistory.reduce((sum, h) => sum + (h.result.metadata?.executionTime || 0), 0) / total
      : 0;

    const toolUsage = {};
    this.executionHistory.forEach(h => {
      toolUsage[h.toolName] = (toolUsage[h.toolName] || 0) + 1;
    });

    return {
      total,
      successful,
      failed,
      timeouts,
      successRate: total > 0 ? (successful / total * 100).toFixed(2) + '%' : '0%',
      avgExecutionTime: avgExecutionTime.toFixed(2) + 'ms',
      toolUsage,
      registeredTools: this.tools.size
    };
  }

  /**
   * Execute multiple tools in parallel
   * @param {Array} tasks - Array of {toolName, args} objects
   * @param {Object} options - Execution options
   */
  async executeParallel(tasks, options = {}) {
    const concurrency = options.concurrency || tasks.length;
    const results = [];
    const executing = [];

    for (const task of tasks) {
      const promise = this.execute(task.toolName, task.args, options);
      executing.push(promise);

      if (executing.length >= concurrency) {
        const settled = await Promise.allSettled(executing);
        results.push(...settled.map(s => s.value || s.reason));
        executing.length = 0;
      }
    }

    // Wait for remaining tasks
    if (executing.length > 0) {
      const settled = await Promise.allSettled(executing);
      results.push(...settled.map(s => s.value || s.reason));
    }

    return results;
  }

  /**
   * Execute tools in sequence (pipeline)
   * @param {Array} tasks - Array of {toolName, args} objects
   * @param {Object} options - Execution options
   */
  async executePipeline(tasks, options = {}) {
    const results = [];
    let context = options.context || this.createContext(options.limits);
    context.startTime = Date.now();

    for (const task of tasks) {
      // Pass previous result as context
      const enrichedArgs = {
        ...task.args,
        _previousResult: results.length > 0 ? results[results.length - 1] : null
      };

      const result = await this.execute(task.toolName, enrichedArgs, {
        ...options,
        context
      });

      results.push(result);

      // Stop if execution fails
      if (!result.success && options.stopOnError) {
        break;
      }

      // Check timeout
      if (context.isTimeoutExceeded()) {
        results.push(new ToolResult(false, null, 'Pipeline timeout exceeded'));
        break;
      }
    }

    return results;
  }

  /**
   * Cancel a running execution
   * @param {string} contextId - Context ID to cancel
   */
  cancelExecution(contextId) {
    const context = this.contexts.get(contextId);
    if (context) {
      context.endTime = Date.now();
      this.emit('execution:cancelled', { contextId });
      return true;
    }
    return false;
  }

  /**
   * Clear execution history
   */
  clearHistory() {
    this.executionHistory = [];
    this.emit('history:cleared');
  }

  /**
   * Reset executor to initial state
   */
  reset() {
    this.contexts.clear();
    this.executionHistory = [];
    this.emit('reset');
  }

  /**
   * Destroy executor and cleanup
   */
  destroy() {
    this.contexts.clear();
    this.executionHistory = [];
    this.tools.clear();
    this.removeAllListeners();
  }
}

// Factory function to create executor
export function createSandboxExecutor(options = {}) {
  return new SandboxExecutor(options);
}

// Helper to wrap async functions with sandbox
export function sandboxed(fn, limits = {}) {
  return async function(...args) {
    const executor = new SandboxExecutor({ limits });
    const toolName = 'wrapped_' + Date.now();
    executor.registerTool(toolName, fn);
    const result = await executor.execute(toolName, { args });
    executor.destroy();
    return result;
  };
}

// Export for CommonJS
export default SandboxExecutor;
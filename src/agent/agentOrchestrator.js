/**
 * Agent Orchestrator for AgentIQ Pro
 * Coordinates all agents, manages execution context, and handles task delegation
 */

class AgentTask {
  constructor(id, type, description, priority = 5) {
    this.id = id;
    this.type = type;
    this.description = description;
    this.priority = priority;
    this.status = 'pending';
    this.createdAt = Date.now();
    this.startedAt = null;
    this.completedAt = null;
    this.result = null;
    this.error = null;
    this.subtasks = [];
    this.metadata = {};
  }
}

class ExecutionContext {
  constructor() {
    this.id = crypto.randomUUID?.() || `ctx-${Date.now()}` || `ctx-${Math.random().toString(36).slice(2)}`;
    this.tasks = [];
    this.memory = [];
    this.tools = [];
    this.agents = [];
    this.metadata = {};
    this.createdAt = Date.now();
    this.parentContext = null;
  }
}

class AgentOrchestrator {
  constructor() {
    this.agents = new Map();
    this.executionContexts = new Map();
    this.taskQueue = [];
    this.activeTasks = new Map();
    this.completedTasks = new Map();
    this.eventListeners = new Map();
    this.settings = {
      maxConcurrentTasks: 5,
      taskTimeout: 300000, // 5 minutes
      enableRetry: true,
      maxRetries: 3,
      enableParallelExecution: true,
    };
    this.stats = {
      totalTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
      avgExecutionTime: 0,
    };
    this.initialized = false;
  }

  initialize() {
    if (this.initialized) return;
    this.initialized = true;
    console.log('[AgentOrchestrator] Initialized');
  }

  // Event handling
  on(event, callback) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event).push(callback);
  }

  off(event, callback) {
    if (this.eventListeners.has(event)) {
      const listeners = this.eventListeners.get(event);
      const index = listeners.indexOf(callback);
      if (index > -1) listeners.splice(index, 1);
    }
  }

  emit(event, data) {
    if (this.eventListeners.has(event)) {
      this.eventListeners.get(event).forEach(cb => cb(data));
    }
  }

  // Register agent
  registerAgent(agent) {
    this.agents.set(agent.id, agent);
    this.emit('agentRegistered', agent);
    return agent;
  }

  // Create execution context
  createContext(parentContext = null) {
    const context = new ExecutionContext();
    context.parentContext = parentContext;
    this.executionContexts.set(context.id, context);
    this.emit('contextCreated', context);
    return context;
  }

  // Task management
  async executeTask(task, context) {
    const taskId = task.id || `task-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const agentTask = new AgentTask(taskId, task.type, task.description, task.priority);
    
    this.stats.totalTasks++;
    this.activeTasks.set(taskId, agentTask);
    
    this.emit('taskStarted', agentTask);
    
    agentTask.status = 'running';
    agentTask.startedAt = Date.now();
    
    try {
      // Find appropriate agent
      const agent = this.findAgentForTask(task.type);
      
      if (agent) {
        agentTask.result = await this.executeWithAgent(agent, task, context);
      } else {
        agentTask.result = await this.executeDefault(task, context);
      }
      
      agentTask.status = 'completed';
      agentTask.completedAt = Date.now();
      this.stats.completedTasks++;
      
    } catch (error) {
      agentTask.status = 'failed';
      agentTask.error = error.message;
      agentTask.completedAt = Date.now();
      this.stats.failedTasks++;
      
      if (this.settings.enableRetry && agentTask.metadata.retryCount < this.settings.maxRetries) {
        return this.retryTask(task, context, agentTask);
      }
    }
    
    this.completedTasks.set(taskId, agentTask);
    this.activeTasks.delete(taskId);
    
    this.emit('taskCompleted', agentTask);
    
    return agentTask;
  }

  findAgentForTask(taskType) {
    for (const [id, agent] of this.agents) {
      if (agent.supportedTasks?.includes(taskType)) {
        return agent;
      }
    }
    return null;
  }

  async executeWithAgent(agent, task, context) {
    if (agent.execute) {
      return await agent.execute(task, context);
    }
    return { success: false, error: 'Agent execute method not implemented' };
  }

  async executeDefault(task, context) {
    // Simulated execution
    return {
      success: true,
      output: `Executed task: ${task.description}`,
      metadata: { type: task.type }
    };
  }

  async retryTask(task, context, failedTask) {
    failedTask.metadata.retryCount = (failedTask.metadata.retryCount || 0) + 1;
    this.emit('taskRetry', { task: failedTask, attempt: failedTask.metadata.retryCount });
    return this.executeTask(task, context);
  }

  // Batch execution
  async executeBatch(tasks, context) {
    const results = [];
    
    if (this.settings.enableParallelExecution) {
      // Execute in parallel with concurrency limit
      const chunks = this.chunkArray(tasks, this.settings.maxConcurrentTasks);
      
      for (const chunk of chunks) {
        const chunkResults = await Promise.all(
          chunk.map(task => this.executeTask(task, context))
        );
        results.push(...chunkResults);
      }
    } else {
      // Execute sequentially
      for (const task of tasks) {
        const result = await this.executeTask(task, context);
        results.push(result);
      }
    }
    
    return results;
  }

  chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  // Priority queue management
  addToQueue(task) {
    this.taskQueue.push(task);
    this.taskQueue.sort((a, b) => b.priority - a.priority);
    this.emit('taskAdded', task);
  }

  getNextTask() {
    return this.taskQueue.shift();
  }

  // Context management
  updateContext(contextId, updates) {
    const context = this.executionContexts.get(contextId);
    if (context) {
      Object.assign(context, updates);
      this.emit('contextUpdated', context);
    }
    return context;
  }

  // Statistics
  getStats() {
    const activeCount = this.activeTasks.size;
    const completedCount = this.completedTasks.size;
    const total = this.stats.totalTasks;
    
    return {
      ...this.stats,
      activeTasks: activeCount,
      queueLength: this.taskQueue.length,
      registeredAgents: this.agents.size,
      successRate: total > 0 ? (this.stats.completedTasks / total) : 0,
      failureRate: total > 0 ? (this.stats.failedTasks / total) : 0,
    };
  }

  // Cleanup
  clearCompletedTasks() {
    const count = this.completedTasks.size;
    this.completedTasks.clear();
    return count;
  }

  shutdown() {
    this.agents.clear();
    this.executionContexts.clear();
    this.taskQueue = [];
    this.activeTasks.clear();
    this.completedTasks.clear();
    this.initialized = false;
    console.log('[AgentOrchestrator] Shutdown complete');
  }
}

// Default orchestrator instance
const agentOrchestrator = new AgentOrchestrator();

export default AgentOrchestrator;
export { agentOrchestrator, AgentTask, ExecutionContext };
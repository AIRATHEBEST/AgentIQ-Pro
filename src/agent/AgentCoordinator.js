/**
 * Agent Coordinator - Manus 1.6 Max Pro Feature
 * Multi-Agent Orchestration with parallel task execution and dynamic agent spawning
 */

import { EventEmitter } from 'events';

export const AgentState = {
  IDLE: 'idle',
  RUNNING: 'running',
  WAITING: 'waiting',
  COMPLETED: 'completed',
  FAILED: 'failed'
};

export class Agent extends EventEmitter {
  constructor(id, config = {}) {
    super();
    this.id = id;
    this.name = config.name || `Agent-${id}`;
    this.capabilities = config.capabilities || [];
    this.state = AgentState.IDLE;
    this.currentTask = null;
    this.taskHistory = [];
    this.metadata = {
      createdAt: Date.now(),
      lastActive: Date.now(),
      totalTasks: 0,
      successRate: 1.0
    };
  }

  async executeTask(task, context = {}) {
    this.state = AgentState.RUNNING;
    this.currentTask = task;
    this.metadata.lastActive = Date.now();
    
    this.emit('task:start', { agentId: this.id, task });
    
    try {
      const result = await this.processTask(task, context);
      this.state = AgentState.COMPLETED;
      this.recordTaskResult(task, true, result);
      this.emit('task:complete', { agentId: this.id, task, result });
      return { success: true, result, agentId: this.id };
    } catch (error) {
      this.state = AgentState.FAILED;
      this.recordTaskResult(task, false, error);
      this.emit('task:failed', { agentId: this.id, task, error: error.message });
      return { success: false, error: error.message, agentId: this.id };
    }
  }

  async processTask(task, context) {
    // Simulate task processing - override in subclasses
    await new Promise(resolve => setTimeout(resolve, 100));
    return { output: `Processed by ${this.name}`, task, context };
  }

  recordTaskResult(task, success, result) {
    this.taskHistory.push({
      task,
      success,
      result,
      timestamp: Date.now()
    });
    this.metadata.totalTasks++;
    this.metadata.lastActive = Date.now();
    
    const successes = this.taskHistory.filter(t => t.success).length;
    this.metadata.successRate = successes / this.taskHistory.length;
  }

  canHandle(taskRequirements) {
    return taskRequirements.every(req => this.capabilities.includes(req));
  }

  getMetrics() {
    return {
      id: this.id,
      name: this.name,
      state: this.state,
      totalTasks: this.metadata.totalTasks,
      successRate: this.metadata.successRate,
      capabilities: this.capabilities
    };
  }
}

export class AgentCoordinator extends EventEmitter {
  constructor(config = {}) {
    super();
    this.agents = new Map();
    this.taskQueue = [];
    this.executionHistory = [];
    this.maxConcurrency = config.maxConcurrency || 5;
    this.activeExecutions = 0;
    this.agentCounter = 0;
    
    // Task dependencies graph
    this.dependencyGraph = new Map();
  }

  registerAgent(agent) {
    this.agents.set(agent.id, agent);
    agent.on('task:complete', (data) => this.handleAgentTaskComplete(data));
    agent.on('task:failed', (data) => this.handleAgentTaskFailed(data));
    this.emit('agent:registered', { agentId: agent.id });
    return agent;
  }

  createAgent(config = {}) {
    this.agentCounter++;
    const agent = new Agent(`agent-${this.agentCounter}`, {
      name: config.name || `Agent-${this.agentCounter}`,
      capabilities: config.capabilities || ['default']
    });
    return this.registerAgent(agent);
  }

  async spawnAgent(template) {
    const agent = this.createAgent({
      name: template.name,
      capabilities: template.capabilities
    });
    
    this.emit('agent:spawned', { agentId: agent.id, template });
    return agent;
  }

  async dispatchTask(task, agentId = null, priority = 0) {
    const taskItem = {
      id: `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      task,
      priority,
      status: 'pending',
      assignedAgent: agentId,
      dependencies: task.dependencies || [],
      createdAt: Date.now()
    };

    // Add to dependency graph
    this.dependencyGraph.set(taskItem.id, {
      dependsOn: task.dependencies || [],
      dependsOnBy: []
    });

    // Update reverse dependencies
    for (const depId of (task.dependencies || [])) {
      if (this.dependencyGraph.has(depId)) {
        this.dependencyGraph.get(depId).dependsOnBy.push(taskItem.id);
      }
    }

    this.taskQueue.push(taskItem);
    this.taskQueue.sort((a, b) => b.priority - a.priority);
    
    this.emit('task:queued', { taskId: taskItem.id, task });
    
    // Try to execute immediately if agent specified
    if (agentId && this.agents.has(agentId)) {
      await this.executeTask(taskItem);
    }

    return taskItem.id;
  }

  async executeTask(taskItem) {
    if (!this.canExecute(taskItem)) {
      return { success: false, reason: 'Dependencies not met', taskId: taskItem.id };
    }

    const agent = this.findBestAgent(taskItem.task);
    if (!agent) {
      taskItem.status = 'waiting';
      this.emit('task:waiting', { taskId: taskItem.id, reason: 'No available agent' });
      return { success: false, reason: 'No suitable agent', taskId: taskItem.id };
    }

    this.activeExecutions++;
    taskItem.status = 'running';
    taskItem.startedAt = Date.now();

    this.emit('task:start', { taskId: taskItem.id, agentId: agent.id });

    const result = await agent.executeTask(taskItem.task, {
      coordinator: this,
      taskId: taskItem.id
    });

    this.activeExecutions--;
    taskItem.completedAt = Date.now();
    taskItem.result = result;
    taskItem.status = result.success ? 'completed' : 'failed';

    this.executionHistory.push(taskItem);
    this.processQueue(); // Check for newly executable tasks

    return result;
  }

  canExecute(taskItem) {
    const deps = this.dependencyGraph.get(taskItem.id)?.dependsOn || [];
    return deps.every(depId => {
      const depTask = this.taskQueue.find(t => t.id === depId);
      return depTask && depTask.status === 'completed';
    });
  }

  findBestAgent(task) {
    const requirements = task.capabilities || [];
    const available = Array.from(this.agents.values())
      .filter(a => a.state === AgentState.IDLE && a.canHandle(requirements));
    
    if (available.length === 0) return null;
    
    // Return agent with highest success rate
    return available.sort((a, b) => b.metadata.successRate - a.metadata.successRate)[0];
  }

  async executeParallel(tasks, options = {}) {
    const concurrency = options.concurrency || this.maxConcurrency;
    const results = [];
    
    const chunks = [];
    for (let i = 0; i < tasks.length; i += concurrency) {
      chunks.push(tasks.slice(i, i + concurrency));
    }

    for (const chunk of chunks) {
      const chunkResults = await Promise.all(
        chunk.map(task => this.dispatchTask(task))
      );
      results.push(...chunkResults);
    }

    return results;
  }

  async executePipeline(tasks) {
    const results = [];
    for (const task of tasks) {
      const taskId = await this.dispatchTask(task);
      const taskItem = this.taskQueue.find(t => t.id === taskId);
      
      // Wait for completion
      await this.waitForTask(taskId);
      
      results.push(taskItem?.result);
    }
    return results;
  }

  async waitForTask(taskId, timeout = 30000) {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.off('task:complete', handler);
        reject(new Error('Task timeout'));
      }, timeout);

      const handler = (data) => {
        const taskItem = this.taskQueue.find(t => t.id === taskId);
        if (taskItem?.status === 'completed') {
          clearTimeout(timeoutId);
          resolve(taskItem.result);
        }
      };

      this.on('task:complete', handler);
    });
  }

  processQueue() {
    const pendingTasks = this.taskQueue.filter(t => t.status === 'pending');
    for (const task of pendingTasks) {
      if (this.canExecute(task)) {
        this.executeTask(task);
      }
    }
  }

  handleAgentTaskComplete(data) {
    this.emit('agent:task-complete', data);
    this.processQueue();
  }

  handleAgentTaskFailed(data) {
    this.emit('agent:task-failed', data);
    this.processQueue();
  }

  getAgent(id) {
    return this.agents.get(id);
  }

  listAgents(filters = {}) {
    let agents = Array.from(this.agents.values());
    
    if (filters.state) {
      agents = agents.filter(a => a.state === filters.state);
    }
    if (filters.capability) {
      agents = agents.filter(a => a.capabilities.includes(filters.capability));
    }
    
    return agents.map(a => a.getMetrics());
  }

  getTaskStatus(taskId) {
    return this.taskQueue.find(t => t.id === taskId);
  }

  listTasks(filters = {}) {
    let tasks = this.taskQueue;
    
    if (filters.status) {
      tasks = tasks.filter(t => t.status === filters.status);
    }
    
    return tasks;
  }

  getStats() {
    const agentMetrics = Array.from(this.agents.values()).map(a => a.getMetrics());
    const completedTasks = this.taskQueue.filter(t => t.status === 'completed');
    const failedTasks = this.taskQueue.filter(t => t.status === 'failed');
    
    return {
      totalAgents: this.agents.size,
      activeAgents: agentMetrics.filter(a => a.state === 'running').length,
      totalTasks: this.taskQueue.length,
      completedTasks: completedTasks.length,
      failedTasks: failedTasks.length,
      pendingTasks: this.taskQueue.filter(t => t.status === 'pending').length,
      activeExecutions: this.activeExecutions,
      avgSuccessRate: agentMetrics.reduce((sum, a) => sum + a.successRate, 0) / agentMetrics.length || 0
    };
  }

  destroy() {
    for (const agent of this.agents.values()) {
      agent.removeAllListeners();
    }
    this.agents.clear();
    this.taskQueue = [];
    this.executionHistory = [];
  }
}

// Factory function
export function createAgentCoordinator(config) {
  return new AgentCoordinator(config);
}

export default AgentCoordinator;

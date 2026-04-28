/**
 * MultiAgentSystem - Parallel agent execution with role specialization
 * Implements coordinated multi-agent execution for complex tasks
 */

import { getLLMRouter } from './LLMRouter';
import ExecutionEngine from './ExecutionEngine';

class WorkerAgent {
  constructor(id, role, config = {}) {
    this.id = id;
    this.role = role;
    this.config = {
      model: config.model || 'llama3',
      maxTokens: config.maxTokens || 2048,
      temperature: config.temperature || 0.7,
      ...config
    };
    this.memory = [];
    this.status = 'idle';
  }

  /**
   * Get role-specific system prompt
   */
  getSystemPrompt() {
    const rolePrompts = {
      planner: `You are a planner agent. Break down complex tasks into clear, executable steps.
Analyze requirements and create actionable plans. Consider dependencies and optimal execution order.`,

      coder: `You are a coder agent. Write clean, efficient code following best practices.
Focus on correctness, readability, and maintainability. Handle edge cases gracefully.`,

      reviewer: `You are a reviewer agent. Evaluate work critically and provide constructive feedback.
Identify issues, suggest improvements, and verify quality standards are met.`,

      researcher: `You are a researcher agent. Gather information, analyze data, and synthesize insights.
Provide comprehensive research with proper citations and sources.`,

      executor: `You are an executor agent. Execute plans precisely and efficiently.
Report progress clearly and handle any blocking issues.`,

      default: `You are a specialized agent executing tasks as assigned.`
    };

    return rolePrompts[this.role] || rolePrompts.default;
  }

  /**
   * Execute a task assigned to this agent
   */
  async execute(task) {
    this.status = 'working';
    const startTime = Date.now();

    try {
      // Store context for this execution
      this.memory.push({
        timestamp: startTime,
        task: task.name,
        role: this.role
      });

      // Build prompt with role context
      const prompt = this.buildTaskPrompt(task);

      // Execute via LLM router with role-appropriate settings
      const llmRouter = getLLMRouter();
      const response = await llmRouter.chat({
        prompt,
        taskType: task.type || 'analysis',
        priority: task.priority || 'balanced',
        context: this.getRelevantContext(task),
        systemPrompt: this.getSystemPrompt()
      });

      const duration = Date.now() - startTime;
      this.status = 'idle';

      return {
        agentId: this.id,
        role: this.role,
        success: true,
        output: response.content,
        duration,
        provider: response.provider
      };
    } catch (error) {
      this.status = 'error';
      return {
        agentId: this.id,
        role: this.role,
        success: false,
        error: error.message,
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * Build task prompt with role-specific framing
   */
  buildTaskPrompt(task) {
    let prompt = task.description || task.name || '';

    if (task.context) {
      prompt += `\n\nContext: ${task.context}`;
    }

    if (task.constraints) {
      prompt += `\n\nConstraints: ${task.constraints.join(', ')}`;
    }

    if (task.examples) {
      prompt += `\n\nExamples: ${task.examples}`;
    }

    return prompt;
  }

  /**
   * Get relevant context from agent's memory
   */
  getRelevantContext(task) {
    // Get last 5 memory entries relevant to this task
    const relevant = this.memory
      .filter(m => m.task.includes(task.type || ''))
      .slice(-5);

    return relevant.map(m => ({
      role: 'assistant',
      content: `Previous task: ${m.task}`
    }));
  }
}

class MultiAgentSystem {
  constructor(options = {}) {
    this.agents = new Map();
    this.sharedMemory = [];
    this.maxAgents = options.maxAgents || 5;
    this.verbose = options.verbose || false;

    // Role definitions with specializations
    this.roleDefinitions = {
      planner: { maxConcurrent: 1, specialization: 'planning' },
      coder: { maxConcurrent: 3, specialization: 'code_generation' },
      reviewer: { maxConcurrent: 2, specialization: 'analysis' },
      researcher: { maxConcurrent: 2, specialization: 'research' },
      executor: { maxConcurrent: 3, specialization: 'execution' }
    };

    // Initialize default agents
    this.initializeDefaultAgents();
  }

  /**
   * Initialize default agent pool
   */
  initializeDefaultAgents() {
    const defaults = [
      { id: 'planner-1', role: 'planner' },
      { id: 'coder-1', role: 'coder' },
      { id: 'coder-2', role: 'coder' },
      { id: 'reviewer-1', role: 'reviewer' },
      { id: 'researcher-1', role: 'researcher' }
    ];

    defaults.forEach(({ id, role }) => {
      this.registerAgent(new WorkerAgent(id, role));
    });
  }

  /**
   * Register a new agent
   */
  registerAgent(agent) {
    if (this.agents.size >= this.maxAgents) {
      throw new Error(`Maximum agents (${this.maxAgents}) reached`);
    }
    this.agents.set(agent.id, agent);

    if (this.verbose) {
      console.log(`[MultiAgentSystem] Registered agent: ${agent.id} (${agent.role})`);
    }
  }

  /**
   * Get available agent for a specific role
   */
  getAvailableAgent(role) {
    const agents = Array.from(this.agents.values())
      .filter(a => a.role === role && a.status === 'idle');

    if (agents.length > 0) {
      return agents[0];
    }

    // Fallback: return any idle agent
    const idleAgents = Array.from(this.agents.values())
      .filter(a => a.status === 'idle');

    return idleAgents[0] || null;
  }

  /**
   * Infer role from task type
   */
  inferRole(taskType) {
    const roleMap = {
      'planning': 'planner',
      'code_generation': 'coder',
      'debugging': 'coder',
      'analysis': 'reviewer',
      'review': 'reviewer',
      'research': 'researcher',
      'information_gathering': 'researcher',
      'execution': 'executor',
      'default': 'planner'
    };

    return roleMap[taskType] || roleMap.default;
  }

  /**
   * Execute a single task with role assignment
   */
  async executeTask(task) {
    const role = task.preferredRole || this.inferRole(task.type);
    const agent = this.getAvailableAgent(role);

    if (!agent) {
      return {
        success: false,
        error: `No available agent for role: ${role}`,
        task: task.name
      };
    }

    if (this.verbose) {
    console.log(`[MultiAgentSystem] Task "${task.name}" → Agent ${agent.id} (${role})`);
    }

    const executionEngine = new ExecutionEngine();
    const result = await executionEngine.run(task, (t) => agent.execute(t));

    // Store result in shared memory
    this.sharedMemory.push({
      timestamp: Date.now(),
      task: task.name,
      role,
      agentId: agent.id,
      success: result.success,
      result: result.result
    });

    return {
      ...result,
      agentId: agent.id,
      role
    };
  }

  /**
   * Execute multiple tasks in parallel with agent coordination
   */
  async executeTasks(tasks, options = {}) {
    const maxConcurrency = options.maxConcurrency || 3;
    const results = [];

    if (this.verbose) {
      console.log(`[MultiAgentSystem] Executing ${tasks.length} tasks (max ${maxConcurrency} concurrent)`);
    }

    // Process in batches for controlled parallelism
    for (let i = 0; i < tasks.length; i += maxConcurrency) {
      const batch = tasks.slice(i, i + maxConcurrency);

      if (this.verbose) {
        console.log(`[MultiAgentSystem] Batch ${Math.floor(i / maxConcurrency) + 1}: ${batch.length} tasks`);
      }

      const batchResults = await Promise.all(
        batch.map(task => this.executeTask(task))
      );

      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Execute a complex task requiring multiple specialized agents
   */
  async executePipeline(pipeline) {
    const { name, stages } = pipeline;
    const pipelineResults = [];

    if (this.verbose) {
      console.log(`[MultiAgentSystem] Starting pipeline: ${name}`);
    }

    let previousOutput = null;

    for (let i = 0; i < stages.length; i++) {
      const stage = stages[i];
      
      if (this.verbose) {
        console.log(`[MultiAgentSystem] Stage ${i + 1}/${stages.length}: ${stage.name}`);
      }

      // Prepare stage input
      const stageInput = {
        ...stage,
        context: previousOutput ? `Previous stage output:\n${previousOutput}\n\n${stage.context || ''}` : stage.context
      };

      // Execute stage
      const stageResult = await this.executeTask(stageInput);

      if (!stageResult.success && stage.critical) {
        return {
          success: false,
          error: `Critical stage failed: ${stage.name}`,
          failedAt: i,
          partialResults: pipelineResults
        };
      }

      pipelineResults.push({
        stage: stage.name,
        result: stageResult
      });

      previousOutput = stageResult.result?.output || stageResult.result;
    }

    return {
      success: true,
      pipelineName: name,
      stages: pipelineResults.length,
      results: pipelineResults
    };
  }

  /**
   * Get system status and metrics
   */
  getStatus() {
    const agentStats = Array.from(this.agents.values()).map(a => ({
      id: a.id,
      role: a.role,
      status: a.status,
      memorySize: a.memory.length
    }));

    return {
      totalAgents: this.agents.size,
      activeAgents: agentStats.filter(a => a.status === 'working').length,
      idleAgents: agentStats.filter(a => a.status === 'idle').length,
      agents: agentStats,
      sharedMemorySize: this.sharedMemory.length
    };
  }

  /**
   * Clear shared memory
   */
  clearMemory() {
    this.sharedMemory = [];
    this.agents.forEach(agent => {
      agent.memory = [];
    });
  }

  /**
   * Remove an agent from the pool
   */
  removeAgent(agentId) {
    if (this.agents.has(agentId)) {
      this.agents.delete(agentId);
      return true;
    }
    return false;
  }

  /**
   * Create a specialized agent on demand
   */
  createAgent(id, role, config) {
    const agent = new WorkerAgent(id, role, config);
    this.registerAgent(agent);
    return agent;
  }
}

export default MultiAgentSystem;
export const multiAgentSystem = new MultiAgentSystem();

// Pipeline factory for common workflows
export function createCodeReviewPipeline(code, language) {
  return {
    name: 'code-review',
    stages: [
      {
        name: 'analyze-code',
        type: 'analysis',
        description: `Analyze the following ${language} code for structure and quality`,
        context: code,
        critical: true
      },
      {
        name: 'identify-issues',
        type: 'review',
        description: 'Identify potential bugs, security issues, and code smells',
        context: code,
        critical: false
      },
      {
        name: 'generate-report',
        type: 'research',
        description: 'Compile findings into a comprehensive review report',
        critical: false
      }
    ]
  };
}

export function createDevelopmentPipeline(specification) {
  return {
    name: 'development',
    stages: [
      {
        name: 'plan-implementation',
        type: 'planning',
        description: 'Create implementation plan based on specification',
        context: specification,
        critical: true
      },
      {
        name: 'write-code',
        type: 'code_generation',
        description: 'Write clean, well-documented code implementing the plan',
        critical: true
      },
      {
        name: 'review-code',
        type: 'review',
        description: 'Review code for quality, security, and best practices',
        critical: true
      },
      {
        name: 'fix-issues',
        type: 'code_generation',
        description: 'Address any issues found during review',
        critical: false
      }
    ]
  };
}
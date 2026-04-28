/**
 * Workflow Automation - Manus 1.6 Max Pro Feature
 * Loop/conditional logic, self-correction, and task dependency management
 */

import { EventEmitter } from 'events';

// Workflow step types
export const StepType = {
  TASK: 'task',
  CONDITION: 'condition',
  LOOP: 'loop',
  PARALLEL: 'parallel',
  SEQUENCE: 'sequence',
  CALLBACK: 'callback',
  ERROR_HANDLER: 'error_handler'
};

// Workflow step execution states
export const StepState = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  SKIPPED: 'skipped'
};

// Condition operators
export const ConditionOperator = {
  EQUALS: 'equals',
  NOT_EQUALS: 'not_equals',
  GREATER_THAN: 'greater_than',
  LESS_THAN: 'less_than',
  CONTAINS: 'contains',
  NOT_CONTAINS: 'not_contains',
  REGEX: 'regex',
  AND: 'and',
  OR: 'or'
};

export class Condition {
  constructor(operator, left, right) {
    this.operator = operator;
    this.left = left;
    this.right = right;
  }

  evaluate(context = {}) {
    const leftVal = this.resolveValue(this.left, context);
    const rightVal = this.resolveValue(this.right, context);

    switch (this.operator) {
      case ConditionOperator.EQUALS:
        return leftVal === rightVal;
      case ConditionOperator.NOT_EQUALS:
        return leftVal !== rightVal;
      case ConditionOperator.GREATER_THAN:
        return leftVal > rightVal;
      case ConditionOperator.LESS_THAN:
        return leftVal < rightVal;
      case ConditionOperator.CONTAINS:
        return String(leftVal).includes(String(rightVal));
      case ConditionOperator.NOT_CONTAINS:
        return !String(leftVal).includes(String(rightVal));
      case ConditionOperator.REGEX:
        return new RegExp(rightVal).test(String(leftVal));
      case ConditionOperator.AND:
        return leftVal && rightVal;
      case ConditionOperator.OR:
        return leftVal || rightVal;
      default:
        return false;
    }
  }

  resolveValue(value, context) {
    if (typeof value === 'string' && value.startsWith('$')) {
      const key = value.substring(1);
      return context[key] !== undefined ? context[key] : value;
    }
    return value;
  }
}

export class WorkflowStep {
  constructor(id, config) {
    this.id = id;
    this.type = config.type || StepType.TASK;
    this.name = config.name || id;
    this.config = config.config || {};
    this.condition = config.condition ? new Condition(
      config.condition.operator,
      config.condition.left,
      config.condition.right
    ) : null;
    this.retryConfig = config.retry || { maxRetries: 0, delayMs: 1000 };
    this.timeout = config.timeout || 60000;
    this.state = StepState.PENDING;
    this.result = null;
    this.error = null;
    this.attempts = 0;
  }

  async execute(context, executor) {
    this.state = StepState.RUNNING;
    
    // Check condition first
    if (this.condition && !this.condition.evaluate(context)) {
      this.state = StepState.SKIPPED;
      return { skipped: true, reason: 'Condition not met' };
    }

    // Retry logic
    while (this.attempts <= this.retryConfig.maxRetries) {
      try {
        const result = await this.executeStep(context, executor);
        this.state = StepState.COMPLETED;
        this.result = result;
        return result;
      } catch (error) {
        this.attempts++;
        this.error = error;
        
        if (this.attempts <= this.retryConfig.maxRetries) {
          await this.sleep(this.retryConfig.delayMs * this.attempts);
        }
      }
    }

    this.state = StepState.FAILED;
    throw this.error;
  }

  async executeStep(context, executor) {
    switch (this.type) {
      case StepType.TASK:
        return await this.executeTask(context, executor);
      case StepType.CONDITION:
        return await this.executeCondition(context, executor);
      case StepType.LOOP:
        return await this.executeLoop(context, executor);
      case StepType.PARALLEL:
        return await this.executeParallel(context, executor);
      case StepType.SEQUENCE:
        return await this.executeSequence(context, executor);
      default:
        return { output: 'Step executed' };
    }
  }

  async executeTask(context, executor) {
    const { tool, params, outputKey } = this.config;
    
    if (executor && tool) {
      const result = await executor.executeTool(tool, this.resolveParams(params, context));
      if (outputKey) {
        context[outputKey] = result.output;
      }
      return result;
    }
    
    return { output: `Task ${this.id} executed`, context };
  }

  async executeCondition(context, executor) {
    const { steps } = this.config;
    const conditionMet = this.condition?.evaluate(context);
    
    if (conditionMet && steps.then) {
      return await executor.executeSteps(steps.then, context);
    } else if (!conditionMet && steps.else) {
      return await executor.executeSteps(steps.else, context);
    }
    
    return { conditionMet };
  }

  async executeLoop(context, executor) {
    const { maxIterations = 10, breakCondition } = this.config;
    const results = [];
    
    for (let i = 0; i < maxIterations; i++) {
      context.iteration = i;
      
      if (breakCondition) {
        const condition = new Condition(
          breakCondition.operator,
          breakCondition.left,
          breakCondition.right
        );
        if (condition.evaluate(context)) {
          break;
        }
      }

      const stepResults = await executor.executeSteps(this.config.steps || [], context);
      results.push(stepResults);
    }
    
    return { iterations: results.length, results };
  }

  async executeParallel(context, executor) {
    const steps = this.config.steps || [];
    const promises = steps.map(step => executor.executeStep(step, context));
    return Promise.all(promises);
  }

  async executeSequence(context, executor) {
    const steps = this.config.steps || [];
    return executor.executeSteps(steps, context);
  }

  resolveParams(params, context) {
    if (!params) return {};
    
    const resolved = {};
    for (const [key, value] of Object.entries(params)) {
      if (typeof value === 'string' && value.startsWith('$')) {
        resolved[key] = context[value.substring(1)];
      } else if (typeof value === 'object') {
        resolved[key] = this.resolveParams(value, context);
      } else {
        resolved[key] = value;
      }
    }
    return resolved;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  reset() {
    this.state = StepState.PENDING;
    this.result = null;
    this.error = null;
    this.attempts = 0;
  }
}

export class WorkflowDefinition {
  constructor(id, config) {
    this.id = id;
    this.name = config.name || id;
    this.description = config.description || '';
    this.version = config.version || '1.0';
    this.steps = config.steps || [];
    this.variables = config.variables || {};
    this.metadata = {
      createdAt: Date.now(),
      updatedAt: Date.now(),
      author: config.author || 'system'
    };
  }

  addStep(step) {
    this.steps.push(step);
    this.metadata.updatedAt = Date.now();
  }

  removeStep(stepId) {
    this.steps = this.steps.filter(s => s.id !== stepId);
    this.metadata.updatedAt = Date.now();
  }

  validate() {
    const errors = [];
    
    // Check for duplicate step IDs
    const ids = this.steps.map(s => s.id);
    const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i);
    if (duplicates.length > 0) {
      errors.push(`Duplicate step IDs: ${duplicates.join(', ')}`);
    }

    // Check for circular dependencies
    if (this.hasCircularDependencies()) {
      errors.push('Circular dependencies detected');
    }

    return { valid: errors.length === 0, errors };
  }

  hasCircularDependencies() {
    const graph = new Map();
    
    for (const step of this.steps) {
      if (step.config.next) {
        graph.set(step.id, Array.isArray(step.config.next) 
          ? step.config.next 
          : [step.config.next]
        );
      }
    }

    const visited = new Set();
    const stack = new Set();

    const dfs = (nodeId) => {
      if (stack.has(nodeId)) return true;
      if (visited.has(nodeId)) return false;
      
      stack.add(nodeId);
      visited.add(nodeId);

      const neighbors = graph.get(nodeId) || [];
      for (const neighbor of neighbors) {
        if (dfs(neighbor)) return true;
      }

      stack.delete(nodeId);
      return false;
    };

    for (const nodeId of graph.keys()) {
      if (dfs(nodeId)) return true;
    }

    return false;
  }

  export() {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      version: this.version,
      steps: this.steps,
      variables: this.variables,
      metadata: this.metadata
    };
  }
}

export class WorkflowEngine extends EventEmitter {
  constructor(config = {}) {
    super();
    this.workflows = new Map();
    this.activeInstances = new Map();
    this.history = [];
    this.maxHistory = config.maxHistory || 100;
  }

  registerWorkflow(workflow) {
    if (!(workflow instanceof WorkflowDefinition)) {
      workflow = new WorkflowDefinition(workflow.id, workflow);
    }
    
    const validation = workflow.validate();
    if (!validation.valid) {
      throw new Error(`Invalid workflow: ${validation.errors.join(', ')}`);
    }

    this.workflows.set(workflow.id, workflow);
    this.emit('workflow:registered', { id: workflow.id });
    return workflow;
  }

  createWorkflow(id, config) {
    const workflow = new WorkflowDefinition(id, config);
    return this.registerWorkflow(workflow);
  }

  async execute(workflowId, initialContext = {}, executor = null) {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    const instanceId = `instance-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const instance = {
      id: instanceId,
      workflowId,
      startedAt: Date.now(),
      context: { ...workflow.variables, ...initialContext },
      steps: workflow.steps.map(s => new WorkflowStep(s.id, s)),
      results: [],
      state: 'running'
    };

    this.activeInstances.set(instanceId, instance);
    this.emit('workflow:start', { instanceId, workflowId });

    try {
      for (const step of instance.steps) {
        const result = await step.execute(instance.context, executor);
        instance.results.push({
          stepId: step.id,
          state: step.state,
          result: step.result,
          error: step.error
        });

        if (step.state === StepState.FAILED) {
          // Find and execute error handler
          const errorHandler = workflow.steps.find(s => s.type === StepType.ERROR_HANDLER);
          if (errorHandler) {
            await new WorkflowStep(errorHandler.id, errorHandler).execute(
              instance.context,
              executor
            );
          }
          throw step.error;
        }

        // Handle next step routing
        if (step.config.next) {
          const nextSteps = Array.isArray(step.config.next) 
            ? step.config.next 
            : [step.config.next];
          
          for (const nextId of nextSteps) {
            const nextStep = instance.steps.find(s => s.id === nextId);
            if (nextStep && nextStep.state === StepState.PENDING) {
              const result = await nextStep.execute(instance.context, executor);
              instance.results.push({
                stepId: nextStep.id,
                state: nextStep.state,
                result: nextStep.result
              });
            }
          }
        }
      }

      instance.state = 'completed';
      instance.completedAt = Date.now();
      
      this.emit('workflow:complete', {
        instanceId,
        results: instance.results
      });

    } catch (error) {
      instance.state = 'failed';
      instance.error = error.message;
      instance.completedAt = Date.now();
      
      this.emit('workflow:failed', {
        instanceId,
        error: error.message
      });
    }

    this.history.push(instance);
    this.cleanHistory();
    
    return {
      instanceId,
      state: instance.state,
      context: instance.context,
      results: instance.results,
      error: instance.error
    };
  }

  async executeWithRetry(workflowId, context, options = {}) {
    const maxAttempts = options.maxAttempts || 3;
    const delayMs = options.delayMs || 1000;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await this.execute(workflowId, context);
      } catch (error) {
        if (attempt === maxAttempts) throw error;
        
        this.emit('workflow:retry', {
          workflowId,
          attempt,
          error: error.message
        });
        
        await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
      }
    }
  }

  // Self-correction mechanism
  async correctAndRetry(instanceId, corrections, executor) {
    const instance = this.activeInstances.get(instanceId);
    if (!instance) {
      throw new Error(`Instance not found: ${instanceId}`);
    }

    // Apply corrections to context
    for (const [key, value] of Object.entries(corrections)) {
      instance.context[key] = value;
    }

    // Find failed step and retry
    const failedStep = instance.steps.find(s => s.state === StepState.FAILED);
    if (failedStep) {
      failedStep.reset();
      const result = await this.execute(WorkflowDefinition, instance.context, executor);
      return result;
    }

    throw new Error('No failed step found to correct');
  }

  getInstance(instanceId) {
    return this.activeInstances.get(instanceId);
  }

  listInstances(filters = {}) {
    let instances = Array.from(this.activeInstances.values());
    
    if (filters.state) {
      instances = instances.filter(i => i.state === filters.state);
    }
    if (filters.workflowId) {
      instances = instances.filter(i => i.workflowId === filters.workflowId);
    }
    
    return instances;
  }

  cleanHistory() {
    while (this.history.length > this.maxHistory) {
      this.history.shift();
    }
  }

  getStats() {
    return {
      totalWorkflows: this.workflows.size,
      activeInstances: this.activeInstances.size,
      totalExecutions: this.history.length,
      completed: this.history.filter(i => i.state === 'completed').length,
      failed: this.history.filter(i => i.state === 'failed').length
    };
  }
}

// Factory function
export function createWorkflowEngine(config) {
  return new WorkflowEngine(config);
}
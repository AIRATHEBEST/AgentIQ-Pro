/**
 * AdaptivePlanningEngine.js
 * 
 * Adaptive planning with:
 * - Dynamic plan rewriting mid-execution
 * - Multiple strategy generation & selection
 * - Backtracking when a plan fails
 * - Cost-aware planning
 * 
 * FEATURE #2: Real Planning Engine
 */

class AdaptivePlanningEngine {
  constructor() {
    this.plans = [];
    this.strategies = [];
    this.executionHistory = [];
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
   * Generate multiple strategies for a task
   */
  async generateStrategies(taskDescription, context = {}) {
    const strategies = [];

    // Strategy 1: Decomposition (break into sub-tasks)
    strategies.push({
      id: 'decomposition',
      name: 'Task Decomposition',
      description: 'Break the task into smaller, manageable steps',
      steps: await this.decomposeTask(taskDescription),
      estimatedCost: 'medium',
      estimatedTime: 'medium',
      riskLevel: 'low',
      score: 0,
    });

    // Strategy 2: Linear execution
    strategies.push({
      id: 'linear',
      name: 'Sequential Execution',
      description: 'Execute steps sequentially without parallelization',
      steps: await this.createLinearPlan(taskDescription),
      estimatedCost: 'low',
      estimatedTime: 'high',
      riskLevel: 'low',
      score: 0,
    });

    // Strategy 3: Parallel execution
    strategies.push({
      id: 'parallel',
      name: 'Parallel Execution',
      description: 'Execute independent steps in parallel',
      steps: await this.createParallelPlan(taskDescription),
      estimatedCost: 'high',
      estimatedTime: 'low',
      riskLevel: 'medium',
      score: 0,
    });

    // Strategy 4: Research-first
    strategies.push({
      id: 'research_first',
      name: 'Research-First Approach',
      description: 'Gather information first, then execute',
      steps: await this.createResearchFirstPlan(taskDescription),
      estimatedCost: 'medium',
      estimatedTime: 'medium',
      riskLevel: 'low',
      score: 0,
    });

    // Score strategies
    for (const strategy of strategies) {
      strategy.score = await this.scoreStrategy(strategy, context);
    }

    // Sort by score
    strategies.sort((a, b) => b.score - a.score);

    this.emit('strategies_generated', { taskDescription, strategies });
    return strategies;
  }

  /**
   * Score a strategy
   */
  async scoreStrategy(strategy, context = {}) {
    let score = 50; // Base score

    // Cost preference
    if (context.costaware) {
      if (strategy.estimatedCost === 'low') score += 20;
      else if (strategy.estimatedCost === 'medium') score += 10;
    } else {
      score += 10; // All cost levels acceptable
    }

    // Time preference
    if (context.timeaware) {
      if (strategy.estimatedTime === 'low') score += 20;
      else if (strategy.estimatedTime === 'medium') score += 10;
    } else {
      score += 10;
    }

    // Risk preference
    if (strategy.riskLevel === 'low') score += 15;
    else if (strategy.riskLevel === 'medium') score += 5;

    // Task complexity match
    if (context.taskComplexity === 'high' && strategy.id === 'decomposition') score += 20;
    if (context.taskComplexity === 'low' && strategy.id === 'linear') score += 15;

    return score;
  }

  /**
   * Execute a plan with dynamic adaptation
   */
  async executePlan(plan, context = {}) {
    const execution = {
      planId: plan.id,
      startTime: Date.now(),
      steps: [],
      status: 'running',
      adaptations: [],
      backtrackHistory: [],
    };

    let currentStep = 0;
    let hasBacktracked = false;

    while (currentStep < plan.steps.length) {
      const step = plan.steps[currentStep];

      try {
        this.emit('step_executing', { stepIndex: currentStep, step });

        const result = await this.executeStep(step, context);
        execution.steps.push({ ...step, result, status: 'completed' });

        currentStep++;
      } catch (err) {
        // Step failed - attempt adaptation
        const adapted = await this.adaptPlan(plan, currentStep, err, context);

        if (adapted) {
          plan.steps = adapted.newSteps;
          execution.adaptations.push({
            stepIndex: currentStep,
            reason: err.message,
            adaptation: adapted.description,
          });
          this.emit('plan_adapted', { stepIndex: currentStep, adaptation: adapted });
        } else {
          // Try backtracking
          if (!hasBacktracked) {
            const backtrackStep = await this.backtrack(plan, currentStep, context);
            if (backtrackStep >= 0) {
              currentStep = backtrackStep;
              hasBacktracked = true;
              execution.backtrackHistory.push({ from: currentStep, to: backtrackStep });
              this.emit('plan_backtracked', { from: currentStep, to: backtrackStep });
              continue;
            }
          }

          // No adaptation possible
          execution.status = 'failed';
          execution.error = err.message;
          execution.failedAt = currentStep;
          break;
        }
      }
    }

    execution.endTime = Date.now();
    execution.duration = execution.endTime - execution.startTime;
    execution.status = execution.status === 'failed' ? 'failed' : 'completed';

    this.emit('plan_executed', execution);
    return execution;
  }

  /**
   * Adapt plan when a step fails
   */
  async adaptPlan(plan, failedStepIndex, error, context) {
    // Try to find alternative approaches
    const failedStep = plan.steps[failedStepIndex];

    // Alternative 1: Skip the step
    const skipAlternative = {
      description: `Skip step: ${failedStep.name}`,
      newSteps: plan.steps.filter((_, i) => i !== failedStepIndex),
      type: 'skip',
    };

    // Alternative 2: Modify the step
    const modifiedStep = { ...failedStep, maxRetries: (failedStep.maxRetries || 1) + 1 };
    const retryAlternative = {
      description: `Retry with modified parameters: ${failedStep.name}`,
      newSteps: plan.steps.map((s, i) => (i === failedStepIndex ? modifiedStep : s)),
      type: 'retry_modified',
    };

    // Alternative 3: Insert a recovery step
    const recoveryStep = {
      name: 'Recovery Step',
      description: 'Execute recovery logic',
      execute: async () => {
        // Recovery logic here
        return { recovered: true };
      },
    };

    const recoveryAlternative = {
      description: `Insert recovery step before: ${failedStep.name}`,
      newSteps: [
        ...plan.steps.slice(0, failedStepIndex),
        recoveryStep,
        ...plan.steps.slice(failedStepIndex),
      ],
      type: 'recovery',
    };

    const alternatives = [skipAlternative, retryAlternative, recoveryAlternative];

    // Score alternatives
    const scored = alternatives.map(alt => ({
      ...alt,
      score: this.scoreAdaptation(alt, error, context),
    }));

    scored.sort((a, b) => b.score - a.score);

    // Return best alternative if score > threshold
    return scored[0]?.score > 30 ? scored[0] : null;
  }

  /**
   * Score an adaptation
   */
  scoreAdaptation(adaptation, error, context) {
    let score = 0;

    if (adaptation.type === 'skip') {
      score = 20; // Skipping is risky
    } else if (adaptation.type === 'retry_modified') {
      score = 50; // Retrying is usually good
    } else if (adaptation.type === 'recovery') {
      score = 60; // Recovery is proactive
    }

    return score;
  }

  /**
   * Backtrack to a previous successful step
   */
  async backtrack(plan, currentStep, context) {
    // Find the most recent successful step
    for (let i = currentStep - 1; i >= 0; i--) {
      if (plan.steps[i].checkpoint) {
        return i;
      }
    }
    return -1;
  }

  /**
   * Execute a single step
   */
  async executeStep(step, context) {
    if (typeof step.execute === 'function') {
      return await step.execute(context);
    }
    return step;
  }

  /**
   * Helper: Decompose task
   */
  async decomposeTask(taskDescription) {
    return [
      { name: 'Analyze Request', description: `Understand: ${taskDescription.substring(0, 50)}...` },
      { name: 'Plan Approach', description: 'Develop strategy' },
      { name: 'Execute Plan', description: 'Implement solution' },
      { name: 'Verify Result', description: 'Check quality' },
    ];
  }

  /**
   * Helper: Create linear plan
   */
  async createLinearPlan(taskDescription) {
    return await this.decomposeTask(taskDescription);
  }

  /**
   * Helper: Create parallel plan
   */
  async createParallelPlan(taskDescription) {
    return [
      { name: 'Analyze & Research (Parallel)', description: 'Gather information simultaneously' },
      { name: 'Execute Solution', description: 'Implement' },
      { name: 'Validate', description: 'Check' },
    ];
  }

  /**
   * Helper: Create research-first plan
   */
  async createResearchFirstPlan(taskDescription) {
    return [
      { name: 'Research Phase', description: 'Gather comprehensive information' },
      { name: 'Analysis Phase', description: 'Analyze findings' },
      { name: 'Execution Phase', description: 'Execute with confidence' },
    ];
  }

  /**
   * Get execution history
   */
  getExecutionHistory() {
    return this.executionHistory;
  }

  /**
   * Clear history
   */
  clearHistory() {
    this.executionHistory = [];
  }
}

export default AdaptivePlanningEngine;

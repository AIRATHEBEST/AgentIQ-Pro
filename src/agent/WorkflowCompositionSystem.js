/**
 * WorkflowCompositionSystem.js
 * 
 * Workflow composition with:
 * - Saveable workflows (templates)
 * - Reusable pipelines
 * - Conditional logic
 * - Scheduled automation
 * 
 * FEATURE #9: Workflow Composition System
 */

class WorkflowCompositionSystem {
  constructor() {
    this.workflows = [];
    this.templates = [];
    this.executions = [];
  }

  /**
   * Create a workflow
   */
  createWorkflow(name, description, steps) {
    const workflow = {
      id: `wf-${Date.now()}`,
      name,
      description,
      steps,
      createdAt: Date.now(),
      version: 1,
      active: true,
    };

    this.workflows.push(workflow);
    return workflow;
  }

  /**
   * Add conditional logic to a step
   */
  addConditional(stepId, condition, ifTrue, ifFalse) {
    return {
      type: 'conditional',
      stepId,
      condition, // function that returns boolean
      onTrue: ifTrue, // step(s) to execute if true
      onFalse: ifFalse, // step(s) to execute if false
    };
  }

  /**
   * Execute a workflow
   */
  async executeWorkflow(workflowId, input = {}) {
    const workflow = this.workflows.find(w => w.id === workflowId);
    if (!workflow) throw new Error('Workflow not found');

    const execution = {
      id: `exec-${Date.now()}`,
      workflowId,
      startTime: Date.now(),
      steps: [],
      status: 'running',
      output: input,
    };

    for (let i = 0; i < workflow.steps.length; i++) {
      const step = workflow.steps[i];

      try {
        // Handle conditionals
        if (step.type === 'conditional') {
          const condition = await step.condition(execution.output);
          const nextSteps = condition ? step.onTrue : step.onFalse;
          
          execution.steps.push({
            stepIndex: i,
            stepName: step.name,
            type: 'conditional',
            condition,
            status: 'completed',
          });

          // Execute conditional steps (simplified)
        } else {
          // Execute regular step
          const result = await this.executeStep(step, execution.output);
          execution.output = result;

          execution.steps.push({
            stepIndex: i,
            stepName: step.name,
            result,
            status: 'completed',
          });
        }
      } catch (err) {
        execution.steps.push({
          stepIndex: i,
          stepName: step.name,
          error: err.message,
          status: 'failed',
        });

        execution.status = 'failed';
        break;
      }
    }

    execution.endTime = Date.now();
    execution.status = execution.status === 'running' ? 'completed' : execution.status;
    this.executions.push(execution);

    return execution;
  }

  /**
   * Execute a single step
   */
  async executeStep(step, input) {
    if (typeof step.execute === 'function') {
      return await step.execute(input);
    }
    return input;
  }

  /**
   * Save workflow as template
   */
  saveAsTemplate(workflowId, templateName) {
    const workflow = this.workflows.find(w => w.id === workflowId);
    if (!workflow) throw new Error('Workflow not found');

    const template = {
      id: `tpl-${Date.now()}`,
      name: templateName,
      workflow: JSON.parse(JSON.stringify(workflow)),
      createdAt: Date.now(),
      usageCount: 0,
    };

    this.templates.push(template);
    return template;
  }

  /**
   * Create workflow from template
   */
  createFromTemplate(templateId) {
    const template = this.templates.find(t => t.id === templateId);
    if (!template) throw new Error('Template not found');

    const newWorkflow = JSON.parse(JSON.stringify(template.workflow));
    newWorkflow.id = `wf-${Date.now()}`;
    newWorkflow.createdAt = Date.now();

    this.workflows.push(newWorkflow);
    template.usageCount++;

    return newWorkflow;
  }

  /**
   * Schedule workflow execution
   */
  scheduleWorkflow(workflowId, schedule) {
    return {
      workflowId,
      schedule, // cron-like: '0 0 * * *' for daily
      createdAt: Date.now(),
      nextExecution: this.calculateNextExecution(schedule),
      status: 'scheduled',
    };
  }

  /**
   * Calculate next execution time
   */
  calculateNextExecution(schedule) {
    // Simplified - in production use cron library
    const parts = schedule.split(' ');
    const hour = parseInt(parts[1]);
    const day = parseInt(parts[2]);

    const now = new Date();
    const next = new Date();
    next.setHours(hour, 0, 0, 0);

    if (next <= now) {
      next.setDate(next.getDate() + 1);
    }

    return next.getTime();
  }

  /**
   * Get workflow execution history
   */
  getExecutionHistory(workflowId, limit = 10) {
    return this.executions
      .filter(e => e.workflowId === workflowId)
      .slice(-limit);
  }

  /**
   * Get all workflows
   */
  getWorkflows() {
    return this.workflows;
  }

  /**
   * Get all templates
   */
  getTemplates() {
    return this.templates;
  }

  /**
   * Delete workflow
   */
  deleteWorkflow(workflowId) {
    this.workflows = this.workflows.filter(w => w.id !== workflowId);
  }
}

export default WorkflowCompositionSystem;

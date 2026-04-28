/**
 * DAG Workflow Builder - AgentIQ Pro
 * Build and execute workflows using Directed Acyclic Graphs
 */

const EventEmitter = require('events');

const NODE_TYPES = {
  TASK: 'task',
  CONDITION: 'condition',
  PARALLEL: 'parallel',
  MERGE: 'merge',
  LOOP: 'loop',
  SUBWORKFLOW: 'subworkflow',
  INPUT: 'input',
  OUTPUT: 'output'
};

const NODE_STATUS = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  SKIPPED: 'skipped'
};

const EXECUTION_MODES = {
  SEQUENTIAL: 'sequential',
  PARALLEL: 'parallel',
  HYBRID: 'hybrid'
};

class WorkflowNode {
  constructor(id, type, config = {}) {
    this.id = id;
    this.type = type;
    this.config = config;
    this.status = NODE_STATUS.PENDING;
    this.result = null;
    this.error = null;
    this.startTime = null;
    this.endTime = null;
    this.attempts = 0;
    this.maxAttempts = config.maxAttempts || 3;
    this.retryDelay = config.retryDelay || 1000;
    this.condition = config.condition || null;
    this.timeout = config.timeout || 300000;
    this.metadata = config.metadata || {};
    this.outputMappings = config.outputMappings || {};
  }

  getDuration() {
    if (this.startTime && this.endTime) {
      return this.endTime - this.startTime;
    }
    return null;
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      config: this.config,
      status: this.status,
      result: this.result,
      error: this.error,
      duration: this.getDuration(),
      attempts: this.attempts
    };
  }
}

class WorkflowEdge {
  constructor(from, to, condition = null, metadata = {}) {
    this.from = from;
    this.to = to;
    this.condition = condition;
    this.metadata = metadata;
    this.triggered = false;
  }

  canTraverse(context) {
    if (!this.condition) return true;
    try {
      return this.condition(context) === true;
    } catch {
      return false;
    }
  }
}

class WorkflowExecution {
  constructor(workflowId, mode = EXECUTION_MODES.SEQUENTIAL) {
    this.id = `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.workflowId = workflowId;
    this.mode = mode;
    this.status = NODE_STATUS.PENDING;
    this.context = {};
    this.checkpoints = [];
    this.nodeResults = new Map();
    this.startTime = null;
    this.endTime = null;
    this.executionLog = [];
  }

  getDuration() {
    if (this.startTime && this.endTime) {
      return this.endTime - this.startTime;
    }
    return null;
  }

  addCheckpoint() {
    const checkpoint = {
      timestamp: Date.now(),
      context: JSON.parse(JSON.stringify(this.context)),
      nodeResults: Array.from(this.nodeResults.entries()),
      status: this.status
    };
    this.checkpoints.push(checkpoint);
    return checkpoint;
  }

  restoreCheckpoint(checkpointIndex) {
    if (checkpointIndex >= 0 && checkpointIndex < this.checkpoints.length) {
      const checkpoint = this.checkpoints[checkpointIndex];
      this.context = checkpoint.context;
      this.nodeResults = new Map(checkpoint.nodeResults);
      return true;
    }
    return false;
  }

  toJSON() {
    return {
      id: this.id,
      workflowId: this.workflowId,
      mode: this.mode,
      status: this.status,
      duration: this.getDuration(),
      checkpoints: this.checkpoints.length,
      nodeResults: Array.from(this.nodeResults.entries())
    };
  }
}

class DAGValidator {
  constructor() {
    this.errors = [];
    this.warnings = [];
  }

  validate(workflow) {
    this.errors = [];
    this.warnings = [];

    this.validateNodes(workflow.nodes);
    this.validateEdges(workflow.edges);
    this.validateNoCycles(workflow);
    this.validateEntryExitPoints(workflow);

    return {
      valid: this.errors.length === 0,
      errors: this.errors,
      warnings: this.warnings
    };
  }

  validateNodes(nodes) {
    if (!nodes || nodes.length === 0) {
      this.errors.push('Workflow must have at least one node');
      return;
    }

    const nodeIds = new Set();
    nodes.forEach(node => {
      if (!node.id) {
        this.errors.push('Node missing required id property');
      } else if (nodeIds.has(node.id)) {
        this.errors.push(`Duplicate node id: ${node.id}`);
      } else {
        nodeIds.add(node.id);
      }

      if (!NODE_TYPES[node.type]) {
        this.errors.push(`Invalid node type: ${node.type}`);
      }
    });
  }

  validateEdges(edges) {
    if (!edges || edges.length === 0) {
      this.warnings.push('No edges defined - workflow may not execute correctly');
      return;
    }

    const nodeIds = new Set();
    
    edges.forEach(edge => {
      if (!edge.from || !edge.to) {
        this.errors.push('Edge missing from or to property');
      }
    });
  }

  validateNoCycles(workflow) {
    const adjacency = new Map();
    
    workflow.nodes.forEach(node => {
      adjacency.set(node.id, []);
    });

    workflow.edges.forEach(edge => {
      const neighbors = adjacency.get(edge.from) || [];
      neighbors.push(edge.to);
      adjacency.set(edge.from, neighbors);
    });

    const visited = new Set();
    const recursionStack = new Set();

    const dfs = (nodeId) => {
      visited.add(nodeId);
      recursionStack.add(nodeId);

      const neighbors = adjacency.get(nodeId) || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          if (dfs(neighbor)) return true;
        } else if (recursionStack.has(neighbor)) {
          this.errors.push(`Cycle detected involving node: ${neighbor}`);
          return true;
        }
      }

      recursionStack.delete(nodeId);
      return false;
    };

    for (const node of workflow.nodes) {
      if (!visited.has(node.id)) {
        dfs(node.id);
      }
    }
  }

  validateEntryExitPoints(workflow) {
    const hasEntry = workflow.nodes.some(n => n.type === NODE_TYPES.INPUT);
    const hasExit = workflow.nodes.some(n => n.type === NODE_TYPES.OUTPUT);

    if (!hasEntry) {
      this.warnings.push('No INPUT node found - workflow may not receive data correctly');
    }

    if (!hasExit) {
      this.warnings.push('No OUTPUT node found - workflow results may not be captured');
    }
  }
}

class ExecutionEngine extends EventEmitter {
  constructor(workflow, execution, context = {}) {
    super();
    this.workflow = workflow;
    this.execution = execution;
    this.execution.context = context;
    this.aborted = false;
    this.activeNodes = new Set();
    this.nodeTimeouts = new Map();
  }

  async execute() {
    this.execution.startTime = Date.now();
    this.execution.status = NODE_STATUS.RUNNING;
    this.emit('execution:start', this.execution);

    try {
      const sortedNodes = this.topologicalSort();
      
      if (this.workflow.config?.mode === EXECUTION_MODES.PARALLEL) {
        await this.executeParallel(sortedNodes);
      } else {
        await this.executeSequential(sortedNodes);
      }

      this.execution.status = NODE_STATUS.COMPLETED;
      this.execution.endTime = Date.now();
      this.emit('execution:complete', this.execution);
      
      return this.execution.context;
    } catch (error) {
      this.execution.status = NODE_STATUS.FAILED;
      this.execution.error = error.message;
      this.execution.endTime = Date.now();
      this.emit('execution:failed', { execution: this.execution, error });
      throw error;
    }
  }

  topologicalSort() {
    const nodes = new Map();
    const inDegree = new Map();
    const adjacency = new Map();

    this.workflow.nodes.forEach(node => {
      nodes.set(node.id, new WorkflowNode(node.id, node.type, node.config));
      inDegree.set(node.id, 0);
      adjacency.set(node.id, []);
    });

    this.workflow.edges.forEach(edge => {
      const neighbors = adjacency.get(edge.from) || [];
      neighbors.push(edge.to);
      adjacency.set(edge.from, neighbors);
      
      inDegree.set(edge.to, inDegree.get(edge.to) + 1);
    });

    const queue = [];
    for (const [nodeId, degree] of inDegree.entries()) {
      if (degree === 0) {
        queue.push(nodeId);
      }
    }

    const sorted = [];
    while (queue.length > 0) {
      const nodeId = queue.shift();
      sorted.push(nodes.get(nodeId));

      const neighbors = adjacency.get(nodeId) || [];
      for (const neighbor of neighbors) {
        inDegree.set(neighbor, inDegree.get(neighbor) - 1);
        if (inDegree.get(neighbor) === 0) {
          queue.push(neighbor);
        }
      }
    }

    return sorted;
  }

  async executeSequential(sortedNodes) {
    for (const node of sortedNodes) {
      if (this.aborted) break;
      
      try {
        await this.executeNode(node);
      } catch (error) {
        if (node.maxAttempts > 1 && node.attempts < node.maxAttempts) {
          await this.retryNode(node);
        } else {
          throw error;
        }
      }
    }
  }

  async executeParallel(sortedNodes) {
    const levels = this.groupByLevel(sortedNodes);
    
    for (const level of levels) {
      if (this.aborted) break;
      
      const promises = level.map(node => this.executeNode(node));
      await Promise.all(promises);
    }
  }

  groupByLevel(sortedNodes) {
    const levels = [];
    const nodeLevels = new Map();

    sortedNodes.forEach((node, index) => {
      const incomingEdges = this.workflow.edges.filter(e => e.to === node.id);
      if (incomingEdges.length === 0) {
        nodeLevels.set(node.id, 0);
      } else {
        let maxLevel = 0;
        incomingEdges.forEach(edge => {
          const edgeLevel = nodeLevels.get(edge.from) || 0;
          maxLevel = Math.max(maxLevel, edgeLevel);
        });
        nodeLevels.set(node.id, maxLevel + 1);
      }
    });

    sortedNodes.forEach(node => {
      const level = nodeLevels.get(node.id);
      if (!levels[level]) {
        levels[level] = [];
      }
      levels[level].push(node);
    });

    return levels.filter(l => l);
  }

  async executeNode(node) {
    this.emit('node:start', node);
    node.status = NODE_STATUS.RUNNING;
    node.startTime = Date.now();
    node.attempts++;

    try {
      let result;
      switch (node.type) {
        case NODE_TYPES.TASK:
          result = await this.executeTaskNode(node);
          break;
        case NODE_TYPES.CONDITION:
          result = await this.executeConditionNode(node);
          break;
        case NODE_TYPES.PARALLEL:
          result = await this.executeParallelNode(node);
          break;
        case NODE_TYPES.MERGE:
          result = await this.executeMergeNode(node);
          break;
        case NODE_TYPES.LOOP:
          result = await this.executeLoopNode(node);
          break;
        case NODE_TYPES.SUBWORKFLOW:
          result = await this.executeSubworkflowNode(node);
          break;
        case NODE_TYPES.INPUT:
          result = this.executeInputNode(node);
          break;
        case NODE_TYPES.OUTPUT:
          result = this.executeOutputNode(node);
          break;
        default:
          throw new Error(`Unknown node type: ${node.type}`);
      }

      node.status = NODE_STATUS.COMPLETED;
      node.result = result;
      node.endTime = Date.now();
      this.execution.nodeResults.set(node.id, result);
      this.emit('node:complete', { node, result });
      
      return result;
    } catch (error) {
      node.status = NODE_STATUS.FAILED;
      node.error = error.message;
      node.endTime = Date.now();
      this.emit('node:failed', { node, error });
      throw error;
    }
  }

  async executeTaskNode(node) {
    const handler = this.workflow.config?.taskHandlers?.[node.id];
    
    if (!handler) {
      return { executed: true, nodeId: node.id };
    }

    const timeoutPromise = new Promise((_, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Task ${node.id} timed out after ${node.timeout}ms`));
      }, node.timeout);
      this.nodeTimeouts.set(node.id, timeout);
    });

    const executePromise = Promise.resolve(handler(this.execution.context, node.config));
    
    try {
      return await Promise.race([executePromise, timeoutPromise]);
    } finally {
      const timeout = this.nodeTimeouts.get(node.id);
      if (timeout) {
        clearTimeout(timeout);
        this.nodeTimeouts.delete(node.id);
      }
    }
  }

  async executeConditionNode(node) {
    const conditionFn = node.condition || ((ctx) => ctx.condition === true);
    const result = await Promise.resolve(conditionFn(this.execution.context));
    
    const outgoingEdges = this.workflow.edges.filter(e => e.from === node.id);
    
    for (const edge of outgoingEdges) {
      edge.triggered = result;
    }
    
    return { conditionMet: result, path: result ? 'true' : 'false' };
  }

  async executeParallelNode(node) {
    const parallelNodes = this.workflow.edges
      .filter(e => e.from === node.id)
      .map(e => this.workflow.nodes.find(n => n.id === e.to));

    const promises = parallelNodes.map(n => {
      const workflowNode = new WorkflowNode(n.id, n.type, n.config);
      return this.executeNode(workflowNode);
    });

    return await Promise.all(promises);
  }

  async executeMergeNode(node) {
    const incomingEdges = this.workflow.edges.filter(e => e.to === node.id);
    const results = [];

    for (const edge of incomingEdges) {
      const result = this.execution.nodeResults.get(edge.from);
      if (result !== undefined) {
        results.push(result);
      }
    }

    const mergeStrategy = node.config?.mergeStrategy || 'all';
    
    switch (mergeStrategy) {
      case 'all':
        return results;
      case 'first':
        return results[0];
      case 'last':
        return results[results.length - 1];
      case 'combine':
        return Object.assign({}, ...results);
      default:
        return results;
    }
  }

  async executeLoopNode(node) {
    const maxIterations = node.config.maxIterations || 10;
    const loopCondition = node.config.loopCondition;
    let iterations = 0;
    const results = [];

    while (iterations < maxIterations) {
      if (this.aborted) break;

      const loopNodes = this.workflow.edges
        .filter(e => e.from === node.id)
        .map(e => this.workflow.nodes.find(n => n.id === e.to));

      try {
        const iterationResults = [];
        for (const n of loopNodes) {
          const workflowNode = new WorkflowNode(n.id, n.type, n.config);
          const result = await this.executeNode(workflowNode);
          iterationResults.push(result);
        }
        
        results.push(iterationResults);

        if (loopCondition && !loopCondition(this.execution.context, iterations)) {
          break;
        }

        iterations++;
      } catch (error) {
        if (node.config.continueOnError) {
          results.push({ error: error.message });
          iterations++;
        } else {
          throw error;
        }
      }
    }

    return { iterations: iterations + 1, results };
  }

  async executeSubworkflowNode(node) {
    const subworkflow = node.config.subworkflow;
    
    if (!subworkflow) {
      throw new Error('Subworkflow not defined');
    }

    const builder = new DAGWorkflowBuilder();
    const subBuilder = builder.createFromConfig(subworkflow);
    
    return await subBuilder.execute(this.execution.context);
  }

  executeInputNode(node) {
    const inputData = node.config.data || this.execution.context.input;
    return inputData;
  }

  executeOutputNode(node) {
    const outputMapping = node.config.mapping || ((ctx) => ctx);
    return outputMapping(this.execution.context);
  }

  async retryNode(node) {
    await new Promise(resolve => setTimeout(resolve, node.retryDelay));
    return this.executeNode(node);
  }

  abort() {
    this.aborted = true;
    this.nodeTimeouts.forEach(timeout => clearTimeout(timeout));
    this.nodeTimeouts.clear();
    this.emit('execution:aborted', this.execution);
  }
}

class DAGWorkflowBuilder extends EventEmitter {
  constructor() {
    super();
    this.workflow = {
      id: null,
      name: null,
      description: null,
      version: '1.0.0',
      nodes: [],
      edges: [],
      config: {
        mode: EXECUTION_MODES.SEQUENTIAL,
        checkpointEnabled: true,
        checkpointInterval: 5000
      }
    };
    this.validator = new DAGValidator();
    this.executionHistory = [];
  }

  setId(id) {
    this.workflow.id = id;
    return this;
  }

  setName(name) {
    this.workflow.name = name;
    return this;
  }

  setDescription(description) {
    this.workflow.description = description;
    return this;
  }

  setMode(mode) {
    this.workflow.config.mode = mode;
    return this;
  }

  addNode(id, type, config = {}) {
    const existingIndex = this.workflow.nodes.findIndex(n => n.id === id);
    
    const node = {
      id,
      type,
      config: {
        ...config,
        metadata: {
          createdAt: Date.now(),
          ...config.metadata
        }
      }
    };

    if (existingIndex >= 0) {
      this.workflow.nodes[existingIndex] = node;
    } else {
      this.workflow.nodes.push(node);
    }

    this.emit('node:added', node);
    return this;
  }

  addTaskNode(id, taskHandler, config = {}) {
    return this.addNode(id, NODE_TYPES.TASK, {
      ...config,
      taskHandler
    });
  }

  addConditionNode(id, condition, config = {}) {
    return this.addNode(id, NODE_TYPES.CONDITION, {
      ...config,
      condition
    });
  }

  addParallelNode(id, config = {}) {
    return this.addNode(id, NODE_TYPES.PARALLEL, config);
  }

  addMergeNode(id, mergeStrategy = 'all', config = {}) {
    return this.addNode(id, NODE_TYPES.MERGE, {
      ...config,
      mergeStrategy
    });
  }

  addLoopNode(id, loopCondition, maxIterations = 10, config = {}) {
    return this.addNode(id, NODE_TYPES.LOOP, {
      ...config,
      loopCondition,
      maxIterations
    });
  }

  addSubworkflowNode(id, subworkflow, config = {}) {
    return this.addNode(id, NODE_TYPES.SUBWORKFLOW, {
      ...config,
      subworkflow
    });
  }

  addInputNode(id, data = null, config = {}) {
    return this.addNode(id, NODE_TYPES.INPUT, {
      ...config,
      data
    });
  }

  addOutputNode(id, mapping = null, config = {}) {
    return this.addNode(id, NODE_TYPES.OUTPUT, {
      ...config,
      mapping
    });
  }

  addEdge(from, to, condition = null, metadata = {}) {
    const edge = new WorkflowEdge(from, to, condition, metadata);
    this.workflow.edges.push(edge);
    
    this.emit('edge:added', edge);
    return this;
  }

  addConditionalEdge(from, to, condition, metadata = {}) {
    return this.addEdge(from, to, condition, {
      ...metadata,
      conditional: true
    });
  }

  removeNode(nodeId) {
    const index = this.workflow.nodes.findIndex(n => n.id === nodeId);
    if (index >= 0) {
      this.workflow.nodes.splice(index, 1);
      this.workflow.edges = this.workflow.edges.filter(
        e => e.from !== nodeId && e.to !== nodeId
      );
      this.emit('node:removed', nodeId);
    }
    return this;
  }

  removeEdge(from, to) {
    this.workflow.edges = this.workflow.edges.filter(
      e => !(e.from === from && e.to === to)
    );
    this.emit('edge:removed', { from, to });
    return this;
  }

  updateNode(nodeId, updates) {
    const node = this.workflow.nodes.find(n => n.id === nodeId);
    if (node) {
      node.config = { ...node.config, ...updates };
      this.emit('node:updated', node);
    }
    return this;
  }

  getNode(nodeId) {
    return this.workflow.nodes.find(n => n.id === nodeId);
  }

  getOutgoingEdges(nodeId) {
    return this.workflow.edges.filter(e => e.from === nodeId);
  }

  getIncomingEdges(nodeId) {
    return this.workflow.edges.filter(e => e.to === nodeId);
  }

  getDependencies(nodeId) {
    const dependencies = [];
    const visited = new Set();

    const dfs = (currentId) => {
      if (visited.has(currentId)) return;
      visited.add(currentId);

      const incoming = this.getIncomingEdges(currentId);
      incoming.forEach(edge => {
        dependencies.push(edge.from);
        dfs(edge.from);
      });
    };

    dfs(nodeId);
    return dependencies;
  }

  getDependents(nodeId) {
    const dependents = [];
    const visited = new Set();

    const dfs = (currentId) => {
      if (visited.has(currentId)) return;
      visited.add(currentId);

      const outgoing = this.getOutgoingEdges(currentId);
      outgoing.forEach(edge => {
        dependents.push(edge.to);
        dfs(edge.to);
      });
    };

    dfs(nodeId);
    return dependents;
  }

  validate() {
    return this.validator.validate(this.workflow);
  }

  async execute(context = {}, options = {}) {
    const validation = this.validate();
    
    if (!validation.valid) {
      const error = new Error(`Workflow validation failed: ${validation.errors.join(', ')}`);
      error.validationErrors = validation.errors;
      this.emit('workflow:validationFailed', validation);
      throw error;
    }

    this.emit('workflow:start', this.workflow);

    const execution = new WorkflowExecution(
      this.workflow.id,
      this.workflow.config.mode
    );
    
    const engine = new ExecutionEngine(this.workflow, execution, context);

    engine.on('node:start', (node) => this.emit('node:start', node));
    engine.on('node:complete', (data) => this.emit('node:complete', data));
    engine.on('node:failed', (data) => this.emit('node:failed', data));
    engine.on('execution:checkpoint', (checkpoint) => {
      this.emit('execution:checkpoint', checkpoint);
    });

    try {
      const result = await engine.execute();
      
      this.executionHistory.push(execution);
      this.emit('workflow:complete', { execution, result });
      
      return result;
    } catch (error) {
      execution.error = error.message;
      this.executionHistory.push(execution);
      this.emit('workflow:failed', { execution, error });
      throw error;
    }
  }

  abortExecution() {
    this.emit('workflow:aborted');
  }

  visualize() {
    const nodes = this.workflow.nodes.map(n => ({
      id: n.id,
      label: `${n.id}\n(${n.type})`,
      type: n.type
    }));

    const edges = this.workflow.edges.map(e => ({
      from: e.from,
      to: e.to,
      label: e.condition ? 'conditional' : '',
      metadata: e.metadata
    }));

    return { nodes, edges };
  }

  export() {
    return JSON.stringify(this.workflow, null, 2);
  }

  import(jsonString) {
    try {
      const imported = JSON.parse(jsonString);
      this.workflow = {
        ...this.workflow,
        ...imported
      };
      this.emit('workflow:imported', this.workflow);
      return this;
    } catch (error) {
      throw new Error(`Failed to import workflow: ${error.message}`);
    }
  }

  createFromConfig(config) {
    const builder = new DAGWorkflowBuilder();
    
    if (config.id) builder.setId(config.id);
    if (config.name) builder.setName(config.name);
    if (config.description) builder.setDescription(config.description);
    if (config.config?.mode) builder.setMode(config.config.mode);

    config.nodes?.forEach(node => {
      builder.addNode(node.id, node.type, node.config);
    });

    config.edges?.forEach(edge => {
      builder.addEdge(edge.from, edge.to, edge.condition, edge.metadata);
    });

    return builder;
  }

  clone() {
    return this.createFromConfig(JSON.parse(JSON.stringify(this.workflow)));
  }

  getExecutionHistory() {
    return this.executionHistory.map(e => e.toJSON());
  }

  getStats() {
    const nodes = this.workflow.nodes;
    const edges = this.workflow.edges;

    const typeCounts = {};
    nodes.forEach(n => {
      typeCounts[n.type] = (typeCounts[n.type] || 0) + 1;
    });

    return {
      totalNodes: nodes.length,
      totalEdges: edges.length,
      nodeTypes: typeCounts,
      mode: this.workflow.config.mode,
      lastExecution: this.executionHistory.length > 0 
        ? this.executionHistory[this.executionHistory.length - 1].toJSON()
        : null
    };
  }
}

module.exports = {
  DAGWorkflowBuilder,
  WorkflowNode,
  WorkflowEdge,
  WorkflowExecution,
  DAGValidator,
  ExecutionEngine,
  NODE_TYPES,
  NODE_STATUS,
  EXECUTION_MODES
};
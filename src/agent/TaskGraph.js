/**
 * TaskGraph - DAG-based task execution with parallelization
 * Implements directed acyclic graph for complex task dependencies
 */

import { multiAgentSystem } from './MultiAgentSystem';

class TaskNode {
  constructor(id, config = {}) {
    this.id = id;
    this.name = config.name || id;
    this.type = config.type || 'execution';
    this.action = config.action || (() => Promise.resolve({ success: true }));
    this.dependencies = config.dependencies || [];
    this.inputs = config.inputs || {};
    this.outputs = {};
    this.status = 'pending'; // pending, running, completed, failed
    this.result = null;
    this.error = null;
    this.startTime = null;
    this.endTime = null;
    this.retryCount = 0;
    this.maxRetries = config.maxRetries || 2;
  }

  /**
   * Get execution duration if completed
   */
  getDuration() {
    if (this.startTime && this.endTime) {
      return this.endTime - this.startTime;
    }
    return null;
  }

  /**
   * Mark node as started
   */
  start() {
    this.status = 'running';
    this.startTime = Date.now();
  }

  /**
   * Mark node as completed with result
   */
  complete(result) {
    this.status = 'completed';
    this.endTime = Date.now();
    this.result = result;
    this.outputs = result.outputs || result;
  }

  /**
   * Mark node as failed with error
   */
  fail(error) {
    this.status = 'failed';
    this.endTime = Date.now();
    this.error = error;
  }

  /**
   * Reset node for retry
   */
  reset() {
    this.status = 'pending';
    this.result = null;
    this.error = null;
    this.startTime = null;
    this.endTime = null;
    this.retryCount++;
  }
}

class TaskGraph {
  constructor(options = {}) {
    this.nodes = new Map();
    this.edges = []; // [fromId, toId]
    this.executionOrder = [];
    this.results = new Map();
    this.options = {
      maxConcurrency: options.maxConcurrency || 4,
      continueOnError: options.continueOnError !== false,
      parallelLevels: options.parallelLevels || 3,
      verbose: options.verbose || false
    };
    this.executionHistory = [];
  }

  /**
   * Add a node to the graph
   */
  addNode(id, config) {
    if (this.nodes.has(id)) {
      throw new Error(`Node "${id}" already exists`);
    }

    const node = new TaskNode(id, config);
    this.nodes.set(id, node);

    // Add dependencies as edges
    if (config.dependencies) {
      config.dependencies.forEach(depId => {
        this.addEdge(depId, id);
      });
    }

    if (this.options.verbose) {
      console.log(`[TaskGraph] Added node: ${id}`, config);
    }

    return node;
  }

  /**
   * Add an edge between nodes
   */
  addEdge(fromId, toId) {
    if (!this.nodes.has(fromId)) {
      throw new Error(`Source node "${fromId}" does not exist`);
    }
    if (!this.nodes.has(toId)) {
      throw new Error(`Target node "${toId}" does not exist`);
    }

    this.edges.push([fromId, toId]);

    // Update target node dependencies
    const toNode = this.nodes.get(toId);
    if (!toNode.dependencies.includes(fromId)) {
      toNode.dependencies.push(fromId);
    }

    if (this.options.verbose) {
      console.log(`[TaskGraph] Added edge: ${fromId} → ${toId}`);
    }
  }

  /**
   * Remove a node and its edges
   */
  removeNode(id) {
    if (!this.nodes.has(id)) return false;

    // Remove all edges involving this node
    this.edges = this.edges.filter(
      edge => edge[0] !== id && edge[1] !== id
    );

    // Remove from other nodes' dependencies
    this.nodes.forEach(node => {
      node.dependencies = node.dependencies.filter(dep => dep !== id);
    });

    this.nodes.delete(id);
    return true;
  }

  /**
   * Get nodes that have no dependencies (can run immediately)
   */
  getRootNodes() {
    return Array.from(this.nodes.values()).filter(
      node => node.dependencies.length === 0
    );
  }

  /**
   * Get nodes whose dependencies are all satisfied
   */
  getReadyNodes(completedIds) {
    return Array.from(this.nodes.values()).filter(node => {
      if (node.status !== 'pending') return false;
      return node.dependencies.every(depId => completedIds.includes(depId));
    });
  }

  /**
   * Topological sort to determine execution order
   */
  topologicalSort() {
    const visited = new Set();
    const result = [];
    const tempMark = new Set();

    const visit = (nodeId) => {
      if (tempMark.has(nodeId)) {
        throw new Error('Graph contains a cycle');
      }
      if (visited.has(nodeId)) return;

      tempMark.add(nodeId);

      // Visit all nodes that depend on this one
      this.edges.forEach(([from, to]) => {
        if (from === nodeId) {
          visit(to);
        }
      });

      tempMark.delete(nodeId);
      visited.add(nodeId);
      result.unshift(nodeId);
    };

    this.nodes.forEach((_, id) => {
      if (!visited.has(id)) {
        visit(id);
      }
    });

    return result;
  }

  /**
   * Group nodes by execution level for parallelization
   */
  getExecutionLevels() {
    const levels = [];
    const completedIds = new Set();

    while (completedIds.size < this.nodes.size) {
      const readyNodes = this.getReadyNodes(Array.from(completedIds));
      
      if (readyNodes.length === 0 && completedIds.size < this.nodes.size) {
        throw new Error('Graph contains unresolvable dependencies');
      }

      if (readyNodes.length > 0) {
        levels.push(readyNodes.map(n => n.id));
        readyNodes.forEach(n => completedIds.add(n.id));
      }
    }

    return levels;
  }

  /**
   * Execute a single node
   */
  async executeNode(nodeId) {
    const node = this.nodes.get(nodeId);

    if (this.options.verbose) {
      console.log(`[TaskGraph] Executing node: ${nodeId}`);
    }

    node.start();

    try {
      // Gather inputs from dependencies
      const inputs = {};
      node.dependencies.forEach(depId => {
        const depNode = this.nodes.get(depId);
        inputs[depId] = depNode.outputs || depNode.result;
      });

      // Merge with node's own inputs
      const mergedInputs = { ...node.inputs, ...inputs };

      // Execute the node action with merged inputs
      const result = await node.action(mergedInputs, {
        nodeId,
        graph: this,
        context: this.getContext()
      });

      node.complete(result);
      this.results.set(nodeId, result);

      if (this.options.verbose) {
        console.log(`[TaskGraph] Node completed: ${nodeId} (${node.getDuration()}ms)`);
      }

      return { success: true, result };

    } catch (error) {
      node.fail(error);

      if (this.options.verbose) {
        console.error(`[TaskGraph] Node failed: ${nodeId}`, error);
      }

      return { success: false, error };
    }
  }

  /**
   * Execute all nodes in parallel levels
   */
  async execute(options = {}) {
    const maxConcurrency = options.maxConcurrency || this.options.maxConcurrency;
    const continueOnError = options.continueOnError ?? this.options.continueOnError;
    
    const executionStart = Date.now();
    const executionResults = [];
    const completedNodes = new Map();

    if (this.options.verbose) {
      console.log(`[TaskGraph] Starting execution with maxConcurrency=${maxConcurrency}`);
    }

    // Reset all nodes
    this.nodes.forEach(node => node.reset());

    try {
      // Get execution levels for parallelization
      const levels = this.getExecutionLevels();

      for (let levelIndex = 0; levelIndex < levels.length; levelIndex++) {
        const levelNodes = levels[levelIndex];

        if (this.options.verbose) {
          console.log(`[TaskGraph] Level ${levelIndex + 1}/${levels.length}: ${levelNodes.length} nodes`);
        }

        // Execute nodes in this level with controlled concurrency
        for (let i = 0; i < levelNodes.length; i += maxConcurrency) {
          const batch = levelNodes.slice(i, i + maxConcurrency);

          const batchPromises = batch.map(nodeId => this.executeNode(nodeId));
          const batchResults = await Promise.all(batchPromises);

          // Process batch results
          batchResults.forEach((result, idx) => {
            const nodeId = batch[idx];
            const node = this.nodes.get(nodeId);

            executionResults.push({
              nodeId,
              ...result,
              duration: node.getDuration(),
              retryCount: node.retryCount
            });

            completedNodes.set(nodeId, result);
          });

          // Check for failures if not continuing on error
          if (!continueOnError) {
            const failedNode = executionResults.find(r => !r.success);
            if (failedNode) {
              throw new Error(`Node "${failedNode.nodeId}" failed: ${failedNode.error?.message}`);
            }
          }
        }
      }

      const executionDuration = Date.now() - executionStart;

      const summary = this.getExecutionSummary(executionResults, executionDuration);

      // Store in history
      this.executionHistory.push({
        timestamp: Date.now(),
        duration: executionDuration,
        ...summary
      });

      return {
        success: summary.failedCount === 0,
        results: completedNodes,
        summary,
        executionDuration
      };

    } catch (error) {
      return {
        success: false,
        error: error.message,
        partialResults: completedNodes,
        executionDuration: Date.now() - executionStart
      };
    }
  }

  /**
   * Execute a specific node and its dependents (incremental execution)
   */
  async executeIncremental(nodeId) {
    if (!this.nodes.has(nodeId)) {
      throw new Error(`Node "${nodeId}" not found`);
    }

    // Find all nodes that depend on this one (transitively)
    const affectedNodes = this.findAffectedNodes(nodeId);

    if (this.options.verbose) {
      console.log(`[TaskGraph] Incremental execution of ${affectedNodes.length} nodes`);
    }

    // Reset affected nodes
    affectedNodes.forEach(id => {
      const node = this.nodes.get(id);
      node.reset();
    });

    // Get levels starting from the affected nodes
    const completedIds = new Set();

    // Add nodes before the first affected node as already completed
    const sortedOrder = this.topologicalSort();
    const affectedSet = new Set(affectedNodes);
    const startIndex = sortedOrder.findIndex(id => affectedSet.has(id));

    if (startIndex > 0) {
      sortedOrder.slice(0, startIndex).forEach(id => {
        const node = this.nodes.get(id);
        if (node.status === 'completed') {
          completedIds.add(id);
        }
      });
    }

    // Execute affected nodes
    const affectedSorted = sortedOrder.filter(id => affectedSet.has(id));
    const levels = this.groupIntoLevels(affectedSorted);

    const results = [];
    for (const level of levels) {
      const levelResults = await Promise.all(
        level.map(nodeId => this.executeNode(nodeId))
      );
      results.push(...levelResults);
      level.forEach(id => completedIds.add(id));
    }

    return {
      success: results.every(r => r.success),
      affectedNodes: affectedNodes.length,
      results
    };
  }

  /**
   * Find all nodes that depend on a given node (transitively)
   */
  findAffectedNodes(nodeId) {
    const affected = new Set([nodeId]);
    const queue = [nodeId];

    while (queue.length > 0) {
      const current = queue.shift();

      // Find all nodes that have current as a dependency
      this.nodes.forEach((node, id) => {
        if (node.dependencies.includes(current) && !affected.has(id)) {
          affected.add(id);
          queue.push(id);
        }
      });
    }

    return Array.from(affected);
  }

  /**
   * Group nodes into execution levels
   */
  groupIntoLevels(nodeIds) {
    const levels = [];
    const completed = new Set();

    const allNodes = new Set(nodeIds);

    while (allNodes.size > 0) {
      const level = [];

      allNodes.forEach(nodeId => {
        const node = this.nodes.get(nodeId);
        if (node.dependencies.every(dep => completed.has(dep))) {
          level.push(nodeId);
        }
      });

      if (level.length === 0) break;

      level.forEach(id => allNodes.delete(id));
      level.forEach(id => completed.add(id));
      levels.push(level);
    }

    return levels;
  }

  /**
   * Get execution context
   */
  getContext() {
    const context = {};
    this.nodes.forEach((node, id) => {
      if (node.status === 'completed') {
        context[id] = node.outputs || node.result;
      }
    });
    return context;
  }

  /**
   * Get execution summary
   */
  getExecutionSummary(results, duration) {
    const totalCount = this.nodes.size;
    const completedCount = results.filter(r => r.success).length;
    const failedCount = results.filter(r => !r.success).length;

    const avgDuration = results.length > 0
      ? results.reduce((sum, r) => sum + (r.duration || 0), 0) / results.length
      : 0;

    return {
      totalNodes: totalCount,
      completedCount,
      failedCount,
      successRate: totalCount > 0 ? completedCount / totalCount : 0,
      avgNodeDuration: Math.round(avgDuration),
      totalDuration: duration,
      results: results.map(r => ({
        nodeId: r.nodeId,
        success: r.success,
        duration: r.duration,
        retryCount: r.retryCount,
        error: r.error?.message
      }))
    };
  }

  /**
   * Get current graph status
   */
  getStatus() {
    const nodeStatuses = Array.from(this.nodes.values()).map(node => ({
      id: node.id,
      name: node.name,
      status: node.status,
      dependencies: node.dependencies,
      duration: node.getDuration(),
      retryCount: node.retryCount
    }));

    return {
      totalNodes: this.nodes.size,
      pending: nodeStatuses.filter(n => n.status === 'pending').length,
      running: nodeStatuses.filter(n => n.status === 'running').length,
      completed: nodeStatuses.filter(n => n.status === 'completed').length,
      failed: nodeStatuses.filter(n => n.status === 'failed').length,
      nodes: nodeStatuses,
      levels: this.getExecutionLevels().length,
      executionHistory: this.executionHistory.slice(-10)
    };
  }

  /**
   * Visualize graph as adjacency list
   */
  toAdjacencyList() {
    const adj = {};

    this.nodes.forEach((_, id) => {
      adj[id] = [];
    });

    this.edges.forEach(([from, to]) => {
      if (adj[from]) {
        adj[from].push(to);
      }
    });

    return adj;
  }

  /**
   * Clear all results and reset nodes
   */
  reset() {
    this.nodes.forEach(node => node.reset());
    this.results.clear();
  }

  /**
   * Export graph as JSON
   */
  toJSON() {
    return {
      nodes: Array.from(this.nodes.values()).map(node => ({
        id: node.id,
        name: node.name,
        type: node.type,
        dependencies: node.dependencies,
        inputs: node.inputs
      })),
      edges: this.edges,
      options: this.options
    };
  }

  /**
   * Create graph from JSON
   */
  static fromJSON(json) {
    const graph = new TaskGraph(json.options || {});

    json.nodes.forEach(node => {
      graph.addNode(node.id, node);
    });

    json.edges.forEach(([from, to]) => {
      graph.addEdge(from, to);
    });

    return graph;
  }
}

export default TaskGraph;
export const taskGraph = new TaskGraph();

// Factory for common task patterns
export function createSequentialPipeline(tasks) {
  const graph = new TaskGraph();

  tasks.forEach((task, index) => {
    const id = task.id || `task-${index}`;
    const dependencies = index > 0 ? [tasks[index - 1].id || `task-${index - 1}`] : [];
    
    graph.addNode(id, {
      name: task.name,
      type: task.type,
      action: task.action,
      dependencies,
      inputs: task.inputs
    });
  });

  return graph;
}

export function createParallelBranches(branchTasks, mergerAction) {
  const graph = new TaskGraph();

  // Add branch tasks in parallel
  branchTasks.forEach((task, index) => {
    const id = task.id || `branch-${index}`;
    graph.addNode(id, {
      name: task.name,
      type: task.type,
      action: task.action,
      inputs: task.inputs
    });
  });

  // Add merger node
  const branchIds = branchTasks.map((t, i) => t.id || `branch-${i}`);
  graph.addNode('merger', {
    name: 'Merge Results',
    type: 'execution',
    action: mergerAction,
    dependencies: branchIds
  });

  return graph;
}
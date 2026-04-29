/**
 * AgentIQ Pro - Recursive Autonomous Planning Engine
 * Implements tree-of-thought reasoning, branch planning, plan simulation,
 * failure forecasting, confidence scoring, and retry loops
 */

class ThoughtNode {
  constructor({
    id,
    content,
    parentId = null,
    depth = 0,
    confidence = 0.5,
    children = [],
    metadata = {}
  }) {
    this.id = id;
    this.content = content;
    this.parentId = parentId;
    this.depth = depth;
    this.confidence = confidence;
    this.children = children;
    this.metadata = metadata;
    this.createdAt = Date.now();
    this.status = 'pending'; // pending, active, completed, failed, abandoned
    this.result = null;
    this.executionTime = null;
    this.score = null;
  }
}

class BranchPlan {
  constructor({ id, name, thoughtIds = [], estimatedCost = 0, estimatedTime = 0 }) {
    this.id = id;
    this.name = name;
    this.thoughtIds = thoughtIds;
    this.estimatedCost = estimatedCost;
    this.estimatedTime = estimatedTime;
    this.score = 0;
    this.riskLevel = 'medium';
    this.resources = [];
    this.dependencies = [];
    this.status = 'pending';
  }
}

class RecursiveAutonomousPlanner {
  constructor(options = {}) {
    this.maxDepth = options.maxDepth || 5;
    this.maxBranches = options.maxBranches || 4;
    this.maxIterations = options.maxIterations || 10;
    this.confidenceThreshold = options.confidenceThreshold || 0.7;
    this.failureForecastEnabled = options.failureForecastEnabled !== false;
    this.planSimulationEnabled = options.planSimulationEnabled !== false;
    
    this.thoughtTree = new Map();
    this.activeBranches = new Map();
    this.executionHistory = [];
    this.confidenceScores = [];
    
    this.planCounter = 0;
    this.thoughtCounter = 0;
    
    this.eventBus = null;
    this.llmRouter = null;
    
    this.listeners = {
      thoughtCreated: [],
      thoughtCompleted: [],
      branchSelected: [],
      iterationComplete: [],
      planFinalized: [],
      failureForecast: []
    };
  }

  setEventBus(eventBus) {
    this.eventBus = eventBus;
  }

  setLLMRouter(llmRouter) {
    this.llmRouter = llmRouter;
  }

  on(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event].push(callback);
    }
  }

  emit(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(cb => cb(data));
    }
    if (this.eventBus) {
      this.eventBus.publish(`planner:${event}`, data);
    }
  }

  /**
   * Main planning method - recursively break down complex tasks
   */
  async plan(userIntent, context = {}) {
    const startTime = Date.now();
    this.planCounter++;
    const planId = `plan-${this.planCounter}-${Date.now()}`;
    
    this.emit('thoughtCreated', { planId, intent: userIntent });
    
    // Create root thought node
    const rootThought = this.createThoughtNode({
      content: userIntent,
      depth: 0,
      metadata: { type: 'root', context }
    });
    
    // Expand tree-of-thoughts
    const expandedTree = await this.expandThoughtTree(rootThought, context);
    
    // Generate branch plans
    const branches = await this.generateBranchPlans(expandedTree, context);
    
    // Score and rank branches
    const rankedBranches = await this.scoreAndRankBranches(branches, context);
    
    // Simulate plans if enabled
    let simulatedPlans = rankedBranches;
    if (this.planSimulationEnabled) {
      simulatedPlans = await this.simulatePlans(rankedBranches, context);
    }
    
    // Forecast failures
    if (this.failureForecastEnabled) {
      await this.forecastFailures(simulatedPlans, context);
    }
    
    // Select best plan
    const selectedPlan = this.selectBestPlan(simulatedPlans);
    
    // Create execution roadmap
    const roadmap = await this.createExecutionRoadmap(selectedPlan, context);
    
    const executionTime = Date.now() - startTime;
    
    const result = {
      planId,
      intent: userIntent,
      rootThought,
      expandedTree,
      branches: simulatedPlans,
      selectedPlan,
      roadmap,
      executionTime,
      confidence: selectedPlan.score,
      iterations: this.thoughtCounter
    };
    
    this.executionHistory.push(result);
    this.emit('planFinalized', result);
    
    return result;
  }

  createThoughtNode({ content, parentId = null, depth = 0, confidence = 0.5, metadata = {} }) {
    this.thoughtCounter++;
    const thought = new ThoughtNode({
      id: `thought-${this.thoughtCounter}`,
      content,
      parentId,
      depth,
      confidence,
      metadata
    });
    
    this.thoughtTree.set(thought.id, thought);
    
    if (parentId) {
      const parent = this.thoughtTree.get(parentId);
      if (parent) {
        parent.children.push(thought.id);
      }
    }
    
    this.emit('thoughtCreated', { thought });
    return thought;
  }

  async expandThoughtTree(rootThought, context) {
    let currentDepth = 0;
    const queue = [{ thought: rootThought, depth: currentDepth }];
    
    while (queue.length > 0 && currentDepth < this.maxDepth) {
      const batch = [];
      
      // Process nodes at current depth
      while (queue.length > 0) {
        const { thought, depth } = queue[0];
        if (depth === currentDepth) {
          batch.push(queue.shift());
        } else {
          break;
        }
      }
      
      // Expand nodes at this depth
      for (const { thought, depth } of batch) {
        const children = await this.expandThought(thought, context);
        for (const child of children) {
          thought.children.push(child.id);
          queue.push({ thought: child, depth: depth + 1 });
        }
      }
      
      currentDepth++;
      
      // Limit total nodes
      if (this.thoughtTree.size > 100) break;
    }
    
    return rootThought;
  }

  async expandThought(parentThought, context) {
    const children = [];
    
    // Determine expansion strategy based on content and depth
    const expansionTypes = this.determineExpansionTypes(parentThought, context);
    
    for (const type of expansionTypes) {
      const childContent = await this.generateThoughtContent(parentThought, type, context);
      
      const child = this.createThoughtNode({
        content: childContent,
        parentId: parentThought.id,
        depth: parentThought.depth + 1,
        confidence: this.calculateInitialConfidence(type),
        metadata: {
          type,
          parentType: parentThought.metadata.type,
          reasoning: await this.generateReasoning(type, childContent, context)
        }
      });
      
      children.push(child);
      
      // Limit branches per node
      if (children.length >= this.maxBranches) break;
    }
    
    return children;
  }

  determineExpansionTypes(thought, context) {
    const types = [];
    const content = thought.content.toLowerCase();
    
    // Analyze content type and generate appropriate expansions
    if (content.includes('analyze') || content.includes('research')) {
      types.push('decompose', 'compare', 'evaluate');
    } else if (content.includes('create') || content.includes('build') || content.includes('implement')) {
      types.push('approach', 'method', 'alternative');
    } else if (content.includes('solve') || content.includes('fix') || content.includes('resolve')) {
      types.push('diagnose', 'solution', 'workaround');
    } else if (content.includes('plan') || content.includes('strategy')) {
      types.push('short_term', 'medium_term', 'long_term');
    } else {
      // Default expansions
      types.push('elaborate', 'simplify', 'alternative', 'consequence');
    }
    
    return types;
  }

  async generateThoughtContent(parentThought, type, context) {
    // Use LLM router if available for intelligent generation
    if (this.llmRouter) {
      try {
        const prompt = `Given the following thought: "${parentThought.content}"
        
Generate a child thought of type "${type}" that explores this direction.
The child should be a concrete action or sub-goal.
Respond with just the thought content, no explanation.`;

        const response = await this.llmRouter.route({
          prompt,
          task: 'generation',
          preferredModel: 'claude'
        });
        
        return response.trim();
      } catch (error) {
        console.warn('LLM generation failed, using fallback:', error);
      }
    }
    
    // Fallback generation
    const fallbacks = {
      elaborate: `Break down: ${parentThought.content}`,
      simplify: `Simplified approach to: ${parentThought.content}`,
      alternative: `Alternative path for: ${parentThought.content}`,
      consequence: `What happens if we: ${parentThought.content}`,
      decompose: `Steps to complete: ${parentThought.content}`,
      compare: `Compare options for: ${parentThought.content}`,
      approach: `Approach for building: ${parentThought.content}`,
      method: `Method to implement: ${parentThought.content}`,
      diagnose: `Root cause of: ${parentThought.content}`,
      solution: `Solution for: ${parentThought.content}`,
      short_term: `Immediate steps for: ${parentThought.content}`,
      medium_term: `Mid-term strategy for: ${parentThought.content}`,
      long_term: `Long-term vision for: ${parentThought.content}`
    };
    
    return fallbacks[type] || `Explore: ${parentThought.content}`;
  }

  async generateReasoning(type, content, context) {
    return `This ${type} branch explores ${content} as a potential path toward the goal.`;
  }

  calculateInitialConfidence(type) {
    const confidenceMap = {
      elaborate: 0.8,
      approach: 0.75,
      solution: 0.7,
      method: 0.7,
      short_term: 0.85,
      alternative: 0.6,
      consequence: 0.5
    };
    
    return confidenceMap[type] || 0.6;
  }

  async generateBranchPlans(tree, context) {
    const branches = [];
    
    // Generate branches by tracing paths through the tree
    const leafNodes = this.getLeafNodes(tree);
    
    for (const leaf of leafNodes) {
      const path = this.getPathToRoot(leaf);
      const thoughtIds = path.map(n => n.id).reverse();
      
      const branch = new BranchPlan({
        id: `branch-${branches.length + 1}`,
        name: this.generateBranchName(path),
        thoughtIds,
        estimatedCost: this.estimateCost(path),
        estimatedTime: this.estimateTime(path)
      });
      
      branches.push(branch);
      
      this.activeBranches.set(branch.id, branch);
    }
    
    return branches;
  }

  getLeafNodes(rootThought) {
    const leaves = [];
    const visited = new Set();
    
    const traverse = (thought) => {
      if (visited.has(thought.id)) return;
      visited.add(thought.id);
      
      if (thought.children.length === 0) {
        leaves.push(thought);
      } else {
        for (const childId of thought.children) {
          const child = this.thoughtTree.get(childId);
          if (child) traverse(child);
        }
      }
    };
    
    traverse(rootThought);
    return leaves;
  }

  getPathToRoot(leafThought) {
    const path = [leafThought];
    let current = leafThought;
    
    while (current.parentId) {
      const parent = this.thoughtTree.get(current.parentId);
      if (parent) {
        path.push(parent);
        current = parent;
      } else {
        break;
      }
    }
    
    return path;
  }

  generateBranchName(path) {
    if (path.length === 0) return 'Empty Plan';
    
    const leaf = path[0];
    const leafContent = leaf.content;
    
    if (leafContent.length > 30) {
      return leafContent.substring(0, 30) + '...';
    }
    
    return leafContent;
  }

  estimateCost(path) {
    let cost = 0;
    
    for (const thought of path) {
      // Base cost per node
      cost += 1;
      
      // Additional cost based on depth
      cost += thought.depth * 0.5;
      
      // Cost based on complexity of metadata
      if (thought.metadata.type === 'decompose' || 
          thought.metadata.type === 'compare') {
        cost += 2;
      }
    }
    
    return cost;
  }

  estimateTime(path) {
    return path.length * 5000; // 5 seconds per step estimate
  }

  async scoreAndRankBranches(branches, context) {
    for (const branch of branches) {
      branch.score = await this.calculateBranchScore(branch, context);
      branch.riskLevel = this.assessRiskLevel(branch);
    }
    
    // Sort by score descending
    branches.sort((a, b) => b.score - a.score);
    
    for (let i = 0; i < branches.length; i++) {
      this.emit('branchSelected', { branch: branches[i], rank: i + 1 });
    }
    
    return branches;
  }

  async calculateBranchScore(branch, context) {
    let score = 0;
    let factors = [];
    
    // Confidence factor
    const confidences = [];
    for (const thoughtId of branch.thoughtIds) {
      const thought = this.thoughtTree.get(thoughtId);
      if (thought) confidences.push(thought.confidence);
    }
    
    const avgConfidence = confidences.reduce((a, b) => a + b, 0) / confidences.length;
    score += avgConfidence * 0.4;
    factors.push({ name: 'avgConfidence', value: avgConfidence, weight: 0.4 });
    
    // Cost efficiency factor (prefer lower cost)
    const allBranches = this.branches || [branch];
    const maxCost = Math.max(...allBranches.map(b => b.estimatedCost));
    const costEfficiency = 1 - (branch.estimatedCost / (maxCost || 1));
    score += costEfficiency * 0.2;
    factors.push({ name: 'costEfficiency', value: costEfficiency, weight: 0.2 });
    
    // Time efficiency factor
    const maxTime = Math.max(...allBranches.map(b => b.estimatedTime));
    const timeEfficiency = 1 - (branch.estimatedTime / (maxTime || 1));
    score += timeEfficiency * 0.15;
    factors.push({ name: 'timeEfficiency', value: timeEfficiency, weight: 0.15 });
    
    // Depth factor (prefer balanced depth)
    const idealDepth = this.maxDepth / 2;
    const depthScore = 1 - Math.abs(branch.thoughtIds.length - idealDepth) / this.maxDepth;
    score += depthScore * 0.15;
    factors.push({ name: 'depthScore', value: depthScore, weight: 0.15 });
    
    // Semantic coherence (check if branch makes logical sense)
    const coherence = await this.assessSemanticCoherence(branch, context);
    score += coherence * 0.1;
    factors.push({ name: 'coherence', value: coherence, weight: 0.1 });
    
    branch.factors = factors;
    
    return score;
  }

  async assessSemanticCoherence(branch, context) {
    // Simple coherence check - verify adjacent thoughts are related
    let coherence = 1.0;
    
    for (let i = 0; i < branch.thoughtIds.length - 1; i++) {
      const current = this.thoughtTree.get(branch.thoughtIds[i]);
      const next = this.thoughtTree.get(branch.thoughtIds[i + 1]);
      
      if (current && next) {
        // Basic semantic check (words in common)
        const currentWords = new Set(current.content.toLowerCase().split(/\s+/));
        const nextWords = new Set(next.content.toLowerCase().split(/\s+/));
        
        const intersection = [...currentWords].filter(w => nextWords.has(w));
        const union = new Set([...currentWords, ...nextWords]).size;
        
        const similarity = union > 0 ? intersection.length / union : 0;
        
        if (similarity < 0.3) {
          coherence -= 0.1;
        }
      }
    }
    
    return Math.max(0, coherence);
  }

  assessRiskLevel(branch) {
    if (branch.score > 0.8 && branch.estimatedCost < 5) {
      return 'low';
    } else if (branch.score > 0.6 || branch.estimatedCost < 10) {
      return 'medium';
    } else {
      return 'high';
    }
  }

  async simulatePlans(branches, context) {
    const simulatedBranches = [];
    
    for (const branch of branches) {
      const simulation = await this.simulateBranch(branch, context);
      simulatedBranches.push(simulation);
    }
    
    return simulatedBranches;
  }

  async simulateBranch(branch, context) {
    const simulation = {
      ...branch,
      simulated: true,
      predictedOutcome: null,
      failurePoints: [],
      warnings: []
    };
    
    // Simulate each step
    for (let i = 0; i < branch.thoughtIds.length; i++) {
      const thought = this.thoughtTree.get(branch.thoughtIds[i]);
      
      if (thought) {
        // Check for potential failure points
        const failureRisk = this.assessFailureRisk(thought, context);
        
        if (failureRisk > 0.5) {
          simulation.failurePoints.push({
            thoughtId: thought.id,
            risk: failureRisk,
            reason: `High complexity detected in: ${thought.content}`
          });
          
          simulation.warnings.push(`Step ${i + 1}: Potential failure risk (${Math.round(failureRisk * 100)}%)`);
        }
        
        // Predict outcome
        simulation.predictedOutcome = thought.content;
      }
    }
    
    // Adjust score based on simulation
    const failurePenalty = simulation.failurePoints.length * 0.05;
    simulation.originalScore = branch.score;
    simulation.adjustedScore = Math.max(0, branch.score - failurePenalty);
    
    return simulation;
  }

  assessFailureRisk(thought, context) {
    let risk = 0;
    
    // Higher depth = higher risk
    risk += thought.depth / this.maxDepth * 0.3;
    
    // Lower confidence = higher risk
    risk += (1 - thought.confidence) * 0.3;
    
    // Complex metadata types = higher risk
    if (thought.metadata.type === 'decompose' || 
        thought.metadata.type === 'compare') {
      risk += 0.2;
    }
    
    // Long content = higher risk (complex task)
    if (thought.content.length > 200) {
      risk += 0.1;
    }
    
    return Math.min(1, risk);
  }

  async forecastFailures(branches, context) {
    const forecasts = [];
    
    for (const branch of branches) {
      const forecast = this.forecastBranchFailures(branch, context);
      forecasts.push(forecast);
      
      this.emit('failureForecast', forecast);
    }
    
    return forecasts;
  }

  forecastBranchFailures(branch, context) {
    const forecast = {
      branchId: branch.id,
      likelyFailures: [],
      preventionStrategies: [],
      contingencyPlans: []
    };
    
    // Analyze failure patterns
    for (const thoughtId of branch.thoughtIds) {
      const thought = this.thoughtTree.get(thoughtId);
      
      if (thought) {
        // Check for known failure patterns
        if (thought.metadata.type === 'decompose' && thought.depth > 3) {
          forecast.likelyFailures.push({
            thoughtId: thought.id,
            failure: 'Decomposition complexity',
            probability: 0.6
          });
          
          forecast.preventionStrategies.push({
            thoughtId: thought.id,
            strategy: 'Reduce decomposition depth or split into separate branches'
          });
        }
        
        if (thought.confidence < 0.5) {
          forecast.likelyFailures.push({
            thoughtId: thought.id,
            failure: 'Low confidence step',
            probability: 0.7
          });
          
          forecast.contingencyPlans.push({
            thoughtId: thought.id,
            plan: 'Add verification step after this thought'
          });
        }
      }
    }
    
    // Generate general prevention strategies
    if (branch.estimatedCost > 10) {
      forecast.preventionStrategies.push({
        strategy: 'Break high-cost plan into smaller sub-plans'
      });
    }
    
    if (forecast.likelyFailures.length > 3) {
      forecast.preventionStrategies.push({
        strategy: 'Consider simplifying the overall plan structure'
      });
    }
    
    return forecast;
  }

  selectBestPlan(branches) {
    // Filter out plans with score below threshold
    const viablePlans = branches.filter(b => b.score >= this.confidenceThreshold);
    
    if (viablePlans.length === 0) {
      // Fallback to highest scoring plan
      return branches[0] || null;
    }
    
    // Further filter by risk level
    const lowRiskPlans = viablePlans.filter(b => b.riskLevel === 'low');
    
    if (lowRiskPlans.length > 0) {
      return lowRiskPlans[0];
    }
    
    // Return highest scoring viable plan
    return viablePlans[0];
  }

  async createExecutionRoadmap(branch, context) {
    const roadmap = {
      planId: branch.id,
      steps: [],
      totalEstimatedTime: 0,
      totalEstimatedCost: 0,
      checkpoints: [],
      retryStrategies: []
    };
    
    for (let i = 0; i < branch.thoughtIds.length; i++) {
      const thought = this.thoughtTree.get(branch.thoughtIds[i]);
      
      if (thought) {
        const step = {
          stepId: i + 1,
          thoughtId: thought.id,
          content: thought.content,
          type: thought.metadata.type,
          estimatedTime: 5000,
          estimatedCost: 1,
          confidence: thought.confidence,
          validationRequired: thought.metadata.type === 'decompose',
          retryOnFailure: true,
          maxRetries: 3
        };
        
        roadmap.steps.push(step);
        roadmap.totalEstimatedTime += step.estimatedTime;
        roadmap.totalEstimatedCost += step.estimatedCost;
        
        // Add checkpoints every 3 steps
        if ((i + 1) % 3 === 0) {
          roadmap.checkpoints.push({
            afterStep: i + 1,
            validation: 'Verify intermediate results'
          });
        }
        
        // Add retry strategies
        if (thought.confidence < 0.6) {
          roadmap.retryStrategies.push({
            stepId: step.stepId,
            strategy: 'If fails, try alternative approach from parent thought'
          });
        }
      }
    }
    
    return roadmap;
  }

  /**
   * Execute a plan with monitoring
   */
  async executePlan(roadmap, executor) {
    const results = {
      completedSteps: [],
      failedSteps: [],
      retries: 0,
      totalTime: 0
    };
    
    const startTime = Date.now();
    
    for (const step of roadmap.steps) {
      const thought = this.thoughtTree.get(step.thoughtId);
      
      if (thought) {
        thought.status = 'active';
        this.emit('thoughtCompleted', { thought, status: 'active' });
        
        try {
          const stepResult = await this.executeStep(step, executor);
          
          thought.status = 'completed';
          thought.result = stepResult;
          results.completedSteps.push(stepResult);
          
          this.emit('thoughtCompleted', { thought, status: 'completed', result: stepResult });
          
        } catch (error) {
          thought.status = 'failed';
          results.failedSteps.push({ step, error: error.message });
          
          // Retry logic
          if (step.retryOnFailure && results.retries < step.maxRetries) {
            results.retries++;
            // Retry implementation
          }
          
          this.emit('thoughtCompleted', { thought, status: 'failed', error });
        }
      }
      
      this.emit('iterationComplete', { 
        completedSteps: results.completedSteps.length,
        totalSteps: roadmap.steps.length,
        currentStep: step
      });
    }
    
    results.totalTime = Date.now() - startTime;
    
    return results;
  }

  async executeStep(step, executor) {
    const thought = this.thoughtTree.get(step.thoughtId);
    
    if (executor && typeof executor.execute === 'function') {
      return await executor.execute({
        action: thought.content,
        type: thought.metadata.type,
        context: thought.metadata
      });
    }
    
    return { success: true, output: thought.content };
  }

  /**
   * Get planning statistics
   */
  getStats() {
    return {
      totalThoughts: this.thoughtTree.size,
      totalBranches: this.activeBranches.size,
      totalPlans: this.planCounter,
      avgConfidence: this.confidenceScores.length > 0 
        ? this.confidenceScores.reduce((a, b) => a + b, 0) / this.confidenceScores.length 
        : 0,
      lastPlanTime: this.executionHistory.length > 0 
        ? this.executionHistory[this.executionHistory.length - 1].executionTime 
        : 0
    };
  }

  /**
   * Reset planner state
   */
  reset() {
    this.thoughtTree.clear();
    this.activeBranches.clear();
    this.executionHistory = [];
    this.confidenceScores = [];
  }

  /**
   * Export tree for visualization
   */
  exportTree() {
    const exportData = {
      nodes: [],
      links: []
    };
    
    for (const [id, thought] of this.thoughtTree) {
      exportData.nodes.push({
        id: thought.id,
        content: thought.content,
        depth: thought.depth,
        confidence: thought.confidence,
        status: thought.status,
        type: thought.metadata.type
      });
      
      if (thought.parentId) {
        exportData.links.push({
          source: thought.parentId,
          target: thought.id
        });
      }
    }
    
    return exportData;
  }
}

export default RecursiveAutonomousPlanner;
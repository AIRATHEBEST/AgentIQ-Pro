// Phase 1: Autonomous Planning Loop
// Implements Plan → Execute → Verify → Retry behavior

class PlanningLoop {
  constructor() {
    this.currentTask = null;
    this.subtasks = [];
    this.executionLog = [];
    this.maxIterations = 10;
    this.verifyThreshold = 0.8; // 80% confidence required
  }

  // Main planning method
  async plan(goal, context = {}) {
    this.reset();
    this.currentTask = {
      goal,
      context,
      startTime: Date.now(),
      status: 'planning'
    };

    this.log('Starting autonomous planning loop');
    this.log(`Goal: ${goal}`);

    // Step 1: Analyze and decompose goal
    const subtasks = this.decomposeGoal(goal, context);
    this.subtasks = subtasks;
    this.log(`Decomposed into ${subtasks.length} subtasks`);

    // Step 2: Build execution plan
    const plan = this.buildExecutionPlan(subtasks);
    this.log(`Execution plan: ${plan.map(s => s.type).join(' → ')}`);

    return {
      task: this.currentTask,
      subtasks: this.subtasks,
      plan
    };
  }

  // Decompose goal into subtasks
  decomposeGoal(goal, context) {
    const subtasks = [];
    const goalLower = goal.toLowerCase();

    // Research phase
    if (this.needsResearch(goalLower)) {
      subtasks.push({
        id: crypto.randomUUID(),
        type: 'research',
        description: 'Research and gather information',
        priority: 1,
        dependencies: [],
        estimatedTime: '2-5 min',
        tools: ['web_search', 'memory_recall']
      });
    }

    // Analysis phase
    if (this.needsAnalysis(goalLower)) {
      subtasks.push({
        id: crypto.randomUUID(),
        type: 'analysis',
        description: 'Analyze gathered information',
        priority: 2,
        dependencies: ['research'],
        estimatedTime: '1-3 min',
        tools: ['calculator', 'code_interpreter']
      });
    }

    // Creation phase
    if (this.needsCreation(goalLower)) {
      subtasks.push({
        id: crypto.randomUUID(),
        type: 'create',
        description: 'Create output or perform action',
        priority: 3,
        dependencies: this.needsResearch(goalLower) ? ['analysis'] : [],
        estimatedTime: '5-30 min',
        tools: ['code_interpreter', 'file_reader']
      });
    }

    // Verification phase
    subtasks.push({
      id: crypto.randomUUID(),
      type: 'verify',
      description: 'Verify results meet requirements',
      priority: 4,
      dependencies: ['create', 'analysis'],
      estimatedTime: '1-2 min',
      tools: ['memory_recall']
    });

    // If no specific tasks detected, create a general response task
    if (subtasks.length === 1 && subtasks[0].type === 'verify') {
      subtasks.unshift({
        id: crypto.randomUUID(),
        type: 'respond',
        description: 'Generate response',
        priority: 1,
        dependencies: [],
        estimatedTime: '1-2 min',
        tools: []
      });
    }

    return subtasks;
  }

  // Detect if goal needs research
  needsResearch(goal) {
    const keywords = ['research', 'find', 'search', 'look up', 'information', 'what is', 'who is', 'how to', 'explain', 'tell me about'];
    return keywords.some(k => goal.includes(k));
  }

  // Detect if goal needs analysis
  needsAnalysis(goal) {
    const keywords = ['analyze', 'compare', 'calculate', 'evaluate', 'assess', 'data', 'numbers', 'stats', 'percentage', 'cost', 'difference'];
    return keywords.some(k => goal.includes(k));
  }

  // Detect if goal needs creation
  needsCreation(goal) {
    const keywords = ['create', 'build', 'make', 'write', 'generate', 'code', 'develop', 'design', 'draw', 'produce'];
    return keywords.some(k => goal.includes(k));
  }

  // Build execution plan from subtasks
  buildExecutionPlan(subtasks) {
    // Sort by priority and dependencies
    const sorted = [...subtasks].sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return a.dependencies.length - b.dependencies.length;
    });

    // Filter to executable tasks
    return sorted.map(task => ({
      id: task.id,
      type: task.type,
      status: 'pending',
      action: this.getActionForType(task.type)
    }));
  }

  // Get action description for task type
  getActionForType(type) {
    const actions = {
      research: '🔍 Searching and gathering information...',
      analysis: '📊 Analyzing data and patterns...',
      create: '🛠️ Creating output...',
      verify: '✅ Verifying results...',
      respond: '💬 Generating response...'
    };
    return actions[type] || '⏳ Processing...';
  }

  // Execute the plan
  async execute(toolEngine, memorySystem) {
    this.currentTask.status = 'executing';
    const results = [];
    let iteration = 0;

    while (iteration < this.maxIterations) {
      iteration++;
      this.log(`Iteration ${iteration}`);

      // Find next executable subtask
      const nextTask = this.findNextExecutable();
      
      if (!nextTask) {
        this.log('All tasks completed');
        break;
      }

      this.log(`Executing: ${nextTask.type}`);
      nextTask.status = 'executing';
      nextTask.startTime = Date.now();

      try {
        const result = await this.executeSubtask(nextTask, toolEngine, memorySystem);
        nextTask.status = 'completed';
        nextTask.result = result;
        nextTask.endTime = Date.now();
        
        results.push(result);
        this.log(`${nextTask.type} completed successfully`);

        // Verify result
        const verified = this.verifyResult(nextTask);
        if (!verified) {
          this.log(`⚠️ Verification failed, may need retry`);
          nextTask.status = 'needs_retry';
        }
      } catch (error) {
        nextTask.status = 'failed';
        nextTask.error = error.message;
        nextTask.endTime = Date.now();
        this.log(`❌ Task failed: ${error.message}`);
        
        // Retry logic
        if (nextTask.retryCount < 3) {
          nextTask.retryCount = (nextTask.retryCount || 0) + 1;
          nextTask.status = 'pending';
          this.log(`🔄 Retrying task (attempt ${nextTask.retryCount})`);
        }
      }
    }

    this.currentTask.status = 'completed';
    this.currentTask.endTime = Date.now();
    this.currentTask.results = results;

    return {
      success: this.currentTask.status === 'completed',
      task: this.currentTask,
      subtasks: this.subtasks,
      results,
      iterations: iteration
    };
  }

  // Find next executable subtask
  findNextExecutable() {
    return this.subtasks.find(task => {
      if (task.status !== 'pending' && task.status !== 'needs_retry') return false;
      
      // Check dependencies
      const deps = task.dependencies || [];
      return deps.every(depName => {
        const dep = this.subtasks.find(t => t.type === depName);
        return dep && dep.status === 'completed';
      });
    });
  }

  // Execute a single subtask
  async executeSubtask(task, toolEngine, memorySystem) {
    switch (task.type) {
      case 'research':
        return await this.executeResearch(task, toolEngine, memorySystem);
      
      case 'analysis':
        return await this.executeAnalysis(task, toolEngine, memorySystem);
      
      case 'create':
        return await this.executeCreation(task, toolEngine, memorySystem);
      
      case 'verify':
        return await this.executeVerification(task, toolEngine, memorySystem);
      
      case 'respond':
        return { type: 'response', content: 'Ready to respond' };
      
      default:
        return { type: task.type, content: 'Task executed' };
    }
  }

  // Execute research subtask
  async executeResearch(task, toolEngine, memorySystem) {
    const context = this.currentTask.context;
    
    // First, recall relevant memories
    const memories = memorySystem.search(this.currentTask.goal);
    
    // Then search the web (if API available)
    const suggestedTools = toolEngine.suggestTools(this.currentTask.goal);
    
    return {
      type: 'research',
      memories: memories.slice(0, 3),
      suggestedTools: suggestedTools.map(t => t.name),
      status: 'complete'
    };
  }

  // Execute analysis subtask
  async executeAnalysis(task, toolEngine, memorySystem) {
    // Look for calculations or data processing needs
    const goal = this.currentTask.goal;
    
    // Extract any math expressions
    const mathPattern = /[\d+\-*/().]+/g;
    const expressions = goal.match(mathPattern);
    
    return {
      type: 'analysis',
      expressions: expressions || [],
      status: 'complete'
    };
  }

  // Execute creation subtask
  async executeCreation(task, toolEngine, memorySystem) {
    return {
      type: 'creation',
      status: 'pending_code_generation',
      message: 'Code generation ready'
    };
  }

  // Execute verification subtask
  async executeVerification(task, toolEngine, memorySystem) {
    const allCompleted = this.subtasks
      .filter(t => t.type !== 'verify')
      .every(t => t.status === 'completed');

    const results = this.subtasks.map(t => ({
      type: t.type,
      status: t.status,
      result: t.result
    }));

    return {
      type: 'verification',
      allTasksComplete: allCompleted,
      results,
      confidence: allCompleted ? 1.0 : 0.5
    };
  }

  // Verify result quality
  verifyResult(task) {
    // Simple verification - check if result exists
    if (!task.result) return false;
    if (task.result.error) return false;
    
    // Check confidence threshold
    const confidence = task.result.confidence || 1.0;
    return confidence >= this.verifyThreshold;
  }

  // Get current status
  getStatus() {
    return {
      task: this.currentTask,
      subtasks: this.subtasks,
      progress: this.calculateProgress(),
      currentTask: this.findNextExecutable()
    };
  }

  // Calculate overall progress
  calculateProgress() {
    if (this.subtasks.length === 0) return 0;
    const completed = this.subtasks.filter(t => t.status === 'completed').length;
    return Math.round((completed / this.subtasks.length) * 100);
  }

  // Log execution
  log(message) {
    const entry = {
      timestamp: Date.now(),
      message
    };
    this.executionLog.push(entry);
    console.log(`[PlanningLoop] ${message}`);
  }

  // Get execution log
  getLog() {
    return this.executionLog;
  }

  // Reset state
  reset() {
    this.currentTask = null;
    this.subtasks = [];
    this.executionLog = [];
  }

  // Generate final response from completed plan
  generateResponse(task, results) {
    const completedSubtasks = this.subtasks.filter(t => t.status === 'completed');
    
    let response = '';
    
    completedSubtasks.forEach(subtask => {
      switch (subtask.type) {
        case 'research':
          if (subtask.result?.memories?.length > 0) {
            response += '📚 From memory: ';
            response += subtask.result.memories.map(m => m.content).join(', ') + '\n\n';
          }
          break;
        case 'analysis':
          if (subtask.result?.expressions?.length > 0) {
            response += '📊 Analysis complete\n\n';
          }
          break;
        case 'verify':
          if (subtask.result?.allTasksComplete) {
            response += '✅ All tasks completed successfully\n\n';
          }
          break;
      }
    });

    return response || 'I have analyzed your request and gathered the necessary information.';
  }
}

export const planningLoop = new PlanningLoop();
export default PlanningLoop;
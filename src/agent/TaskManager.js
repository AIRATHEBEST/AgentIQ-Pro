// Task Manager for handling complex task lists and workflows
class TaskManager {
  constructor() {
    this.tasks = [];
    this.history = [];
    this.isInitialized = false;
  }

  // Initialize task manager
  initialize() {
    this.isInitialized = true;
    console.log('[TaskManager] Initialized');
    return { status: 'initialized', message: 'Task manager ready' };
  }

  // Handle task action
  handleAction(args) {
    try {
      if (!args || !args.action) {
        return { error: 'Invalid task action' };
      }

      const { action, tasks, options } = args;
      
      switch (action) {
        case 'create':
          return this.createTaskList(tasks, options);
        case 'execute':
          return this.executeTaskList(tasks, options);
        case 'status':
          return this.getTaskStatus(options?.taskId);
        case 'list':
          return this.listTasks();
        default:
          return { error: `Unknown task action: ${action}` };
      }
    } catch (error) {
      return { error: `Task action failed: ${error.message}` };
    }
  }

  // Create a new task list
  createTaskList(tasks, options = {}) {
    if (!Array.isArray(tasks)) {
      return { error: 'Tasks must be an array' };
    }

    const taskId = this.generateId();
    const taskList = {
      id: taskId,
      name: options.name || `Task List ${taskId.substring(0, 8)}`,
      tasks: tasks.map((task, index) => ({
        id: task.id || this.generateId(),
        index,
        description: task.description || '',
        status: 'pending',
        dependencies: task.dependencies || [],
        priority: task.priority || 1,
        createdAt: Date.now(),
        startedAt: null,
        completedAt: null,
        result: null,
        error: null
      })),
      status: 'created',
      createdAt: Date.now(),
      startedAt: null,
      completedAt: null
    };

    this.tasks.push(taskList);
    this.history.push({
      action: 'create',
      taskId: taskList.id,
      timestamp: Date.now()
    });

    return {
      taskId: taskList.id,
      status: 'created',
      message: `Created task list with ${tasks.length} tasks`
    };
  }

  // Execute a task list
  async executeTaskList(taskList, options = {}) {
    if (!taskList || !Array.isArray(taskList.tasks)) {
      return { error: 'Invalid task list' };
    }

    const executionId = this.generateId();
    const results = [];
    const startTime = Date.now();

    try {
      // Update task list status
      const listIndex = this.tasks.findIndex(t => t.id === taskList.id);
      if (listIndex >= 0) {
        this.tasks[listIndex].status = 'executing';
        this.tasks[listIndex].startedAt = Date.now();
      }

      // Execute tasks in order (respecting dependencies)
      const taskResults = await this.executeTasksWithDependencies(taskList.tasks);

      // Update task list completion
      if (listIndex >= 0) {
        this.tasks[listIndex].status = 'completed';
        this.tasks[listIndex].completedAt = Date.now();
        this.tasks[listIndex].results = taskResults;
      }

      this.history.push({
        action: 'execute',
        taskId: taskList.id,
        executionId,
        timestamp: Date.now(),
        duration: Date.now() - startTime
      });

      return {
        executionId,
        status: 'completed',
        results: taskResults,
        duration: Date.now() - startTime
      };
    } catch (error) {
      // Update task list error status
      const listIndex = this.tasks.findIndex(t => t.id === taskList.id);
      if (listIndex >= 0) {
        this.tasks[listIndex].status = 'error';
        this.tasks[listIndex].completedAt = Date.now();
      }

      this.history.push({
        action: 'execute_error',
        taskId: taskList.id,
        executionId,
        error: error.message,
        timestamp: Date.now(),
        duration: Date.now() - startTime
      });

      return {
        executionId,
        status: 'error',
        error: error.message,
        duration: Date.now() - startTime
      };
    }
  }

  // Execute tasks respecting dependencies
  async executeTasksWithDependencies(tasks) {
    const results = {};
    const pendingTasks = [...tasks];
    const completedTasks = new Set();
    const maxIterations = tasks.length * 2; // Prevent infinite loops
    let iterations = 0;

    while (pendingTasks.length > 0 && iterations < maxIterations) {
      iterations++;
      let executed = false;

      for (let i = pendingTasks.length - 1; i >= 0; i--) {
        const task = pendingTasks[i];
        
        // Check if dependencies are met
        const canExecute = task.dependencies.every(dep => completedTasks.has(dep));
        
        if (canExecute) {
          try {
            // Simulate task execution
            const result = await this.simulateTaskExecution(task);
            task.status = 'completed';
            task.completedAt = Date.now();
            task.result = result;
            results[task.id] = result;
            completedTasks.add(task.id);
            pendingTasks.splice(i, 1);
            executed = true;
          } catch (error) {
            task.status = 'failed';
            task.completedAt = Date.now();
            task.error = error.message;
            completedTasks.add(task.id); // Mark as completed even if failed
            pendingTasks.splice(i, 1);
            executed = true;
          }
        }
      }

      // If no task was executed in this iteration, break to prevent infinite loop
      if (!executed) {
        break;
      }
    }

    // Handle any remaining tasks
    pendingTasks.forEach(task => {
      task.status = 'skipped';
      task.completedAt = Date.now();
      task.error = 'Skipped due to unmet dependencies';
    });

    return results;
  }

  // Simulate task execution (in a real implementation, this would do actual work)
  async simulateTaskExecution(task) {
    // In a real implementation, this would actually perform the task
    // For now, we'll simulate with a delay and return a mock result
    await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));
    
    return {
      taskId: task.id,
      description: task.description,
      result: `Completed: ${task.description}`,
      timestamp: Date.now()
    };
  }

  // Get task status
  getTaskStatus(taskId) {
    if (!taskId) {
      return { error: 'Task ID required' };
    }

    const taskList = this.tasks.find(t => t.id === taskId);
    if (!taskList) {
      return { error: 'Task not found' };
    }

    return {
      taskId: taskList.id,
      name: taskList.name,
      status: taskList.status,
      tasks: taskList.tasks.map(task => ({
        id: task.id,
        description: task.description,
        status: task.status,
        result: task.result,
        error: task.error
      }))
    };
  }

  // List all tasks
  listTasks() {
    return {
      tasks: this.tasks.map(taskList => ({
        id: taskList.id,
        name: taskList.name,
        status: taskList.status,
        taskCount: taskList.tasks.length,
        createdAt: taskList.createdAt
      }))
    };
  }

  // Generate unique ID
  generateId() {
    return 'task_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  // Get execution history
  getHistory() {
    return this.history;
  }

  // Clear history
  clearHistory() {
    this.history = [];
    return { status: 'cleared', message: 'History cleared' };
  }
}

// Export singleton instance
module.exports = { taskManager: new TaskManager() };
module.exports.default = TaskManager;

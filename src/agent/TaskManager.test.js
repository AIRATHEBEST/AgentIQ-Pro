const { taskManager } = require('./TaskManager');

describe('TaskManager', () => {
  beforeEach(() => {
    taskManager.tasks = [];
    taskManager.history = [];
  });

  test('should create a task list', () => {
    const tasks = [
      { description: 'Test task 1' },
      { description: 'Test task 2' }
    ];
    
    const result = taskManager.createTaskList(tasks);
    
    expect(result.status).toBe('created');
    expect(result.taskId).toBeDefined();
    expect(taskManager.tasks.length).toBe(1);
  });

  test('should execute a task list', async () => {
    const tasks = [
      { description: 'Test task 1' },
      { description: 'Test task 2' }
    ];
    
    const createResult = taskManager.createTaskList(tasks);
    const taskList = taskManager.tasks.find(t => t.id === createResult.taskId);
    
    const result = await taskManager.executeTaskList(taskList);
    
    expect(result.status).toBe('completed');
    expect(result.results).toBeDefined();
  });

  test('should get task status', () => {
    const tasks = [{ description: 'Test task' }];
    const createResult = taskManager.createTaskList(tasks);
    
    const status = taskManager.getTaskStatus(createResult.taskId);
    
    expect(status.status).toBe('created');
    expect(status.taskId).toBe(createResult.taskId);
  });

  test('should list tasks', () => {
    const tasks = [{ description: 'Test task' }];
    taskManager.createTaskList(tasks);
    
    const list = taskManager.listTasks();
    
    expect(list.tasks.length).toBe(1);
    expect(list.tasks[0].status).toBe('created');
  });
});
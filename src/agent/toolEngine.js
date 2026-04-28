/**
 * Tool Engine for AgentIQ Pro
 * Manages tool registration, execution, and lifecycle
 */

class Tool {
  constructor(name, description, executeFn, schema = {}) {
    this.name = name;
    this.description = description;
    this.execute = executeFn;
    this.schema = schema;
    this.enabled = true;
    this.lastUsed = null;
    this.useCount = 0;
  }

  async run(params) {
    if (!this.enabled) {
      throw new Error(`Tool ${this.name} is disabled`);
    }
    
    this.lastUsed = Date.now();
    this.useCount++;
    
    try {
      return await this.execute(params);
    } catch (error) {
      throw new Error(`Tool ${this.name} failed: ${error.message}`);
    }
  }
}

class ToolEngine {
  constructor() {
    this.tools = new Map();
    this.executions = [];
    this.middleware = [];
  }

  /**
   * Register a new tool
   */
  registerTool(tool) {
    if (!(tool instanceof Tool)) {
      throw new Error('Invalid tool: must be an instance of Tool class');
    }
    
    this.tools.set(tool.name, tool);
    console.log(`[ToolEngine] Registered tool: ${tool.name}`);
  }

  /**
   * Register a tool by properties
   */
  register(name, description, executeFn, schema = {}) {
    const tool = new Tool(name, description, executeFn, schema);
    this.registerTool(tool);
    return tool;
  }

  /**
   * Get a tool by name
   */
  getTool(name) {
    return this.tools.get(name);
  }

  /**
   * List all available tools
   */
  listTools() {
    return Array.from(this.tools.values()).map(tool => ({
      name: tool.name,
      description: tool.description,
      enabled: tool.enabled,
      useCount: tool.useCount
    }));
  }

  /**
   * Execute a tool by name with parameters
   */
  async execute(toolName, params = {}) {
    const tool = this.getTool(toolName);
    
    if (!tool) {
      throw new Error(`Tool not found: ${toolName}`);
    }

    // Apply middleware
    for (const middleware of this.middleware) {
      params = await middleware(params, toolName);
    }

    // Record execution start
    const executionId = `exec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();
    
    this.executions.push({
      id: executionId,
      toolName,
      startTime,
      status: 'running'
    });

    try {
      const result = await tool.run(params);
      
      // Record successful execution
      const endTime = Date.now();
      const execution = this.executions.find(e => e.id === executionId);
      if (execution) {
        execution.endTime = endTime;
        execution.duration = endTime - startTime;
        execution.status = 'completed';
        execution.result = result;
      }
      
      return result;
    } catch (error) {
      // Record failed execution
      const endTime = Date.now();
      const execution = this.executions.find(e => e.id === executionId);
      if (execution) {
        execution.endTime = endTime;
        execution.duration = endTime - startTime;
        execution.status = 'failed';
        execution.error = error.message;
      }
      
      throw error;
    }
  }

  /**
   * Add middleware function
   */
  use(middlewareFn) {
    this.middleware.push(middlewareFn);
  }

  /**
   * Get execution history
   */
  getExecutionHistory(limit = 50) {
    return this.executions.slice(-limit);
  }

  /**
   * Clear execution history
   */
  clearExecutionHistory() {
    this.executions = [];
  }

  /**
   * Enable/disable a tool
   */
  setToolEnabled(toolName, enabled) {
    const tool = this.getTool(toolName);
    if (tool) {
      tool.enabled = enabled;
    }
  }

  /**
   * Get tool statistics
   */
  getStats() {
    const totalExecutions = this.executions.length;
    const successfulExecutions = this.executions.filter(e => e.status === 'completed').length;
    const failedExecutions = this.executions.filter(e => e.status === 'failed').length;
    
    return {
      totalTools: this.tools.size,
      totalExecutions,
      successfulExecutions,
      failedExecutions,
      successRate: totalExecutions > 0 ? (successfulExecutions / totalExecutions) : 0,
      tools: this.listTools()
    };
  }
}

// Default tool engine instance
const toolEngine = new ToolEngine();

// Export both class and instance
export default ToolEngine;
export { toolEngine, Tool };
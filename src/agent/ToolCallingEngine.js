// Phase 1: True Tool Calling Engine
// Enables automatic tool selection and execution by AI

// Tool definitions with JSON Schema for AI understanding
export const TOOL_DEFINITIONS = [
  {
    name: 'web_search',
    description: 'Search the web for information about any topic',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query to find information'
        },
        maxResults: {
          type: 'number',
          description: 'Maximum number of results to return',
          default: 5
        }
      },
      required: ['query']
    }
  },
  {
    name: 'calculator',
    description: 'Perform mathematical calculations',
    parameters: {
      type: 'object',
      properties: {
        expression: {
          type: 'string',
          description: 'Mathematical expression to evaluate'
        }
      },
      required: ['expression']
    }
  },
  {
    name: 'code_interpreter',
    description: 'Execute JavaScript code in a sandboxed environment',
    parameters: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'The code to execute'
        },
        language: {
          type: 'string',
          enum: ['python', 'javascript'],
          description: 'Programming language',
          default: 'javascript'
        }
      },
      required: ['code']
    }
  },
  {
    name: 'file_reader',
    description: 'Read content from files in the local filesystem',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Full path to the file'
        },
        maxLines: {
          type: 'number',
          description: 'Maximum number of lines to read',
          default: 100
        }
      },
      required: ['path']
    }
  },
  {
    name: 'image_generation',
    description: 'Generate images from text descriptions',
    parameters: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Detailed description of the image to generate'
        },
        size: {
          type: 'string',
          enum: ['256x256', '512x512', '1024x1024'],
          description: 'Image resolution',
          default: '512x512'
        }
      },
      required: ['prompt']
    }
  },
  {
    name: 'memory_store',
    description: 'Store information in the AI memory for future reference',
    parameters: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: 'The information to remember'
        },
        type: {
          type: 'string',
          enum: ['fact', 'preference', 'task', 'learned'],
          description: 'Type of memory',
          default: 'fact'
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Tags for organizing memories'
        }
      },
      required: ['content']
    }
  },
  {
    name: 'memory_recall',
    description: 'Recall relevant information from long-term memory',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query to find relevant memories'
        },
        type: {
          type: 'string',
          enum: ['fact', 'preference', 'task', 'learned', 'all'],
          description: 'Filter by memory type',
          default: 'all'
        }
      },
      required: ['query']
    }
  },
  {
    name: 'task_list',
    description: 'Create and manage a list of tasks or action items',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['add', 'complete', 'list', 'remove', 'clear'],
          description: 'Action to perform on tasks'
        },
        task: {
          type: 'string',
          description: 'Task description (for add action)'
        },
        taskId: {
          type: 'string',
          description: 'Task ID (for complete/remove actions)'
        }
      },
      required: ['action']
    }
  }
];

class ToolCallingEngine {
  constructor() {
    this.tools = TOOL_DEFINITIONS;
    this.executionHistory = [];
    this.maxRetries = 3;
    this.sandboxTimeout = 10000;
  }

  // Generate system prompt for tool calling
  getSystemPrompt() {
    return `You have access to the following tools. When you need to perform an action, respond with a JSON tool call.

Available tools:
${this.tools.map(t => `- ${t.name}: ${t.description}`).join('\n')}

To call a tool, respond with this exact JSON format:
{"tool": "tool_name", "arguments": {"param1": "value1", "param2": "value2"}}

You can call multiple tools at once if needed. After receiving results, continue with your response.

Guidelines:
1. Use tools when they will help answer the user's question
2. Always validate tool arguments before calling
3. If a tool fails, try an alternative approach
4. Store important information in memory for future reference
5. Break complex tasks into multiple tool calls`;
  }

  // Parse AI response for tool calls
  parseToolCalls(response) {
    const toolCalls = [];
    
    // Try to find JSON in the response
    const jsonMatches = response.match(/\{[^{}]*"tool"[^{}]*\}/g);
    if (jsonMatches) {
      jsonMatches.forEach(match => {
        try {
          const parsed = JSON.parse(match);
          if (parsed.tool && parsed.arguments) {
            toolCalls.push({
              tool: parsed.tool,
              arguments: parsed.arguments,
              raw: match
            });
          }
        } catch (e) {
          // Try to fix common JSON issues
          const fixed = this.fixJson(match);
          try {
            const parsed = JSON.parse(fixed);
            if (parsed.tool && parsed.arguments) {
              toolCalls.push({
                tool: parsed.tool,
                arguments: parsed.arguments,
                raw: match
              });
            }
          } catch (e2) {
            // Invalid JSON, skip
          }
        }
      });
    }
    
    return toolCalls;
  }

  // Fix common JSON issues
  fixJson(json) {
    return json.replace(/'/g, '"');
  }

  // Execute a tool by name
  async executeTool(toolName, arguments_) {
    const tool = this.tools.find(t => t.name === toolName);
    if (!tool) {
      return { error: `Unknown tool: ${toolName}` };
    }

    // Validate arguments
    const validation = this.validateArguments(tool, arguments_);
    if (!validation.valid) {
      return { error: `Invalid arguments: ${validation.errors.join(', ')}` };
    }

    const startTime = Date.now();
    let result;
    let retries = 0;

    while (retries < this.maxRetries) {
      try {
        result = await this.runTool(toolName, arguments_);
        break;
      } catch (error) {
        retries++;
        if (retries >= this.maxRetries) {
          result = { error: `Tool failed after ${this.maxRetries} attempts: ${error.message}` };
        } else {
          await new Promise(r => setTimeout(r, 500 * retries));
        }
      }
    }

    const execution = {
      tool: toolName,
      arguments: arguments_,
      result,
      timestamp: Date.now(),
      duration: Date.now() - startTime,
      success: !result.error
    };

    this.executionHistory.push(execution);
    return result;
  }

  // Validate tool arguments against schema
  validateArguments(tool, args) {
    const errors = [];
    const { parameters } = tool;
    const { properties, required = [] } = parameters;

    // Check required fields
    required.forEach(field => {
      if (args[field] === undefined || args[field] === null || args[field] === '') {
        errors.push(`Missing required field: ${field}`);
      }
    });

    // Validate types
    Object.entries(args).forEach(([key, value]) => {
      const prop = properties[key];
      if (prop && value !== undefined) {
        if (!this.validateType(value, prop.type)) {
          errors.push(`Invalid type for ${key}: expected ${prop.type}, got ${typeof value}`);
        }
      }
    });

    return { valid: errors.length === 0, errors };
  }

  // Simple type validation
  validateType(value, expectedType) {
    switch (expectedType) {
      case 'string': return typeof value === 'string';
      case 'number': return typeof value === 'number';
      case 'boolean': return typeof value === 'boolean';
      case 'array': return Array.isArray(value);
      case 'object': return typeof value === 'object' && !Array.isArray(value);
      default: return true;
    }
  }

  // Run specific tool implementation
  async runTool(toolName, args) {
    switch (toolName) {
      case 'calculator':
        return this.runCalculator(args.expression);
      
      case 'memory_store':
        return this.runMemoryStore(args);
      
      case 'memory_recall':
        return this.runMemoryRecall(args);
      
      case 'task_list':
        return this.runTaskList(args);
      
      case 'web_search':
        return this.runWebSearch(args);
      
      case 'code_interpreter':
        return this.runCodeInterpreter(args);
      
      case 'file_reader':
        return this.runFileReader(args);
      
      case 'image_generation':
        return this.runImageGeneration(args);
      
      default:
        return { error: `Tool ${toolName} not implemented` };
    }
  }

  // Calculator implementation
  runCalculator(expression) {
    try {
      const sanitized = expression.replace(/[^0-9+\-*/().sqrtlogcosinpow ]/gi, '');
      const result = new Function(`return ${sanitized}`)();
      return { result, expression };
    } catch (e) {
      return { error: `Calculation error: ${e.message}` };
    }
  }

  // Memory store implementation
  runMemoryStore(args) {
    if (typeof window !== 'undefined' && window.memorySystem) {
      const entry = window.memorySystem.addToLongTerm(args.content, args.type || 'fact', {
        tags: args.tags || []
      });
      return { success: true, entryId: entry.id };
    }
    return { error: 'Memory system not available' };
  }

  // Memory recall implementation
  runMemoryRecall(args) {
    if (typeof window !== 'undefined' && window.memorySystem) {
      const results = window.memorySystem.search(args.query, args.type === 'all' ? null : args.type);
      return { results, count: results.length };
    }
    return { error: 'Memory system not available' };
  }

  // Task list implementation
  runTaskList(args) {
    if (typeof window !== 'undefined' && window.taskManager) {
      return window.taskManager.handleAction(args);
    }
    return { error: 'Task manager not available' };
  }

  // Web search placeholder
  async runWebSearch(args) {
    return { 
      results: [],
      query: args.query,
      note: 'Web search requires API integration'
    };
  }

  // Code interpreter (sandboxed)
  async runCodeInterpreter(args) {
    const { code, language = 'javascript' } = args;
    
    if (language === 'javascript') {
      try {
        const safeCode = code.replace(/[^a-zA-Z0-9+\-*/().sqrtlogcosinpow,\s]/g, '');
        const result = new Function(`return ${safeCode}`)();
        return { result, language };
      } catch (e) {
        return { error: `Code execution error: ${e.message}` };
      }
    }
    
    return { error: 'Python execution requires backend integration' };
  }

  // File reader placeholder
  async runFileReader(args) {
    return { 
      error: 'File system access requires backend integration',
      note: 'Files can only be read from a backend server for security'
    };
  }

  // Image generation placeholder
  async runImageGeneration(args) {
    return { 
      error: 'Image generation requires API integration',
      prompt: args.prompt,
      note: 'Use OpenAI DALL-E or similar API'
    };
  }

  // Execute multiple tools in sequence
  async executeChain(tools) {
    const results = [];
    for (const { tool, arguments_ } of tools) {
      const result = await this.executeTool(tool, arguments_);
      results.push({ tool, result });
      if (result.error) break;
    }
    return results;
  }

  // Calculate tool confidence based on context
  calculateConfidence(toolName, context) {
    const tool = this.tools.find(t => t.name === toolName);
    if (!tool) return 0;
    
    let confidence = 0.5;
    
    const keywords = {
      web_search: ['search', 'find', 'look up', 'what is', 'who is', 'when', 'where'],
      calculator: ['calculate', 'compute', 'math', 'add', 'subtract', 'multiply', 'divide', 'solve'],
      memory_store: ['remember', 'save', 'store', 'note', 'forget'],
      memory_recall: ['remember', 'recall', 'what did', 'earlier', 'before'],
      task_list: ['task', 'todo', 'remind', 'action item', 'do this'],
      code_interpreter: ['code', 'run', 'execute', 'program', 'script'],
      file_reader: ['read', 'file', 'open', 'show me'],
      image_generation: ['image', 'picture', 'generate', 'create image', 'draw']
    };
    
    const toolKeywords = keywords[toolName] || [];
    const contextLower = context.toLowerCase();
    
    toolKeywords.forEach(keyword => {
      if (contextLower.includes(keyword)) confidence += 0.1;
    });
    
    return Math.min(confidence, 1.0);
  }

  // Suggest tools based on context
  suggestTools(context) {
    return this.tools
      .map(tool => ({
        ...tool,
        confidence: this.calculateConfidence(tool.name, context)
      }))
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 3);
  }

  // Get execution history
  getHistory() {
    return this.executionHistory;
  }

  // Clear history
  clearHistory() {
    this.executionHistory = [];
  }
}

export const toolEngine = new ToolCallingEngine();
export default ToolCallingEngine;
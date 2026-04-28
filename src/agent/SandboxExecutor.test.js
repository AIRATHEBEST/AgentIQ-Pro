/**
 * SandboxExecutor Tests
 */

import SandboxExecutor, { 
  ExecutionStatus,
  DEFAULT_LIMITS,
  ToolResult,
  SandboxContext,
  createSandboxExecutor,
  sandboxed
} from './SandboxExecutor';

describe('SandboxExecutor', () => {
  let executor;

  beforeEach(() => {
    executor = new SandboxExecutor();
  });

  afterEach(() => {
    executor.destroy();
  });

  describe('Tool Registration', () => {
    test('should register a custom tool', () => {
      const handler = jest.fn().mockResolvedValue('test result');
      executor.registerTool('test.tool', handler);
      
      expect(executor.hasTool('test.tool')).toBe(true);
      expect(executor.listTools()).toContain('test.tool');
    });

    test('should reject non-function handlers', () => {
      expect(() => executor.registerTool('invalid', 'not a function'))
        .toThrow('Tool handler must be a function');
    });

    test('should unregister a tool', () => {
      executor.registerTool('toRemove', async () => 'test');
      expect(executor.hasTool('toRemove')).toBe(true);
      
      const removed = executor.unregisterTool('toRemove');
      expect(removed).toBe(true);
      expect(executor.hasTool('toRemove')).toBe(false);
    });

    test('should emit tool:registered event', (done) => {
      executor.on('tool:registered', (data) => {
        expect(data.name).toBe('eventTest');
        done();
      });
      executor.registerTool('eventTest', async () => 'test');
    });
  });

  describe('Basic Tool Execution', () => {
    test('should execute a registered tool', async () => {
      executor.registerTool('greet', async ({ name }) => `Hello, ${name}!`);
      
      const result = await executor.execute('greet', { name: 'World' });
      
      expect(result.success).toBe(true);
      expect(result.output).toBe('Hello, World!');
      expect(result.error).toBeNull();
    });

    test('should return error for non-existent tool', async () => {
      const result = await executor.execute('nonexistent', {});
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Tool not found: nonexistent');
    });

    test('should emit execution:start event', async () => {
      const startPromise = new Promise((resolve) => {
        executor.on('execution:start', (data) => {
          expect(data.toolName).toBe('simple');
          resolve();
        });
      });

      executor.registerTool('simple', async () => 'done');
      await executor.execute('simple', {});
      await startPromise;
    });

    test('should emit execution:complete event', async () => {
      const completePromise = new Promise((resolve) => {
        executor.on('execution:complete', (data) => {
          expect(data.toolName).toBe('simple');
          expect(data.result.success).toBe(true);
          resolve();
        });
      });

      executor.registerTool('simple', async () => 'done');
      await executor.execute('simple', {});
      await completePromise;
    });
  });

  describe('Built-in String Tools', () => {
    test('should trim whitespace', async () => {
      const result = await executor.execute('string.trim', { text: '  hello  ' });
      expect(result.output).toBe('hello');
    });

    test('should replace text', async () => {
      const result = await executor.execute('string.replace', {
        text: 'hello world',
        pattern: 'world',
        replacement: 'there'
      });
      expect(result.output).toBe('hello there');
    });

    test('should match regex pattern', async () => {
      const result = await executor.execute('string.match', {
        text: 'abc123def456',
        pattern: '\\d+'
      });
      expect(result.output).toEqual(['123', '456']);
    });
  });

  describe('Built-in JSON Tools', () => {
    test('should parse valid JSON', async () => {
      const result = await executor.execute('json.parse', {
        text: '{"key": "value"}'
      });
      expect(result.output).toEqual({ key: 'value' });
    });

    test('should handle invalid JSON', async () => {
      const result = await executor.execute('json.parse', {
        text: 'invalid json'
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid JSON');
    });

    test('should stringify JSON', async () => {
      const result = await executor.execute('json.stringify', {
        value: { key: 'value' },
        indent: 2
      });
      expect(result.output).toBe('{\n  "key": "value"\n}');
    });
  });

  describe('Built-in Math Tools', () => {
    test('should evaluate math expression', async () => {
      const result = await executor.execute('math.evaluate', {
        expression: '2 + 3 * 4'
      });
      expect(result.output).toBe(14);
    });

    test('should handle decimal math', async () => {
      const result = await executor.execute('math.evaluate', {
        expression: '10 / 3'
      });
      expect(result.output).toBeCloseTo(3.333, 3);
    });

    test('should reject unsafe expressions', async () => {
      const result = await executor.execute('math.evaluate', {
        expression: 'require("fs")'
      });
      expect(result.success).toBe(false);
    });
  });

  describe('Built-in Array Tools', () => {
    test('should filter array', async () => {
      const result = await executor.execute('array.filter', {
        array: [1, 2, 3, 4, 5],
        predicate: (n) => n > 2
      });
      expect(result.output).toEqual([3, 4, 5]);
    });

    test('should map array', async () => {
      const result = await executor.execute('array.map', {
        array: [1, 2, 3],
        mapper: (n) => n * 2
      });
      expect(result.output).toEqual([2, 4, 6]);
    });

    test('should reduce array', async () => {
      const result = await executor.execute('array.reduce', {
        array: [1, 2, 3, 4],
        reducer: (sum, n) => sum + n,
        initial: 0
      });
      expect(result.output).toBe(10);
    });
  });

  describe('Built-in Object Tools', () => {
    test('should get object keys', async () => {
      const result = await executor.execute('object.keys', {
        obj: { a: 1, b: 2 }
      });
      expect(result.output).toEqual(['a', 'b']);
    });

    test('should get object values', async () => {
      const result = await executor.execute('object.values', {
        obj: { a: 1, b: 2 }
      });
      expect(result.output).toEqual([1, 2]);
    });

    test('should merge objects', async () => {
      const result = await executor.execute('object.merge', {
        objects: [{ a: 1 }, { b: 2 }, { c: 3 }]
      });
      expect(result.output).toEqual({ a: 1, b: 2, c: 3 });
    });
  });

  describe('Built-in DateTime Tools', () => {
    test('should return current datetime', async () => {
      const result = await executor.execute('datetime.now', {});
      expect(result.output).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    test('should format date', async () => {
      const result = await executor.execute('datetime.format', {
        date: '2024-01-15'
      });
      expect(result.output).toContain('2024-01-15');
    });
  });

  describe('Built-in Validation Tools', () => {
    test('should validate email', async () => {
      const result = await executor.execute('validation.isEmail', {
        value: 'test@example.com'
      });
      expect(result.output).toBe(true);
    });

    test('should reject invalid email', async () => {
      const result = await executor.execute('validation.isEmail', {
        value: 'not-an-email'
      });
      expect(result.output).toBe(false);
    });

    test('should validate URL', async () => {
      const result = await executor.execute('validation.isUrl', {
        value: 'https://example.com'
      });
      expect(result.output).toBe(true);
    });

    test('should validate number', async () => {
      const result = await executor.execute('validation.isNumber', {
        value: 42
      });
      expect(result.output).toBe(true);
    });
  });

  describe('Built-in Text Processing Tools', () => {
    test('should truncate text', async () => {
      const result = await executor.execute('text.truncate', {
        text: 'This is a very long text that should be truncated',
        maxLength: 10
      });
      expect(result.output).toBe('This is...');
    });

    test('should count words', async () => {
      const result = await executor.execute('text.wordCount', {
        text: 'Hello world from tests'
      });
      expect(result.output).toBe(4);
    });

    test('should generate hash', async () => {
      const result = await executor.execute('text.hash', {
        text: 'test'
      });
      expect(result.output).toMatch(/^[a-f0-9]+$/);
    });
  });

  describe('Timeout Handling', () => {
    test('should timeout slow operations', async () => {
      executor.registerTool('slow', async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return 'done';
      }, { timeout: 50 });

      const result = await executor.execute('slow', {});
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('timeout');
    });
  });

  describe('Context Management', () => {
    test('should create sandbox context', () => {
      const context = executor.createContext({ maxExecutionTimeMs: 1000 });
      
      expect(context).toBeInstanceOf(SandboxContext);
      expect(context.id).toMatch(/^sandbox_/);
      expect(context.limits.maxExecutionTimeMs).toBe(1000);
    });

    test('should track execution time', async () => {
      executor.registerTool('timed', async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return 'done';
      });

      const result = await executor.execute('timed', {});
      
      expect(result.metadata.executionTime).toBeGreaterThan(0);
    });

    test('should respect custom limits', async () => {
      const context = executor.createContext({ maxExecutionTimeMs: 500 });
      context.startTime = Date.now() - 600;
      
      expect(context.isTimeoutExceeded()).toBe(true);
    });
  });

  describe('Execution History', () => {
    test('should record executions', async () => {
      executor.registerTool('history', async () => 'recorded');
      await executor.execute('history', {});
      
      const history = executor.getHistory();
      expect(history.length).toBeGreaterThan(0);
    });

    test('should filter history by tool', async () => {
      executor.registerTool('tool1', async () => 'one');
      executor.registerTool('tool2', async () => 'two');
      
      await executor.execute('tool1', {});
      await executor.execute('tool2', {});
      await executor.execute('tool1', {});
      
      const filtered = executor.getHistory({ toolName: 'tool1' });
      expect(filtered.every(h => h.toolName === 'tool1')).toBe(true);
    });

    test('should filter history by status', async () => {
      executor.registerTool('failTool', async () => {
        throw new Error('Intentional failure');
      });
      
      executor.registerTool('passTool', async () => 'success');
      
      await executor.execute('failTool', {});
      await executor.execute('passTool', {});
      
      const failed = executor.getHistory({ status: 'error' });
      expect(failed.every(h => !h.result.success)).toBe(true);
    });

    test('should clear history', async () => {
      executor.registerTool('temp', async () => 'temp');
      await executor.execute('temp', {});
      
      expect(executor.getHistory().length).toBeGreaterThan(0);
      
      executor.clearHistory();
      expect(executor.getHistory().length).toBe(0);
    });
  });

  describe('Execution Statistics', () => {
    test('should calculate stats', async () => {
      executor.registerTool('stat1', async () => 'a');
      executor.registerTool('stat2', async () => 'b');
      
      await executor.execute('stat1', {});
      await executor.execute('stat2', {});
      await executor.execute('stat2', {});
      
      const stats = executor.getStats();
      
      expect(stats.total).toBe(3);
      expect(stats.successful).toBe(3);
      expect(stats.failed).toBe(0);
      expect(stats.registeredTools).toBeGreaterThan(3);
    });
  });

  describe('Parallel Execution', () => {
    test('should execute tools in parallel', async () => {
      executor.registerTool('parallel1', async () => {
        await new Promise(r => setTimeout(r, 20));
        return 'one';
      });
      executor.registerTool('parallel2', async () => {
        await new Promise(r => setTimeout(r, 20));
        return 'two';
      });

      const start = Date.now();
      const results = await executor.executeParallel([
        { toolName: 'parallel1', args: {} },
        { toolName: 'parallel2', args: {} }
      ], { concurrency: 2 });
      
      const duration = Date.now() - start;
      
      expect(results.length).toBe(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(true);
      // Should take ~20ms not 40ms due to parallelism
      expect(duration).toBeLessThan(50);
    });

    test('should limit concurrency', async () => {
      executor.registerTool('concurrent', async () => {
        await new Promise(r => setTimeout(r, 30));
        return 'done';
      });

      const tasks = Array(4).fill().map(() => ({ toolName: 'concurrent', args: {} }));
      const start = Date.now();
      await executor.executeParallel(tasks, { concurrency: 2 });
      const duration = Date.now() - start;
      
      // With concurrency 2, 4 tasks should take ~60ms not 120ms
      expect(duration).toBeLessThan(90);
    });
  });

  describe('Pipeline Execution', () => {
    test('should execute tools in sequence', async () => {
      let callOrder = [];
      
      executor.registerTool('pipe1', async () => {
        callOrder.push('first');
        return 'step1';
      });
      executor.registerTool('pipe2', async () => {
        callOrder.push('second');
        return 'step2';
      });

      const results = await executor.executePipeline([
        { toolName: 'pipe1', args: {} },
        { toolName: 'pipe2', args: {} }
      ]);

      expect(results.length).toBe(2);
      expect(results[0].output).toBe('step1');
      expect(results[1].output).toBe('step2');
      expect(callOrder).toEqual(['first', 'second']);
    });

    test('should pass previous result as context', async () => {
      executor.registerTool('double', async ({ value, _previousResult }) => {
        if (_previousResult) {
          return _previousResult.output * 2;
        }
        return value * 2;
      });

      const results = await executor.executePipeline([
        { toolName: 'double', args: { value: 5 } },
        { toolName: 'double', args: {} }
      ]);

      expect(results[0].output).toBe(10);
      expect(results[1].output).toBe(20);
    });

    test('should stop on error when configured', async () => {
      executor.registerTool('errorTool', async () => {
        throw new Error('Pipeline error');
      });
      executor.registerTool('afterError', async () => 'should not run');

      const results = await executor.executePipeline([
        { toolName: 'errorTool', args: {} },
        { toolName: 'afterError', args: {} }
      ], { stopOnError: true });

      expect(results.length).toBe(1);
      expect(results[0].success).toBe(false);
    });
  });

  describe('Hook System', () => {
    test('should call beforeExecution hook', async () => {
      const beforeSpy = jest.fn();
      const localExecutor = new SandboxExecutor({
        beforeExecution: beforeSpy
      });

      localExecutor.registerTool('hookTest', async () => 'done');
      await localExecutor.execute('hookTest', {});

      expect(beforeSpy).toHaveBeenCalledWith('hookTest', {}, expect.any(Object));
      localExecutor.destroy();
    });

    test('should call afterExecution hook', async () => {
      const afterSpy = jest.fn();
      const localExecutor = new SandboxExecutor({
        afterExecution: afterSpy
      });

      localExecutor.registerTool('hookTest', async () => 'done');
      await localExecutor.execute('hookTest', {});

      expect(afterSpy).toHaveBeenCalled();
      localExecutor.destroy();
    });

    test('should call onError hook on failure', async () => {
      const errorSpy = jest.fn();
      const localExecutor = new SandboxExecutor({
        onError: errorSpy
      });

      localExecutor.registerTool('failTool', async () => {
        throw new Error('Intentional');
      });
      await localExecutor.execute('failTool', {});

      expect(errorSpy).toHaveBeenCalled();
      localExecutor.destroy();
    });
  });

  describe('Reset and Destroy', () => {
    test('should reset executor state', async () => {
      executor.registerTool('resetTest', async () => 'test');
      await executor.execute('resetTest', {});

      executor.reset();
      
      expect(executor.getHistory().length).toBe(0);
    });

    test('should destroy executor completely', () => {
      executor.registerTool('destroy', async () => 'test');
      
      executor.destroy();
      
      expect(executor.listTools().length).toBe(0);
      expect(executor.getHistory().length).toBe(0);
    });
  });

  describe('Factory Functions', () => {
    test('createSandboxExecutor should create new executor', () => {
      const ex = createSandboxExecutor({ maxExecutionTimeMs: 5000 });
      
      expect(ex).toBeInstanceOf(SandboxExecutor);
      expect(ex.defaultLimits.maxExecutionTimeMs).toBe(5000);
      
      ex.destroy();
    });

    test('sandboxed wrapper should execute function in sandbox', async () => {
      const wrappedFn = sandboxed(async (args) => {
        return args.x + args.y;
      });

      const result = await wrappedFn({ x: 5, y: 3 });
      
      expect(result.success).toBe(true);
      expect(result.output).toBe(8);
    });
  });

  describe('ToolResult Class', () => {
    test('should serialize to JSON', () => {
      const result = new ToolResult(true, 'output', null, { executionTime: 100 });
      
      const json = result.toJSON();
      
      expect(json.success).toBe(true);
      expect(json.output).toBe('output');
      expect(json.metadata.executionTime).toBe(100);
    });
  });

  describe('SandboxContext Class', () => {
    test('should track network calls', () => {
      const context = new SandboxContext('test', { maxNetworkCalls: 5 });
      
      expect(context.canMakeNetworkCall()).toBe(true);
      
      context.incrementNetworkCall();
      context.incrementNetworkCall();
      
      expect(context.canMakeNetworkCall()).toBe(true);
      
      context.incrementNetworkCall();
      context.incrementNetworkCall();
      context.incrementNetworkCall();
      
      expect(context.canMakeNetworkCall()).toBe(false);
    });
  });

  describe('Error Handling', () => {
    test('should handle tool execution errors', async () => {
      executor.registerTool('errorTool', async () => {
        throw new Error('Something went wrong');
      });

      const result = await executor.execute('errorTool', {});
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Something went wrong');
    });

    test('should handle async errors', async () => {
      executor.registerTool('asyncError', async () => {
        await new Promise((_, reject) => setTimeout(() => reject(new Error('Async error'), 10)));
      });

      const result = await executor.execute('asyncError', {});
      
      expect(result.success).toBe(false);
    });
  });

  describe('Limits Enforcement', () => {
    test('should apply custom limits', () => {
      const customLimits = {
        maxMemoryMB: 1024,
        maxExecutionTimeMs: 60000,
        maxNetworkCalls: 20
      };

      const executor2 = new SandboxExecutor({ limits: customLimits });
      
      expect(executor2.defaultLimits.maxMemoryMB).toBe(1024);
      expect(executor2.defaultLimits.maxExecutionTimeMs).toBe(60000);
      expect(executor2.defaultLimits.maxNetworkCalls).toBe(20);
      
      executor2.destroy();
    });
  });

  describe('Execution Cancel', () => {
    test('should cancel execution by context ID', () => {
      const context = executor.createContext();
      
      const cancelled = executor.cancelExecution(context.id);
      
      expect(cancelled).toBe(true);
    });

    test('should return false for non-existent context', () => {
      const cancelled = executor.cancelExecution('nonexistent');
      
      expect(cancelled).toBe(false);
    });
  });

  describe('Event Emissions', () => {
    test('should emit tool:unregistered event', (done) => {
      executor.on('tool:unregistered', (data) => {
        expect(data.name).toBe('toUnreg');
        done();
      });
      
      executor.registerTool('toUnreg', async () => 'test');
      executor.unregisterTool('toUnreg');
    });

    test('should emit execution:cancelled event', () => {
      const context = executor.createContext();
      
      const promise = new Promise((resolve) => {
        executor.on('execution:cancelled', resolve);
      });

      executor.cancelExecution(context.id);
      
      return promise;
    });

    test('should emit history:cleared event', (done) => {
      executor.on('history:cleared', done);
      
      executor.registerTool('clear', async () => 'test');
      executor.execute('clear', {}).then(() => {
        executor.clearHistory();
      });
    });

    test('should emit reset event', (done) => {
      executor.on('reset', done);
      executor.reset();
    });
  });
});
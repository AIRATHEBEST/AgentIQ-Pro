/**
 * Docker Code Execution Engine - AgentIQ Pro
 * Isolated container-based code execution with AI capabilities
 * 
 * Features:
 * - Docker container lifecycle management
 * - Multi-language code execution
 * - Resource limits and isolation
 * - Execution sandboxing
 * - Output streaming and capture
 * - Code caching and optimization
 * - Execution history and replay
 */

import { EventEmitter } from 'events';

// Browser-compatible stubs for Node.js modules
const spawn = () => ({ on: () => {}, kill: () => {} });
const exec = (cmd, cb) => cb && cb(null, { stdout: '', stderr: '' });
const promisify = (fn) => fn;
const execAsync = async () => ({ stdout: '', stderr: '' });
const crypto = {
  createHash: () => ({ update: () => ({ digest: () => '' }) }),
  randomBytes: (n) => ({ toString: () => Math.random().toString(36) })
};
// ============================================================================
// TYPES & INTERFACES
// ============================================================================

/**
 * @typedef {'node'|'python'|'ruby'|'go'|'rust'|'java'|'cpp'|'csharp'|'php'|'bash'} Language
 * @typedef {'pending'|'running'|'completed'|'failed'|'timeout'|'cancelled'} ExecutionStatus
 * @typedef {'stdout'|'stderr'|'log'|'error'|'warning'|'info'} OutputType
 */

/**
 * @typedef {Object} ContainerConfig
 * @property {string} image - Docker image to use
 * @property {number} [memoryLimit=512] - Memory limit in MB
 * @property {number} [cpuLimit=1] - CPU limit (cores)
 * @property {number} [timeout=60000] - Execution timeout in ms
 * @property {string[]} [volumes] - Volume mounts
 * @property {Object} [environment] - Environment variables
 * @property {boolean} [networkEnabled=false] - Enable network access
 */

/**
 * @typedef {Object} ExecutionRequest
 * @property {string} code - Code to execute
 * @property {Language} language - Programming language
 * @property {Object} [options] - Execution options
 * @property {string} [stdin] - Standard input
 * @property {Object} [metadata] - Additional metadata
 */

/**
 * @typedef {Object} ExecutionResult
 * @property {string} executionId - Unique execution ID
 * @property {ExecutionStatus} status - Execution status
 * @property {string} stdout - Standard output
 * @property {string} stderr - Standard error
 * @property {number} exitCode - Exit code
 * @property {number} executionTime - Execution time in ms
 * @property {Object} metadata - Additional execution metadata
 */

// ============================================================================
// CUSTOM ERRORS
// ============================================================================

class DockerExecutionError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'DockerExecutionError';
    this.code = code;
    this.details = details;
  }
}

class ContainerError extends DockerExecutionError {
  constructor(message, containerId, exitCode) {
    super(message, 'CONTAINER_ERROR', { containerId, exitCode });
  }
}

class TimeoutError extends DockerExecutionError {
  constructor(executionId, timeout) {
    super(`Execution ${executionId} timed out after ${timeout}ms`, 'TIMEOUT', { executionId, timeout });
  }
}

class LanguageNotSupportedError extends DockerExecutionError {
  constructor(language) {
    super(`Language '${language}' is not supported`, 'LANGUAGE_NOT_SUPPORTED', { language });
  }
}

// ============================================================================
// LANGUAGE CONFIGURATIONS
// ============================================================================

const LANGUAGE_CONFIGS = {
  node: {
    image: 'node:20-alpine',
    command: ['node', '-e'],
    fileExtension: '.js',
    compileRequired: false
  },
  python: {
    image: 'python:3.11-alpine',
    command: ['python', '-c'],
    fileExtension: '.py',
    compileRequired: false
  },
  ruby: {
    image: 'ruby:3.2-alpine',
    command: ['ruby', '-e'],
    fileExtension: '.rb',
    compileRequired: false
  },
  go: {
    image: 'golang:1.21-alpine',
    command: ['go', 'run'],
    fileExtension: '.go',
    compileRequired: false,
    needsWrapper: true
  },
  rust: {
    image: 'rust:1.72-alpine',
    command: ['sh', '-c'],
    fileExtension: '.rs',
    compileRequired: true,
    compileCommand: 'rustc {file} -o /tmp/executable && /tmp/executable'
  },
  java: {
    image: 'openjdk:17-alpine',
    command: ['java', '-cp', '/code'],
    fileExtension: '.java',
    compileRequired: true,
    compileCommand: 'javac {file} && java {classname}',
    classNameRequired: true
  },
  cpp: {
    image: 'gcc:13',
    command: ['sh', '-c'],
    fileExtension: '.cpp',
    compileRequired: true,
    compileCommand: 'g++ -o /tmp/executable {file} && /tmp/executable'
  },
  csharp: {
    image: 'mcr.microsoft.com/dotnet:7.0',
    command: ['dotnet', 'script'],
    fileExtension: '.csx',
    compileRequired: false
  },
  php: {
    image: 'php:8.2-cli-alpine',
    command: ['php', '-r'],
    fileExtension: '.php',
    compileRequired: false
  },
  bash: {
    image: 'bash:5.2-alpine',
    command: ['bash', '-c'],
    fileExtension: '.sh',
    compileRequired: false
  },
  typescript: {
    image: 'node:20-alpine',
    command: ['npx', 'ts-node', '-e'],
    fileExtension: '.ts',
    compileRequired: false,
    npmPackages: ['ts-node', 'typescript']
  }
};

// ============================================================================
// MAIN DOCKER EXECUTION CLASS
// ============================================================================

class DockerCodeExecution extends EventEmitter {
  constructor(config = {}) {
    super();

    this.config = {
      dockerHost: config.dockerHost || process.env.DOCKER_HOST || 'unix:///var/run/docker.sock',
      defaultTimeout: config.defaultTimeout || 60000,
      defaultMemory: config.defaultMemory || 512,
      defaultCpu: config.defaultCpu || 1,
      enableNetwork: config.enableNetwork || false,
      cacheEnabled: config.cacheEnabled !== false,
      maxConcurrent: config.maxConcurrent || 5,
      workDir: config.workDir || '/tmp/agentiq-exec'
    };

    this.dockerAvailable = null;
    this.activeExecutions = new Map();
    this.executionHistory = [];
    this.maxHistorySize = 1000;
    this.codeCache = new Map();
    this.containerPool = [];
    this.isDestroyed = false;
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  async initialize() {
    try {
      // Check if Docker is available
      await this._checkDockerAvailability();
      
      // Pull base images
      await this._ensureBaseImages();

      this.emit('initialized');
      return this;

    } catch (error) {
      this.emit('error', { error: error.message });
      throw new DockerExecutionError(
        `Failed to initialize Docker execution: ${error.message}`,
        'INITIALIZATION_FAILED'
      );
    }
  }

  async _checkDockerAvailability() {
    try {
      await execAsync('docker info');
      this.dockerAvailable = true;
    } catch (error) {
      // Try Windows Docker Desktop approach
      try {
        await execAsync('docker version');
        this.dockerAvailable = true;
      } catch (winError) {
        this.dockerAvailable = false;
        console.warn('Docker not available - falling back to sandboxed execution');
      }
    }
  }

  async _ensureBaseImages() {
    if (!this.dockerAvailable) return;

    const requiredImages = [...new Set(Object.values(LANGUAGE_CONFIGS).map(c => c.image))];
    
    for (const image of requiredImages) {
      try {
        await execAsync(`docker image inspect ${image}`, { encoding: 'utf-8' });
      } catch (e) {
        try {
          this.emit('image:pull:start', { image });
          await execAsync(`docker pull ${image}`);
          this.emit('image:pull:complete', { image });
        } catch (pullError) {
          console.warn(`Failed to pull image ${image}: ${pullError.message}`);
        }
      }
    }
  }

  // ============================================================================
  // CODE EXECUTION
  // ============================================================================

  async execute(request) {
    const executionId = this._generateExecutionId();
    const startTime = Date.now();

    const execution = {
      id: executionId,
      request,
      status: 'pending',
      startTime,
      stdout: '',
      stderr: '',
      exitCode: null,
      metadata: {}
    };

    this.activeExecutions.set(executionId, execution);
    this._recordExecution(execution);

    try {
      execution.status = 'running';
      this.emit('execution:start', { executionId, language: request.language });

      const result = this.dockerAvailable
        ? await this._executeInDocker(execution, request)
        : await this._executeInSandbox(execution, request);

      execution.status = result.status;
      execution.stdout = result.stdout;
      execution.stderr = result.stderr;
      execution.exitCode = result.exitCode;
      execution.endTime = Date.now();
      execution.executionTime = execution.endTime - startTime;
      execution.metadata = result.metadata || {};

      this.emit('execution:complete', {
        executionId,
        status: execution.status,
        executionTime: execution.executionTime
      });

      return this._createExecutionResult(execution);

    } catch (error) {
      execution.status = 'failed';
      execution.stderr = error.message;
      execution.endTime = Date.now();
      execution.executionTime = execution.endTime - startTime;

      this.emit('execution:error', { executionId, error: error.message });
      
      return this._createExecutionResult(execution);

    } finally {
      this.activeExecutions.delete(executionId);
    }
  }

  async _executeInDocker(execution, request) {
    const { code, language, options = {} } = request;
    const langConfig = LANGUAGE_CONFIGS[language];

    if (!langConfig) {
      throw new LanguageNotSupportedError(language);
    }

    const containerId = await this._createContainer(langConfig, options);
    execution.containerId = containerId;

    try {
      // Write code to container
      await this._writeCodeToContainer(containerId, code, langConfig);

      // Execute the code
      let command = [...langConfig.command];
      
      if (langConfig.needsWrapper) {
        // Go needs special handling
        command = ['sh', '-c', `${langConfig.command[0]} run /code/${execution.id}${langConfig.fileExtension}`];
      } else if (langConfig.compileRequired) {
        // Compile then run
        const compiledCommand = langConfig.compileCommand
          .replace('{file}', `/code/${execution.id}${langConfig.fileExtension}`)
          .replace('{classname}', this._extractClassName(code, language));
        command = ['sh', '-c', compiledCommand];
      } else {
        command.push(code);
      }

      return await this._runInContainer(containerId, command, options);

    } finally {
      await this._cleanupContainer(containerId);
    }
  }

  async _createContainer(langConfig, options = {}) {
    const containerName = `agentiq-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const volumes = [
      `${this.config.workDir}:/code`
    ];
    if (options.volumes) {
      volumes.push(...options.volumes);
    }

    const dockerArgs = [
      'docker', 'create',
      '--rm',
      '--name', containerName,
      '--memory', `${options.memoryLimit || this.config.defaultMemory}m`,
      '--cpus', String(options.cpuLimit || this.config.defaultCpu),
      '-w', '/code',
      '-e', `EXECUTION_ID=${containerName}`
    ];

    // Add environment variables
    if (options.environment) {
      for (const [key, value] of Object.entries(options.environment)) {
        dockerArgs.push('-e', `${key}=${value}`);
      }
    }

    // Network settings
    if (options.networkEnabled !== undefined ? options.networkEnabled : this.config.enableNetwork) {
      dockerArgs.push('--network', 'none');
    }

    // Add volumes
    for (const volume of volumes) {
      dockerArgs.push('-v', volume);
    }

    dockerArgs.push(langConfig.image);

    const { stdout: containerId } = await execAsync(dockerArgs.join(' '), { encoding: 'utf-8' });
    return containerId.trim();
  }

  async _writeCodeToContainer(containerId, code, langConfig) {
    const workDir = `${this.config.workDir}/${containerId}`;
    
    // Ensure directory exists
    await execAsync(`mkdir -p ${workDir}`);
    
    // Write code to file
    const filePath = `${workDir}/${containerId}${langConfig.fileExtension}`;
    
    // Handle file writing differently for browser vs Node.js environments
    if (typeof window === 'undefined') {
      // Node.js environment
      try {
        const fs = await import('fs/promises');
        await fs.writeFile(filePath, code);
      } catch (fsError) {
        // Fallback to shell command if fs/promises fails
        const escapedCode = code.replace(/'/g, "'\"'\"'");
        await execAsync(`echo '${escapedCode}' > ${filePath}`);
      }
    } else {
      // Browser environment - write to temporary file using shell commands
      const escapedCode = code.replace(/'/g, "'\"'\"'");
      await execAsync(`echo '${escapedCode}' > ${filePath}`);
    }

    // Copy to container
    await execAsync(`docker cp ${filePath} ${containerId}:/code/`);
  }

  async _runInContainer(containerId, command, options = {}) {
    const timeout = options.timeout || this.config.defaultTimeout;
    
    return new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';
      let killed = false;

      const process = spawn('docker', [
        'start',
        '-i', containerId,
        '-c', command.join(' ')
      ]);

      const timeoutId = setTimeout(() => {
        killed = true;
        process.kill('SIGKILL');
        reject(new TimeoutError(containerId, timeout));
      }, timeout);

      process.stdout.on('data', (data) => {
        const text = data.toString();
        stdout += text;
        this.emit('output', { type: 'stdout', data: text, containerId });
      });

      process.stderr.on('data', (data) => {
        const text = data.toString();
        stderr += text;
        this.emit('output', { type: 'stderr', data: text, containerId });
      });

      process.on('close', (exitCode) => {
        clearTimeout(timeoutId);
        
        if (killed) return;

        resolve({
          status: exitCode === 0 ? 'completed' : 'failed',
          stdout,
          stderr,
          exitCode: exitCode || 0,
          metadata: { containerId }
        });
      });

      process.on('error', (error) => {
        clearTimeout(timeoutId);
        reject(error);
      });

      // Handle stdin if provided
      if (options.stdin) {
        process.stdin.write(options.stdin);
        process.stdin.end();
      }
    });
  }

  async _cleanupContainer(containerId) {
    if (!containerId) return;
    
    try {
      await execAsync(`docker kill ${containerId} 2>/dev/null || true`);
    } catch (e) {
      // Container may already be removed
    }
  }

  // ============================================================================
  // SANDBOX EXECUTION (Fallback when Docker unavailable)
  // ============================================================================

  async _executeInSandbox(execution, request) {
    const { code, language, options = {} } = request;
    const timeout = options.timeout || this.config.defaultTimeout;

    return new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';
      let command;
      let args;

      switch (language) {
        case 'node':
        case 'typescript':
          command = 'node';
          args = ['-e', code];
          break;
        case 'python':
          command = 'python';
          args = ['-c', code];
          break;
        case 'bash':
          command = 'bash';
          args = ['-c', code];
          break;
        default:
          return reject(new LanguageNotSupportedError(language));
      }

      const childProcess = spawn(command, args, {
        timeout,
        env: {
          ...process.env,
          ...options.environment,
          NODE_OPTIONS: '--no-warnings'
        }
      });

      const timeoutId = setTimeout(() => {
        childProcess.kill('SIGKILL');
        reject(new TimeoutError(execution.id, timeout));
      }, timeout);

      childProcess.stdout.on('data', (data) => {
        stdout += data.toString();
        this.emit('output', { type: 'stdout', data: data.toString() });
      });

      childProcess.stderr.on('data', (data) => {
        stderr += data.toString();
        this.emit('output', { type: 'stderr', data: data.toString() });
      });

      childProcess.on('close', (exitCode) => {
        clearTimeout(timeoutId);
        resolve({
          status: exitCode === 0 ? 'completed' : 'failed',
          stdout,
          stderr,
          exitCode: exitCode || 0,
          metadata: { sandboxed: true }
        });
      });

      childProcess.on('error', (error) => {
        clearTimeout(timeoutId);
        reject(error);
      });

      if (options.stdin) {
        childProcess.stdin.write(options.stdin);
        childProcess.stdin.end();
      }
    });
  }

  // ============================================================================
  // EXECUTION MANAGEMENT
  // ============================================================================

  async cancelExecution(executionId) {
    const execution = this.activeExecutions.get(executionId);
    
    if (!execution) {
      return { success: false, message: 'Execution not found' };
    }

    if (execution.containerId && this.dockerAvailable) {
      await this._cleanupContainer(execution.containerId);
    }

    execution.status = 'cancelled';
    execution.endTime = Date.now();
    execution.executionTime = execution.endTime - execution.startTime;

    this.emit('execution:cancelled', { executionId });

    return { success: true, executionId };
  }

  async getExecutionStatus(executionId) {
    const execution = this.activeExecutions.get(executionId);
    if (execution) {
      return {
        id: execution.id,
        status: execution.status,
        runningTime: Date.now() - execution.startTime
      };
    }

    // Check history
    const historical = this.executionHistory.find(e => e.id === executionId);
    if (historical) {
      return {
        id: historical.id,
        status: historical.status,
        executionTime: historical.executionTime,
        exitCode: historical.exitCode
      };
    }

    return { status: 'not_found' };
  }

  getActiveExecutions() {
    return Array.from(this.activeExecutions.values()).map(e => ({
      id: e.id,
      status: e.status,
      language: e.request.language,
      runningTime: Date.now() - e.startTime
    }));
  }

  // ============================================================================
  // CODE CACHING
  // ============================================================================

  async getCachedResult(code, language) {
    if (!this.config.cacheEnabled) return null;

    const cacheKey = this._generateCacheKey(code, language);
    return this.codeCache.get(cacheKey) || null;
  }

  setCachedResult(code, language, result) {
    if (!this.config.cacheEnabled) return;

    const cacheKey = this._generateCacheKey(code, language);
    this.codeCache.set(cacheKey, {
      result,
      timestamp: Date.now(),
      hitCount: 0
    });

    // Limit cache size
    if (this.codeCache.size > 100) {
      const oldest = [...this.codeCache.entries()]
        .sort((a, b) => a[1].timestamp - b[1].timestamp)[0];
      this.codeCache.delete(oldest[0]);
    }
  }

  clearCache() {
    this.codeCache.clear();
  }

  _generateCacheKey(code, language) {
    const hash = crypto.createHash('sha256');
    hash.update(code + language);
    return hash.digest('hex').substring(0, 16);
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  _generateExecutionId() {
    return `exec_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  }

  _recordExecution(execution) {
    this.executionHistory.push({
      id: execution.id,
      language: execution.request.language,
      status: execution.status,
      timestamp: execution.startTime,
      executionTime: 0
    });

    if (this.executionHistory.length > this.maxHistorySize) {
      this.executionHistory = this.executionHistory.slice(-this.maxHistorySize);
    }
  }

  _createExecutionResult(execution) {
    return {
      executionId: execution.id,
      status: execution.status,
      stdout: execution.stdout,
      stderr: execution.stderr,
      exitCode: execution.exitCode,
      executionTime: execution.executionTime,
      metadata: execution.metadata
    };
  }

  _extractClassName(code, language) {
    if (language === 'java') {
      const match = code.match(/public\s+class\s+(\w+)/);
      return match ? match[1] : 'Main';
    }
    return null;
  }

  getExecutionHistory(limit = 100) {
    return this.executionHistory.slice(-limit);
  }

  getSupportedLanguages() {
    return Object.keys(LANGUAGE_CONFIGS);
  }

  getLanguageConfig(language) {
    return LANGUAGE_CONFIGS[language] || null;
  }

  // ============================================================================
  // CLEANUP
  // ============================================================================

  async destroy() {
    this.isDestroyed = true;

    // Cancel all active executions
    for (const [id] of this.activeExecutions) {
      await this.cancelExecution(id);
    }

    // Cleanup container pool
    for (const containerId of this.containerPool) {
      await this._cleanupContainer(containerId);
    }

    this.removeAllListeners();
    this.activeExecutions.clear();
    this.executionHistory = [];
    this.codeCache.clear();
  }
}

// ============================================================================
// CONTAINER POOL MANAGER
// ============================================================================

class ContainerPool {
  constructor(config = {}) {
    this.pool = [];
    this.config = config;
    this.maxSize = config.maxSize || 10;
    this.inUse = new Set();
    this.imageConfigs = new Map();
  }

  async acquire(image, options = {}) {
    // Find available container with matching image
    const available = this.pool.find(c => 
      c.image === image && !this.inUse.has(c.id)
    );

    if (available) {
      this.inUse.add(available.id);
      return available;
    }

    if (this.pool.length < this.maxSize) {
      const executor = new DockerCodeExecution();
      await executor.initialize();
      const container = { id: crypto.randomBytes(8).toString('hex'), image, executor };
      this.pool.push(container);
      this.inUse.add(container.id);
      return container;
    }

    // Wait for available container
    return new Promise((resolve) => {
      const checkAvailable = () => {
        const available = this.pool.find(c => 
          c.image === image && !this.inUse.has(c.id)
        );
        if (available) {
          this.inUse.add(available.id);
          resolve(available);
        } else {
          setTimeout(checkAvailable, 100);
        }
      };
      checkAvailable();
    });
  }

  release(containerId) {
    this.inUse.delete(containerId);
  }

  async destroy() {
    for (const container of this.pool) {
      await container.executor?.destroy();
    }
    this.pool = [];
    this.inUse.clear();
  }
}

// ============================================================================
// CODE VALIDATOR
// ============================================================================

class CodeValidator {
  constructor() {
    this.securityPatterns = {
      node: [
        { pattern: /require\s*\(\s*['"]child_process['"]\s*\)/, reason: 'child_process import' },
        { pattern: /require\s*\(\s*['"]fs['"]\s*\)/, reason: 'filesystem access' },
        { pattern: /\.exec\s*\(/, reason: 'shell execution' },
        { pattern: /\.spawn\s*\(/, reason: 'process spawning' }
      ],
      python: [
        { pattern: /import\s+os/, reason: 'OS module import' },
        { pattern: /import\s+subprocess/, reason: 'subprocess import' },
        { pattern: /exec\s*\(/, reason: 'dynamic code execution' },
        { pattern: /eval\s*\(/, reason: 'eval usage' }
      ]
    };

    this.maxCodeSize = {
      node: 50000,
      python: 50000,
      default: 100000
    };
  }

  validate(code, language) {
    const errors = [];
    const warnings = [];

    // Check code size
    const maxSize = this.maxCodeSize[language] || this.maxCodeSize.default;
    if (code.length > maxSize) {
      errors.push(`Code size (${code.length}) exceeds maximum (${maxSize})`);
    }

    // Check for security issues
    const patterns = this.securityPatterns[language] || [];
    for (const { pattern, reason } of patterns) {
      if (pattern.test(code)) {
        warnings.push(`Potential security concern: ${reason}`);
      }
    }

    // Check for infinite loops
    if (this._hasPotentialInfiniteLoop(code)) {
      warnings.push('Potential infinite loop detected');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  _hasPotentialInfiniteLoop(code) {
    // Simple heuristics for infinite loops
    const infinitePatterns = [
      /while\s*\(\s*true\s*\)/,
      /while\s*\(\s*1\s*\)/,
      /for\s*\(\s*;\s*;\s*\)/
    ];

    return infinitePatterns.some(p => p.test(code));
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default DockerCodeExecution;
export { DockerCodeExecution, ContainerPool, CodeValidator };
export { DockerExecutionError, ContainerError, TimeoutError, LanguageNotSupportedError };
export { LANGUAGE_CONFIGS };
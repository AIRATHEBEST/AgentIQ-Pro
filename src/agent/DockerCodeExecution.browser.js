/**
 * Browser-compatible stub for DockerCodeExecution
 * This is a placeholder for the actual DockerCodeExecution implementation
 * which uses Node.js specific modules not available in the browser
 */

class DockerCodeExecution {
  constructor(config = {}) {
    console.warn('DockerCodeExecution is not available in browser environment');
    this.config = config;
    this.dockerAvailable = false;
    this.activeExecutions = new Map();
    this.executionHistory = [];
  }

  async initialize() {
    console.warn('DockerCodeExecution initialization skipped in browser environment');
    return this;
  }

  async execute(request) {
    console.warn('DockerCodeExecution execute skipped in browser environment');
    return {
      executionId: 'browser-stub-' + Date.now(),
      status: 'failed',
      stdout: '',
      stderr: 'Docker execution not available in browser environment',
      exitCode: 1,
      executionTime: 0,
      metadata: { browserStub: true }
    };
  }

  async cancelExecution(executionId) {
    console.warn('DockerCodeExecution cancelExecution skipped in browser environment');
    return { success: false, message: 'Not available in browser environment' };
  }

  async getExecutionStatus(executionId) {
    return { status: 'not_found' };
  }

  getActiveExecutions() {
    return [];
  }

  async getCachedResult(code, language) {
    return null;
  }

  setCachedResult(code, language, result) {
    // No-op in browser
  }

  clearCache() {
    // No-op in browser
  }

  getExecutionHistory(limit = 100) {
    return [];
  }

  getSupportedLanguages() {
    return [];
  }

  getLanguageConfig(language) {
    return null;
  }

  async destroy() {
    // No-op in browser
  }
}

// Also export the helper classes as stubs
class ContainerPool {
  constructor(config = {}) {
    this.pool = [];
    this.config = config;
  }

  async acquire(image, options = {}) {
    console.warn('ContainerPool.acquire skipped in browser environment');
    return null;
  }

  release(containerId) {
    // No-op in browser
  }

  async destroy() {
    // No-op in browser
  }
}

class CodeValidator {
  constructor() {
    this.securityPatterns = {};
    this.maxCodeSize = {};
  }

  validate(code, language) {
    return {
      valid: true,
      errors: [],
      warnings: ['Validation skipped in browser environment']
    };
  }
}

// Custom Errors
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

const LANGUAGE_CONFIGS = {};

export default DockerCodeExecution;
export { DockerCodeExecution, ContainerPool, CodeValidator };
export { DockerExecutionError, ContainerError, TimeoutError, LanguageNotSupportedError };
export { LANGUAGE_CONFIGS };
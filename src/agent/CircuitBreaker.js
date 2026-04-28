/**
 * Circuit Breaker + Rate Limiter for LLMRouter
 * Prevents cascading failures, tracks token usage, and enforces rate limits
 */

class CircuitBreaker {
  constructor(options = {}) {
    this.failureThreshold = options.failureThreshold || 5;
    this.successThreshold = options.successThreshold || 3;
    this.timeout = options.timeout || 60000; // 1 minute
    this.halfOpenMaxCalls = options.halfOpenMaxCalls || 3;
    
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failures = 0;
    this.successes = 0;
    this.lastFailureTime = null;
    this.halfOpenCalls = 0;
  }

  async execute(fn) {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime >= this.timeout) {
        this.state = 'HALF_OPEN';
        this.halfOpenCalls = 0;
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }

    if (this.state === 'HALF_OPEN') {
      if (this.halfOpenCalls >= this.halfOpenMaxCalls) {
        throw new Error('Circuit breaker: HALF_OPEN max calls reached');
      }
      this.halfOpenCalls++;
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  onSuccess() {
    this.failures = 0;
    if (this.state === 'HALF_OPEN') {
      this.successes++;
      if (this.successes >= this.successThreshold) {
        this.state = 'CLOSED';
        this.successes = 0;
      }
    }
  }

  onFailure() {
    this.failures++;
    this.lastFailureTime = Date.now();
    this.successes = 0;
    
    if (this.state === 'HALF_OPEN' || this.failures >= this.failureThreshold) {
      this.state = 'OPEN';
    }
  }

  getStatus() {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailureTime: this.lastFailureTime
    };
  }

  reset() {
    this.state = 'CLOSED';
    this.failures = 0;
    this.successes = 0;
    this.halfOpenCalls = 0;
    this.lastFailureTime = null;
  }
}

class RateLimiter {
  constructor(options = {}) {
    this.maxTokens = options.maxTokens || 100000;
    this.windowMs = options.windowMs || 60000; // 1 minute
    this.tokenUsage = 0;
    this.windowStart = Date.now();
    this.tokens = [];
  }

  async acquire(requiredTokens = 1) {
    this.cleanupOldTokens();
    
    if (this.tokenUsage + requiredTokens > this.maxTokens) {
      const waitTime = this.windowMs - (Date.now() - this.windowStart);
      await this.sleep(Math.max(0, waitTime));
      this.cleanupOldTokens();
    }
    
    this.tokenUsage += requiredTokens;
    return true;
  }

  cleanupOldTokens() {
    const now = Date.now();
    this.tokens = this.tokens.filter(t => now - t < this.windowMs);
    this.tokenUsage = this.tokens.length;
    
    if (now - this.windowStart >= this.windowMs) {
      this.windowStart = now;
      this.tokenUsage = 0;
      this.tokens = [];
    }
  }

  recordTokens(tokens) {
    this.tokens.push(Date.now(), ...Array(tokens - 1).fill(Date.now()));
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getStatus() {
    this.cleanupOldTokens();
    return {
      tokensUsed: this.tokenUsage,
      maxTokens: this.maxTokens,
      windowMs: this.windowMs,
      windowStart: this.windowStart
    };
  }

  reset() {
    this.tokenUsage = 0;
    this.windowStart = Date.now();
    this.tokens = [];
  }
}

class TokenBudgetManager {
  constructor(options = {}) {
    this.maxTokensPerSession = options.maxTokensPerSession || 200000;
    this.maxTokensPerStep = options.maxTokensPerStep || 4000;
    this.usedTokens = 0;
    this.stepCount = 0;
  }

  checkBudget() {
    if (this.usedTokens >= this.maxTokensPerSession) {
      return { allowed: false, reason: 'Session budget exceeded' };
    }
    return { allowed: true, remaining: this.maxTokensPerSession - this.usedTokens };
  }

  recordUsage(tokens) {
    this.usedTokens += tokens;
    this.stepCount++;
  }

  compressContext(context, maxTokens) {
    if (!context || context.length === 0) return context;
    
    const stringified = JSON.stringify(context);
    const estimatedTokens = Math.ceil(stringified.length / 4);
    
    if (estimatedTokens <= maxTokens) return context;
    
    // Remove oldest entries first
    const compressed = [];
    let currentTokens = 0;
    
    for (let i = context.length - 1; i >= 0; i--) {
      const entryTokens = Math.ceil(JSON.stringify(context[i]).length / 4);
      if (currentTokens + entryTokens <= maxTokens) {
        compressed.unshift(context[i]);
        currentTokens += entryTokens;
      } else {
        break;
      }
    }
    
    return compressed;
  }

  getStatus() {
    return {
      usedTokens: this.usedTokens,
      maxTokens: this.maxTokensPerSession,
      remaining: this.maxTokensPerSession - this.usedTokens,
      stepCount: this.stepCount
    };
  }

  reset() {
    this.usedTokens = 0;
    this.stepCount = 0;
  }
}

// Circuit Breaker Wrapper for LLMRouter
class ProtectedLLMRouter {
  constructor(llmRouter, options = {}) {
    this.router = llmRouter;
    this.ollamaBreaker = new CircuitBreaker(options.ollamaBreaker);
    this.cloudBreaker = new CircuitBreaker(options.cloudBreaker);
    this.ollamaRateLimiter = new RateLimiter(options.ollamaRateLimiter);
    this.cloudRateLimiter = new RateLimiter(options.cloudRateLimiter);
    this.tokenBudget = new TokenBudgetManager(options.tokenBudget);
    this.costTracker = {
      totalCost: 0,
      ollamaCost: 0,
      cloudCost: 0,
      tokenUsage: { input: 0, output: 0 }
    };
  }

  async chat(params) {
    // Check token budget
    const budgetCheck = this.tokenBudget.checkBudget();
    if (!budgetCheck.allowed) {
      throw new Error(`Token budget exceeded: ${budgetCheck.reason}`);
    }

    // Estimate token usage
    const estimatedTokens = this.estimateTokens(params.prompt);
    
    // Determine routing with circuit breakers
    const useCloud = params.priority === 'high_quality' || 
                    params.complexity > 0.7 ||
                    !this.ollamaBreaker.getStatus().state === 'CLOSED';

    const limiter = useCloud ? this.cloudRateLimiter : this.ollamaRateLimiter;
    const breaker = useCloud ? this.cloudBreaker : this.ollamaBreaker;

    // Acquire rate limit token
    await limiter.acquire(estimatedTokens);

    // Execute with circuit breaker protection
    try {
      const result = await breaker.execute(async () => {
        return await this.router.chat(params);
      });

      // Record usage and cost
      this.tokenBudget.recordUsage(estimatedTokens);
      this.recordCost(result, useCloud);

      return result;
    } catch (error) {
      console.error(`LLM call failed via ${useCloud ? 'cloud' : 'ollama'}:`, error);
      throw error;
    }
  }

  estimateTokens(text) {
    return Math.ceil(text.length / 4);
  }

  recordCost(result, isCloud) {
    if (result?.usage) {
      this.costTracker.tokenUsage.input += result.usage.prompt_tokens || 0;
      this.costTracker.tokenUsage.output += result.usage.completion_tokens || 0;
      
      if (isCloud) {
        const costPer1k = 0.03; // Example pricing
        this.costTracker.cloudCost += (result.usage.completion_tokens / 1000) * costPer1k;
        this.costTracker.totalCost += (result.usage.completion_tokens / 1000) * costPer1k;
      }
    }
  }

  getHealth() {
    return {
      ollama: this.ollamaBreaker.getStatus(),
      cloud: this.cloudBreaker.getStatus(),
      ollamaRateLimit: this.ollamaRateLimiter.getStatus(),
      cloudRateLimit: this.cloudRateLimiter.getStatus(),
      tokenBudget: this.tokenBudget.getStatus(),
      cost: this.costTracker
    };
  }

  reset() {
    this.ollamaBreaker.reset();
    this.cloudBreaker.reset();
    this.ollamaRateLimiter.reset();
    this.cloudRateLimiter.reset();
    this.tokenBudget.reset();
  }
}

export { CircuitBreaker, RateLimiter, TokenBudgetManager, ProtectedLLMRouter };
export default { CircuitBreaker, RateLimiter, TokenBudgetManager, ProtectedLLMRouter };
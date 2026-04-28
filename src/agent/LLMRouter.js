/**
 * LLMRouter.js
 * True LLM Routing System - Intelligent routing to multiple LLM providers
 * with load balancing, cost optimization, and fallback handling.
 */

const EventEmitter = require('events');

// ============================================================================
// MODEL DEFINITIONS
// ============================================================================

const MODEL_CATALOG = {
  // Claude Models
  claude: {
    'claude-3-5-sonnet': {
      provider: 'anthropic',
      name: 'Claude 3.5 Sonnet',
      contextWindow: 200000,
      maxOutput: 8192,
      cost: { input: 3, output: 15 }, // per million tokens
      strengths: ['reasoning', 'coding', 'analysis', 'creativity'],
      weaknesses: ['real-time', 'numerical'],
      supports: ['text', 'vision'],
      recommendedFor: ['complex_reasoning', 'code_generation', 'analysis', 'writing']
    },
    'claude-3-opus': {
      provider: 'anthropic',
      name: 'Claude 3 Opus',
      contextWindow: 200000,
      maxOutput: 4096,
      cost: { input: 15, output: 75 },
      strengths: ['reasoning', 'coding', 'analysis', 'nuanced'],
      weaknesses: ['speed', 'cost'],
      supports: ['text', 'vision'],
      recommendedFor: ['complex_reasoning', 'research', 'high_quality']
    },
    'claude-3-haiku': {
      provider: 'anthropic',
      name: 'Claude 3 Haiku',
      contextWindow: 200000,
      maxOutput: 4096,
      cost: { input: 0.25, output: 1.25 },
      strengths: ['speed', 'cost', 'efficiency'],
      weaknesses: ['complex_reasoning'],
      supports: ['text', 'vision'],
      recommendedFor: ['quick_tasks', 'simple_queries', 'automation']
    }
  },

  // OpenAI GPT Models
  gpt: {
    'gpt-4o': {
      provider: 'openai',
      name: 'GPT-4o',
      contextWindow: 128000,
      maxOutput: 16384,
      cost: { input: 5, output: 15 },
      strengths: ['reasoning', 'coding', 'multimodal', 'speed'],
      weaknesses: ['cost', 'nuanced_nuance'],
      supports: ['text', 'vision', 'audio'],
      recommendedFor: ['general', 'coding', 'vision_tasks']
    },
    'gpt-4-turbo': {
      provider: 'openai',
      name: 'GPT-4 Turbo',
      contextWindow: 128000,
      maxOutput: 4096,
      cost: { input: 10, output: 30 },
      strengths: ['reasoning', 'coding', 'long_context'],
      weaknesses: ['cost', 'speed'],
      supports: ['text', 'vision'],
      recommendedFor: ['complex_coding', 'long_documents']
    },
    'gpt-4': {
      provider: 'openai',
      name: 'GPT-4',
      contextWindow: 8192,
      maxOutput: 8192,
      cost: { input: 30, output: 60 },
      strengths: ['reasoning', 'coding', 'quality'],
      weaknesses: ['speed', 'cost', 'context_limit'],
      supports: ['text'],
      recommendedFor: ['high_quality', 'reasoning']
    },
    'gpt-3.5-turbo': {
      provider: 'openai',
      name: 'GPT-3.5 Turbo',
      contextWindow: 16385,
      maxOutput: 4096,
      cost: { input: 0.5, output: 1.5 },
      strengths: ['speed', 'cost', 'efficiency'],
      weaknesses: ['complex_reasoning'],
      supports: ['text'],
      recommendedFor: ['quick_tasks', 'simple_queries']
    }
  },

  // DeepSeek Models
  deepseek: {
    'deepseek-chat': {
      provider: 'deepseek',
      name: 'DeepSeek Chat',
      contextWindow: 128000,
      maxOutput: 4096,
      cost: { input: 0.27, output: 1.1 },
      strengths: ['coding', 'reasoning', 'cost_efficiency'],
      weaknesses: ['creative_writing'],
      supports: ['text'],
      recommendedFor: ['coding', 'technical', 'cost_optimized']
    },
    'deepseek-coder': {
      provider: 'deepseek',
      name: 'DeepSeek Coder',
      contextWindow: 128000,
      maxOutput: 4096,
      cost: { input: 0.27, output: 1.1 },
      strengths: ['code_generation', 'code_completion', 'bug_fixing'],
      weaknesses: ['creative_tasks'],
      supports: ['text'],
      recommendedFor: ['coding', 'programming', 'debugging']
    }
  },

  // Google Gemini Models
  gemini: {
    'gemini-1.5-pro': {
      provider: 'google',
      name: 'Gemini 1.5 Pro',
      contextWindow: 1000000,
      maxOutput: 8192,
      cost: { input: 1.25, output: 5 },
      strengths: ['long_context', 'multimodal', 'reasoning'],
      weaknesses: ['cost_at_long_context'],
      supports: ['text', 'vision', 'audio', 'video'],
      recommendedFor: ['long_documents', 'multimodal', 'analysis']
    },
    'gemini-1.5-flash': {
      provider: 'google',
      name: 'Gemini 1.5 Flash',
      contextWindow: 1000000,
      maxOutput: 8192,
      cost: { input: 0.075, output: 0.30 },
      strengths: ['speed', 'cost', 'long_context'],
      weaknesses: ['depth'],
      supports: ['text', 'vision'],
      recommendedFor: ['quick_tasks', 'high_volume', 'multimodal']
    },
    'gemini-pro': {
      provider: 'google',
      name: 'Gemini Pro',
      contextWindow: 32768,
      maxOutput: 8192,
      cost: { input: 0.125, output: 0.50 },
      strengths: ['reasoning', 'multimodal'],
      weaknesses: ['coding'],
      supports: ['text', 'vision'],
      recommendedFor: ['general', 'reasoning']
    }
  },

  // Ollama Models
  ollama: {
    'llama3': {
      provider: 'ollama',
      name: 'Llama 3',
      contextWindow: 8192,
      maxOutput: 2048,
      cost: { input: 0, output: 0 }, // Free - local
      strengths: ['cost', 'privacy', 'offline'],
      weaknesses: ['quality', 'reasoning', 'speed'],
      supports: ['text'],
      recommendedFor: ['simple_tasks', 'privacy', 'offline', 'experimentation']
    },
    'llama3:70b': {
      provider: 'ollama',
      name: 'Llama 3 70B',
      contextWindow: 8192,
      maxOutput: 4096,
      cost: { input: 0, output: 0 },
      strengths: ['quality', 'reasoning', 'cost'],
      weaknesses: ['speed', 'setup'],
      supports: ['text'],
      recommendedFor: ['high_quality_free', 'reasoning']
    },
    'mixtral': {
      provider: 'ollama',
      name: 'Mixtral',
      contextWindow: 32000,
      maxOutput: 4096,
      cost: { input: 0, output: 0 },
      strengths: ['reasoning', 'efficiency'],
      weaknesses: ['speed'],
      supports: ['text'],
      recommendedFor: ['balanced', 'reasoning']
    },
    'codellama': {
      provider: 'ollama',
      name: 'Code Llama',
      contextWindow: 16384,
      maxOutput: 4096,
      cost: { input: 0, output: 0 },
      strengths: ['code_generation', 'code_completion'],
      weaknesses: ['general_tasks'],
      supports: ['text'],
      recommendedFor: ['coding', 'programming']
    },
    'mistral': {
      provider: 'ollama',
      name: 'Mistral',
      contextWindow: 8192,
      maxOutput: 2048,
      cost: { input: 0, output: 0 },
      strengths: ['speed', 'efficiency'],
      weaknesses: ['complex_tasks'],
      supports: ['text'],
      recommendedFor: ['quick_simple', 'automation']
    },
    'phi3': {
      provider: 'ollama',
      name: 'Phi-3',
      contextWindow: 4096,
      maxOutput: 2048,
      cost: { input: 0, output: 0 },
      strengths: ['speed', 'small_footprint'],
      weaknesses: ['complex_tasks'],
      supports: ['text'],
      recommendedFor: ['lightweight', 'fast']
    }
  },

  // Groq Models
  groq: {
    'llama3-70b': {
      provider: 'groq',
      name: 'Llama 3 70B (Groq)',
      contextWindow: 8192,
      maxOutput: 4096,
      cost: { input: 0, output: 0.59 }, // Very cheap
      strengths: ['speed', 'cost', 'reasoning'],
      weaknesses: ['context_limit'],
      supports: ['text'],
      recommendedFor: ['fast_reasoning', 'cost_effective']
    },
    'mixtral-8x7b': {
      provider: 'groq',
      name: 'Mixtral 8x7B (Groq)',
      contextWindow: 32768,
      maxOutput: 4096,
      cost: { input: 0, output: 0.24 },
      strengths: ['speed', 'cost'],
      weaknesses: ['consistency'],
      supports: ['text'],
      recommendedFor: ['fast_cheap']
    }
  }
};

// Flatten model catalog for easy lookup
const ALL_MODELS = {};
for (const [provider, models] of Object.entries(MODEL_CATALOG)) {
  for (const [modelId, model] of Object.entries(models)) {
    ALL_MODELS[modelId] = { ...model, id: modelId };
  }
}

// ============================================================================
// CUSTOM ERRORS
// ============================================================================

class RouterError extends Error {
  constructor(message, code = 'ROUTER_ERROR') {
    super(message);
    this.name = 'RouterError';
    this.code = code;
  }
}

class ModelUnavailableError extends RouterError {
  constructor(model) {
    super(`Model ${model} is not available`, 'MODEL_UNAVAILABLE');
    this.model = model;
  }
}

class ProviderError extends RouterError {
  constructor(provider, originalError) {
    super(`Provider ${provider} error: ${originalError.message}`, 'PROVIDER_ERROR');
    this.provider = provider;
    this.originalError = originalError;
  }
}

class RateLimitError extends RouterError {
  constructor(provider, retryAfter) {
    super(`Rate limit exceeded for ${provider}`, 'RATE_LIMIT');
    this.provider = provider;
    this.retryAfter = retryAfter;
  }
}

// ============================================================================
// ROUTING DECISION
// ============================================================================

class RoutingDecision {
  constructor(model, reason, confidence, alternatives = []) {
    this.model = model;
    this.reason = reason;
    this.confidence = confidence;
    this.alternatives = alternatives;
    this.costEstimate = null;
    this.latencyEstimate = null;
    this.routingStrategy = null;
  }

  toJSON() {
    return {
      model: this.model,
      reason: this.reason,
      confidence: this.confidence,
      alternatives: this.alternatives,
      costEstimate: this.costEstimate,
      latencyEstimate: this.latencyEstimate,
      routingStrategy: this.routingStrategy
    };
  }
}

// ============================================================================
// REQUEST CONTEXT
// ============================================================================

class RequestContext {
  constructor(task, options = {}) {
    this.task = task;
    this.taskType = this.classifyTask(task);
    this.requiredCapabilities = options.requiredCapabilities || this.inferCapabilities(task);
    this.contextLength = options.contextLength || this.estimateContextLength(task);
    this.priority = options.priority || 'normal'; // 'low', 'normal', 'high', 'urgent'
    this.budget = options.budget || null;
    this.preferredProviders = options.preferredProviders || [];
    this.excludedProviders = options.excludedProviders || [];
    this.qualityRequirement = options.qualityRequirement || 'balanced'; // 'speed', 'balanced', 'quality'
    this.maxLatency = options.maxLatency || null;
    this.metadata = options.metadata || {};
  }

  classifyTask(task) {
    const taskLower = task.toLowerCase();
    
    if (taskLower.includes('write') || taskLower.includes('story') || taskLower.includes('creative')) {
      return 'creative_writing';
    }
    if (taskLower.includes('code') || taskLower.includes('function') || taskLower.includes('debug')) {
      return 'coding';
    }
    if (taskLower.includes('explain') || taskLower.includes('why') || taskLower.includes('analysis')) {
      return 'analysis';
    }
    if (taskLower.includes('summarize') || taskLower.includes('short')) {
      return 'summarization';
    }
    if (taskLower.includes('translate')) {
      return 'translation';
    }
    if (taskLower.includes('question') || taskLower.includes('answer')) {
      return 'qa';
    }
    if (taskLower.includes('step') || taskLower.includes('reason') || taskLower.includes('think')) {
      return 'reasoning';
    }
    if (taskLower.includes('classify') || taskLower.includes('categorize')) {
      return 'classification';
    }
    
    return 'general';
  }

  inferCapabilities(task) {
    const capabilities = ['text'];
    const taskLower = task.toLowerCase();
    
    if (taskLower.includes('image') || taskLower.includes('picture') || taskLower.includes('photo')) {
      capabilities.push('vision');
    }
    if (taskLower.includes('audio') || taskLower.includes('speech')) {
      capabilities.push('audio');
    }
    
    return capabilities;
  }

  estimateContextLength(task) {
    // Rough estimation based on task length
    const words = task.split(/\s+/).length;
    return Math.min(words * 4, 100000); // Assume 4 tokens per word average
  }

  toJSON() {
    return {
      task: this.task,
      taskType: this.taskType,
      requiredCapabilities: this.requiredCapabilities,
      contextLength: this.contextLength,
      priority: this.priority,
      budget: this.budget,
      preferredProviders: this.preferredProviders,
      excludedProviders: this.excludedProviders,
      qualityRequirement: this.qualityRequirement,
      maxLatency: this.maxLatency,
      metadata: this.metadata
    };
  }
}

// ============================================================================
// PROVIDER STATUS
// ============================================================================

class ProviderStatus {
  constructor(name) {
    this.name = name;
    this.available = true;
    this.latency = null;
    this.requestsToday = 0;
    this.errorsToday = 0;
    this.lastError = null;
    this.lastSuccessfulRequest = null;
    this.consecutiveErrors = 0;
    this.circuitBreakerOpen = false;
    this.circuitBreakerResetTime = null;
    this.rateLimitRemaining = null;
    this.rateLimitReset = null;
  }

  recordSuccess(latency) {
    this.lastSuccessfulRequest = new Date();
    this.consecutiveErrors = 0;
    this.errorsToday = Math.max(0, this.errorsToday - 1);
    this.latency = latency;
    this.requestsToday++;
    this.circuitBreakerOpen = false;
  }

  recordError(error) {
    this.consecutiveErrors++;
    this.errorsToday++;
    this.lastError = error.message || error.toString();
    
    if (this.consecutiveErrors >= 5) {
      this.circuitBreakerOpen = true;
      this.circuitBreakerResetTime = new Date(Date.now() + 60000); // 1 minute
    }
  }

  isHealthy() {
    if (this.circuitBreakerOpen) {
      if (this.circuitBreakerResetTime && new Date() > this.circuitBreakerResetTime) {
        this.circuitBreakerOpen = false;
        this.consecutiveErrors = 0;
      } else {
        return false;
      }
    }
    return this.errorsToday < 20 && this.consecutiveErrors < 3;
  }

  toJSON() {
    return {
      name: this.name,
      available: this.available,
      latency: this.latency,
      requestsToday: this.requestsToday,
      errorsToday: this.errorsToday,
      isHealthy: this.isHealthy(),
      circuitBreakerOpen: this.circuitBreakerOpen
    };
  }
}

// ============================================================================
// COST TRACKER
// ============================================================================

class CostTracker {
  constructor() {
    this.dailyBudget = null;
    this.monthlyBudget = null;
    this.spentToday = 0;
    this.spentThisMonth = 0;
    this.lastResetDate = new Date();
    this.providerCosts = {};
  }

  canAfford(cost, provider) {
    if (this.dailyBudget && this.spentToday + cost > this.dailyBudget) {
      return false;
    }
    if (this.monthlyBudget && this.spentThisMonth + cost > this.monthlyBudget) {
      return false;
    }
    return true;
  }

  recordCost(provider, cost) {
    this.spentToday += cost;
    this.spentThisMonth += cost;
    this.providerCosts[provider] = (this.providerCosts[provider] || 0) + cost;
  }

  resetIfNeeded() {
    const now = new Date();
    if (now.getDate() !== this.lastResetDate.getDate()) {
      this.spentToday = 0;
      this.lastResetDate = now;
    }
  }

  setBudgets(daily, monthly) {
    this.dailyBudget = daily;
    this.monthlyBudget = monthly;
  }

  toJSON() {
    return {
      dailyBudget: this.dailyBudget,
      monthlyBudget: this.monthlyBudget,
      spentToday: this.spentToday,
      spentThisMonth: this.spentThisMonth,
      providerCosts: this.providerCosts
    };
  }
}

// ============================================================================
// LLM ROUTER
// ============================================================================

class LLMRouter extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.providers = {
      anthropic: {
        apiKey: options.anthropicApiKey || process.env.ANTHROPIC_API_KEY,
        baseUrl: 'https://api.anthropic.com/v1',
        status: new ProviderStatus('anthropic')
      },
      openai: {
        apiKey: options.openaiApiKey || process.env.OPENAI_API_KEY,
        baseUrl: 'https://api.openai.com/v1',
        status: new ProviderStatus('openai')
      },
      deepseek: {
        apiKey: options.deepseekApiKey || process.env.DEEPSEEK_API_KEY,
        baseUrl: 'https://api.deepseek.com/v1',
        status: new ProviderStatus('deepseek')
      },
      google: {
        apiKey: options.googleApiKey || process.env.GOOGLE_API_KEY,
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
        status: new ProviderStatus('google')
      },
      ollama: {
        baseUrl: options.ollamaUrl || process.env.OLLAMA_URL || 'http://localhost:11434',
        status: new ProviderStatus('ollama')
      },
      groq: {
        apiKey: options.groqApiKey || process.env.GROQ_API_KEY,
        baseUrl: 'https://api.groq.com/openai/v1',
        status: new ProviderStatus('groq')
      }
    };

    this.modelCatalog = MODEL_CATALOG;
    this.allModels = ALL_MODELS;

    // Routing configuration
    this.defaultModel = options.defaultModel || 'gpt-4o';
    this.fallbackChain = options.fallbackChain || ['gpt-4o', 'claude-3-5-sonnet', 'gemini-1.5-flash'];
    this.routingStrategy = options.routingStrategy || 'intelligent'; // 'simple', 'cost', 'speed', 'intelligent'
    this.enableFallback = options.enableFallback !== false;
    this.maxRetries = options.maxRetries || 3;

    // Cost tracking
    this.costTracker = new CostTracker();
    if (options.dailyBudget) this.costTracker.setBudgets(options.dailyBudget, null);
    if (options.monthlyBudget) this.costTracker.setBudgets(null, options.monthlyBudget);

    // Provider selection weights
    this.providerWeights = options.providerWeights || {
      anthropic: 1,
      openai: 1,
      deepseek: 1,
      google: 1,
      ollama: 2, // Prefer local models when available
      groq: 1
    };

    // Cache
    this.responseCache = new Map();
    this.cacheTTL = options.cacheTTL || 3600000; // 1 hour default
  }

  // ============================================================================
  // ROUTING LOGIC
  // ============================================================================

  /**
   * Route a task to the best model
   */
  async route(context) {
    const requestContext = context instanceof RequestContext ? context : new RequestContext(context);
    
    this.emit('routing:start', requestContext);
    
    let decision = await this.makeRoutingDecision(requestContext);
    
    this.emit('routing:complete', { decision, context: requestContext });
    return decision;
  }

  /**
   * Make routing decision based on strategy
   */
  async makeRoutingDecision(context) {
    switch (this.routingStrategy) {
      case 'cost':
        return this.routeByCost(context);
      case 'speed':
        return this.routeBySpeed(context);
      case 'quality':
        return this.routeByQuality(context);
      case 'intelligent':
      default:
        return this.routeIntelligently(context);
    }
  }

  /**
   * Intelligent routing - consider all factors
   */
  async routeIntelligently(context) {
    const candidates = this.getCandidateModels(context);
    
    if (candidates.length === 0) {
      throw new ModelUnavailableError('no matching model');
    }

    // Score each candidate
    const scoredCandidates = candidates.map(model => ({
      model,
      score: this.calculateModelScore(model, context),
      reason: this.generateReason(model, context)
    }));

    // Sort by score
    scoredCandidates.sort((a, b) => b.score - a.score);

    const best = scoredCandidates[0];
    const alternatives = scoredCandidates.slice(1, 4).map(c => c.model);

    const decision = new RoutingDecision(
      best.model,
      best.reason,
      best.score,
      alternatives
    );

    decision.costEstimate = this.estimateCost(best.model, context);
    decision.latencyEstimate = this.estimateLatency(best.model);
    decision.routingStrategy = 'intelligent';

    return decision;
  }

  /**
   * Get candidate models that match requirements
   */
  getCandidateModels(context) {
    const candidates = [];

    for (const [provider, models] of Object.entries(this.modelCatalog)) {
      // Skip excluded providers
      if (context.excludedProviders.includes(provider)) continue;
      
      // Check provider is configured
      if (!this.isProviderConfigured(provider)) continue;
      
      // Check provider is healthy
      if (!this.providers[provider].status.isHealthy()) continue;

      for (const [modelId, model] of Object.entries(models)) {
        // Check capabilities
        const hasCapabilities = context.requiredCapabilities.every(cap => 
          model.supports.includes(cap)
        );
        if (!hasCapabilities) continue;

        // Check context length
        if (model.contextWindow < context.contextLength) continue;

        // Check budget
        const estimatedCost = this.estimateCost(modelId, context);
        if (!this.costTracker.canAfford(estimatedCost, provider)) continue;

        // Check priority requirements
        if (context.priority === 'urgent' && provider === 'ollama') continue;

        candidates.push(modelId);
      }
    }

    // If no candidates, try all providers regardless of capabilities
    if (candidates.length === 0) {
      for (const modelId of Object.keys(this.allModels)) {
        if (this.isProviderConfigured(this.allModels[modelId].provider)) {
          candidates.push(modelId);
        }
      }
    }

    return candidates;
  }

  /**
   * Calculate model score based on context
   */
  calculateModelScore(modelId, context) {
    const model = this.allModels[modelId];
    if (!model) return 0;

    let score = 50; // Base score

    // Task-specific scoring
    if (model.recommendedFor.includes(context.taskType)) {
      score += 30;
    }

    // Provider weight
    score += (this.providerWeights[model.provider] || 1) * 5;

    // Quality requirement adjustment
    if (context.qualityRequirement === 'quality' && model.strengths.includes('reasoning')) {
      score += 20;
    } else if (context.qualityRequirement === 'speed') {
      if (model.name.toLowerCase().includes('fast') || model.provider === 'groq') {
        score += 15;
      }
    }

    // Budget consideration
    const costScore = Math.max(0, 20 - model.cost.input * 5);
    score += costScore;

    // Latency consideration
    if (model.provider === 'ollama') {
      score += 5; // Local models are fast
    } else if (model.provider === 'groq') {
      score += 10; // Groq is fast
    }

    // Health penalty
    const providerStatus = this.providers[model.provider]?.status;
    if (providerStatus && !providerStatus.isHealthy()) {
      score -= 30;
    }

    return Math.min(100, score);
  }

  /**
   * Generate reason for model selection
   */
  generateReason(modelId, context) {
    const model = this.allModels[modelId];
    const reasons = [];

    if (model.recommendedFor.includes(context.taskType)) {
      reasons.push(`optimized for ${context.taskType}`);
    }

    if (model.strengths.includes('coding') && context.task.includes('code')) {
      reasons.push('strong coding capabilities');
    }

    if (model.strengths.includes('reasoning') && context.taskType === 'reasoning') {
      reasons.push('advanced reasoning');
    }

    if (model.cost.input < 1) {
      reasons.push('cost-effective');
    }

    if (model.provider === 'ollama') {
      reasons.push('privacy-focused (local)');
    }

    if (model.contextWindow >= context.contextLength) {
      reasons.push('sufficient context window');
    }

    return reasons.length > 0 ? reasons.join(', ') : 'balanced choice';
  }

  /**
   * Route by cost
   */
  routeByCost(context) {
    const candidates = this.getCandidateModels(context);
    
    // Sort by cost
    candidates.sort((a, b) => {
      const costA = this.allModels[a].cost.input;
      const costB = this.allModels[b].cost.input;
      return costA - costB;
    });

    const best = candidates[0];
    const alternatives = candidates.slice(1, 3);

    const decision = new RoutingDecision(
      best,
      'lowest cost option',
      100,
      alternatives
    );

    decision.costEstimate = this.estimateCost(best, context);
    decision.routingStrategy = 'cost';

    return decision;
  }

  /**
   * Route by speed
   */
  routeBySpeed(context) {
    const candidates = this.getCandidateModels(context);

    // Score by speed
    const speedScored = candidates.map(modelId => ({
      model: modelId,
      speedScore: this.calculateSpeedScore(modelId)
    }));

    speedScored.sort((a, b) => b.speedScore - a.speedScore);

    const best = speedScored[0].model;
    const alternatives = speedScored.slice(1, 3).map(s => s.model);

    const decision = new RoutingDecision(
      best,
      'fastest response time',
      100,
      alternatives
    );

    decision.routingStrategy = 'speed';

    return decision;
  }

  /**
   * Route by quality
   */
  routeByQuality(context) {
    const candidates = this.getCandidateModels(context);

    // Score by quality
    const qualityScored = candidates.map(modelId => ({
      model: modelId,
      qualityScore: this.calculateQualityScore(modelId)
    }));

    qualityScored.sort((a, b) => b.qualityScore - a.qualityScore);

    const best = qualityScored[0].model;
    const alternatives = qualityScored.slice(1, 3).map(s => s.model);

    const decision = new RoutingDecision(
      best,
      'highest quality output',
      100,
      alternatives
    );

    decision.routingStrategy = 'quality';

    return decision;
  }

  /**
   * Calculate speed score for a model
   */
  calculateSpeedScore(modelId) {
    const model = this.allModels[modelId];
    let score = 50;

    // Local models are fastest
    if (model.provider === 'ollama') score += 30;
    
    // Groq is fast
    if (model.provider === 'groq') score += 25;
    
    // Flash models are fast
    if (model.name.toLowerCase().includes('flash')) score += 15;

    // Haiku is fast
    if (model.name.toLowerCase().includes('haiku')) score += 15;

    return Math.min(100, score);
  }

  /**
   * Calculate quality score for a model
   */
  calculateQualityScore(modelId) {
    const model = this.allModels[modelId];
    let score = 50;

    // Opus is highest quality
    if (model.name.toLowerCase().includes('opus')) score += 40;
    
    // GPT-4 is high quality
    if (model.name.includes('GPT-4')) score += 30;
    
    // Sonnet is good quality
    if (model.name.includes('Sonnet')) score += 20;

    // Consider reasoning capabilities
    if (model.strengths.includes('reasoning')) score += 15;
    if (model.strengths.includes('nuanced')) score += 10;

    return Math.min(100, score);
  }

  // ============================================================================
  // EXECUTION
  // ============================================================================

  /**
   * Execute a request with automatic routing
   */
  async execute(task, options = {}) {
    const context = new RequestContext(task, options);
    const decision = await this.route(context);
    
    return await this.executeWithModel(decision.model, task, options);
  }

  /**
   * Execute with a specific model and fallback
   */
  async executeWithModel(modelId, task, options = {}) {
    const attempts = [modelId, ...this.fallbackChain.filter(m => m !== modelId)];
    let lastError = null;

    for (let i = 0; i < Math.min(attempts.length, this.maxRetries); i++) {
      const currentModel = attempts[i];
      
      try {
        const result = await this.callProvider(currentModel, task, options);
        this.emit('execution:success', { model: currentModel, result });
        return result;
      } catch (error) {
        lastError = error;
        
        if (error instanceof RateLimitError) {
          // Wait and retry with same model
          if (error.retryAfter) {
            await this.delay(error.retryAfter * 1000);
          }
          continue;
        }
        
        if (error instanceof ModelUnavailableError || error instanceof ProviderError) {
          this.providers[this.allModels[currentModel].provider]?.status.recordError(error);
          continue;
        }

        // Non-retryable error
        throw error;
      }
    }

    throw lastError;
  }

  /**
   * Call a specific provider
   */
  async callProvider(modelId, task, options = {}) {
    const model = this.allModels[modelId];
    if (!model) {
      throw new ModelUnavailableError(modelId);
    }

    const provider = this.providers[model.provider];
    if (!provider || !this.isProviderConfigured(model.provider)) {
      throw new ModelUnavailableError(modelId);
    }

    this.emit('request:start', { model: modelId, provider: model.provider });

    try {
      let result;
      const startTime = Date.now();

      switch (model.provider) {
        case 'anthropic':
          result = await this.callAnthropic(modelId, task, options);
          break;
        case 'openai':
          result = await this.callOpenAI(modelId, task, options);
          break;
        case 'deepseek':
          result = await this.callDeepSeek(modelId, task, options);
          break;
        case 'google':
          result = await this.callGoogle(modelId, task, options);
          break;
        case 'ollama':
          result = await this.callOllama(modelId, task, options);
          break;
        case 'groq':
          result = await this.callGroq(modelId, task, options);
          break;
        default:
          throw new Error(`Unknown provider: ${model.provider}`);
      }

      const latency = Date.now() - startTime;
      provider.status.recordSuccess(latency);

      // Track cost
      const cost = this.calculateActualCost(modelId, result);
      this.costTracker.recordCost(model.provider, cost);

      this.emit('request:complete', { model: modelId, latency, cost });

      return result;
    } catch (error) {
      provider.status.recordError(error);
      throw error;
    }
  }

  /**
   * Call Anthropic API
   */
  async callAnthropic(modelId, task, options = {}) {
    const provider = this.providers.anthropic;
    
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': provider.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-browser-warning-2024-11-08': 'ignore'
      },
      body: JSON.stringify({
        model: modelId,
        messages: [{ role: 'user', content: task }],
        max_tokens: options.maxTokens || 4096
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new ProviderError('anthropic', new Error(error.error?.message || response.statusText));
    }

    const data = await response.json();
    return {
      content: data.content?.[0]?.text || '',
      model: modelId,
      usage: data.usage,
      provider: 'anthropic'
    };
  }

  /**
   * Call OpenAI API
   */
  async callOpenAI(modelId, task, options = {}) {
    const provider = this.providers.openai;
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${provider.apiKey}`
      },
      body: JSON.stringify({
        model: modelId,
        messages: [{ role: 'user', content: task }],
        max_tokens: options.maxTokens || 4096
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new ProviderError('openai', new Error(error.error?.message || response.statusText));
    }

    const data = await response.json();
    return {
      content: data.choices?.[0]?.message?.content || '',
      model: modelId,
      usage: data.usage,
      provider: 'openai'
    };
  }

  /**
   * Call DeepSeek API
   */
  async callDeepSeek(modelId, task, options = {}) {
    const provider = this.providers.deepseek;
    
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${provider.apiKey}`
      },
      body: JSON.stringify({
        model: modelId,
        messages: [{ role: 'user', content: task }],
        max_tokens: options.maxTokens || 4096
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new ProviderError('deepseek', new Error(error.error?.message || response.statusText));
    }

    const data = await response.json();
    return {
      content: data.choices?.[0]?.message?.content || '',
      model: modelId,
      usage: data.usage,
      provider: 'deepseek'
    };
  }

  /**
   * Call Google Gemini API
   */
  async callGoogle(modelId, task, options = {}) {
    const provider = this.providers.google;
    
    const response = await fetch(
      `${provider.baseUrl}/models/${modelId}:generateContent?key=${provider.apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: task }] }],
          generationConfig: {
            maxOutputTokens: options.maxTokens || 8192
          }
        })
      }
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new ProviderError('google', new Error(error.error?.message || response.statusText));
    }

    const data = await response.json();
    return {
      content: data.candidates?.[0]?.content?.parts?.[0]?.text || '',
      model: modelId,
      usage: data.usageMetadata,
      provider: 'google'
    };
  }

  /**
   * Call Ollama API
   */
  async callOllama(modelId, task, options = {}) {
    const provider = this.providers.ollama;
    
    const response = await fetch(`${provider.baseUrl}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: modelId,
        prompt: task,
        stream: false,
        options: {
          num_predict: options.maxTokens || 2048
        }
      })
    });

    if (!response.ok) {
      throw new ProviderError('ollama', new Error(`HTTP ${response.status}`));
    }

    const data = await response.json();
    return {
      content: data.response || '',
      model: modelId,
      usage: { prompt_tokens: data.prompt_eval_count, completion_tokens: data.eval_count },
      provider: 'ollama'
    };
  }

  /**
   * Call Groq API
   */
  async callGroq(modelId, task, options = {}) {
    const provider = this.providers.groq;
    
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${provider.apiKey}`
      },
      body: JSON.stringify({
        model: modelId,
        messages: [{ role: 'user', content: task }],
        max_tokens: options.maxTokens || 4096
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new ProviderError('groq', new Error(error.error?.message || response.statusText));
    }

    const data = await response.json();
    return {
      content: data.choices?.[0]?.message?.content || '',
      model: modelId,
      usage: data.usage,
      provider: 'groq'
    };
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Check if a provider is configured
   */
  isProviderConfigured(provider) {
    const p = this.providers[provider];
    if (!p) return false;
    
    // Ollama doesn't need an API key
    if (provider === 'ollama') return true;
    
    // Other providers need API keys
    return Boolean(p.apiKey);
  }

  /**
   * Estimate cost for a model
   */
  estimateCost(modelId, context) {
    const model = this.allModels[modelId];
    if (!model) return 0;

    const inputTokens = Math.ceil(context.contextLength / 4);
    const outputTokens = Math.min(context.contextLength / 2, model.maxOutput);
    
    return (inputTokens / 1000000) * model.cost.input + 
           (outputTokens / 1000000) * model.cost.output;
  }

  /**
   * Calculate actual cost
   */
  calculateActualCost(modelId, result) {
    const model = this.allModels[modelId];
    if (!model || !result.usage) return 0;

    const inputTokens = result.usage.prompt_tokens || 0;
    const outputTokens = result.usage.completion_tokens || 0;
    
    return (inputTokens / 1000000) * model.cost.input + 
           (outputTokens / 1000000) * model.cost.output;
  }

  /**
   * Estimate latency
   */
  estimateLatency(modelId) {
    const model = this.allModels[modelId];
    if (!model) return 1000;

    // Base latency by provider
    const baseLatency = {
      anthropic: 2000,
      openai: 1500,
      deepseek: 2000,
      google: 1500,
      ollama: 500,
      groq: 300
    };

    return baseLatency[model.provider] || 2000;
  }

  /**
   * Delay helper
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get available models
   */
  getAvailableModels(options = {}) {
    const models = [];

    for (const [provider, p] of Object.entries(this.providers)) {
      if (!this.isProviderConfigured(provider)) continue;
      if (!p.status.isHealthy()) continue;

      const providerModels = this.modelCatalog[provider];
      if (providerModels) {
        for (const [modelId, model] of Object.entries(providerModels)) {
          models.push({
            id: modelId,
            ...model
          });
        }
      }
    }

    // Filter by capabilities if specified
    if (options.capability) {
      return models.filter(m => m.supports.includes(options.capability));
    }

    return models;
  }

  /**
   * Get provider status
   */
  getProviderStatus() {
    const status = {};
    for (const [name, provider] of Object.entries(this.providers)) {
      status[name] = provider.status.toJSON();
    }
    return status;
  }

  /**
   * Get cost summary
   */
  getCostSummary() {
    this.costTracker.resetIfNeeded();
    return this.costTracker.toJSON();
  }

  /**
   * Get router statistics
   */
  getStats() {
    return {
      providers: Object.keys(this.providers).length,
      configuredProviders: Object.values(this.providers).filter(p => this.isProviderConfigured(p.name)).length,
      availableModels: this.getAvailableModels().length,
      totalModels: Object.keys(this.allModels).length,
      routingStrategy: this.routingStrategy,
      costSummary: this.getCostSummary()
    };
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  LLMRouter,
  MODEL_CATALOG,
  ALL_MODELS,
  RequestContext,
  RoutingDecision,
  RoutingStrategy: {
    SIMPLE: 'simple',
    COST: 'cost',
    SPEED: 'speed',
    QUALITY: 'quality',
    INTELLIGENT: 'intelligent'
  },
  RouterError,
  ModelUnavailableError,
  ProviderError,
  RateLimitError
};
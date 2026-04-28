/**
 * SkillRegistry - Composable workflow abstraction for agent capabilities
 * Enables skill registration, composition, and reusable workflow templates
 */

import { getLLMRouter } from './LLMRouter';
import ExecutionEngine from './ExecutionEngine';

/**
 * Skill class - represents a single executable capability
 */
class Skill {
  constructor(id, config = {}) {
    this.id = id;
    this.name = config.name || id;
    this.description = config.description || '';
    this.category = config.category || 'general';
    this.version = config.version || '1.0.0';
    
    // Execution configuration
    this.handler = config.handler || (() => Promise.resolve({ success: true }));
    this.parameters = config.parameters || [];
    this.requiredPermissions = config.requiredPermissions || [];
    
    // Metadata
    this.tags = config.tags || [];
    this.author = config.author || 'system';
    this.createdAt = config.createdAt || Date.now();
    this.lastUsedAt = null;
    this.usageCount = 0;
    
    // Quality metrics
    this.successRate = 1.0;
    this.avgDuration = 0;
    this.totalExecutions = 0;
    
    // Dependencies on other skills
    this.dependencies = config.dependencies || [];
  }

  /**
   * Execute this skill with provided context
   */
  async execute(context = {}, params = {}) {
    const startTime = Date.now();
    this.lastUsedAt = Date.now();
    this.totalExecutions++;

    try {
      // Merge context with params
      const mergedContext = { ...context, ...params };

      // Validate required parameters
      const validationResult = this.validateParams(params);
      if (!validationResult.valid) {
        throw new Error(`Parameter validation failed: ${validationResult.errors.join(', ')}`);
      }

      // Execute the handler
      const result = await this.handler(mergedContext, {
        skillId: this.id,
        params,
        registry: skillRegistry
      });

      // Update metrics
      const duration = Date.now() - startTime;
      this.avgDuration = (this.avgDuration * (this.totalExecutions - 1) + duration) / this.totalExecutions;

      return {
        success: true,
        skillId: this.id,
        result,
        duration
      };

    } catch (error) {
      this.successRate = (this.successRate * (this.totalExecutions - 1) + 0) / this.totalExecutions;

      return {
        success: false,
        skillId: this.id,
        error: error.message,
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * Validate execution parameters
   */
  validateParams(params) {
    const errors = [];

    this.parameters.forEach(param => {
      if (param.required && !(param.name in params)) {
        errors.push(`Missing required parameter: ${param.name}`);
      } else if (param.name in params) {
        const value = params[param.name];
        
        // Type validation
        if (param.type && typeof value !== param.type) {
          errors.push(`Parameter "${param.name}" must be of type ${param.type}`);
        }
        
        // Enum validation
        if (param.enum && !param.enum.includes(value)) {
          errors.push(`Parameter "${param.name}" must be one of: ${param.enum.join(', ')}`);
        }
        
        // Pattern validation
        if (param.pattern && !param.pattern.test(String(value))) {
          errors.push(`Parameter "${param.name}" does not match required pattern`);
        }
      }
    });

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Get skill metadata
   */
  getMetadata() {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      category: this.category,
      version: this.version,
      parameters: this.parameters,
      tags: this.tags,
      usageCount: this.totalExecutions,
      successRate: this.successRate.toFixed(2),
      avgDuration: Math.round(this.avgDuration)
    };
  }
}

/**
 * SkillTemplate - reusable workflow pattern for skill composition
 */
class SkillTemplate {
  constructor(id, config = {}) {
    this.id = id;
    this.name = config.name || id;
    this.description = config.description || '';
    
    // Template composition
    this.steps = config.steps || []; // Array of step definitions
    this.parallel = config.parallel || false;
    
    // Parameter bindings
    this.inputSchema = config.inputSchema || {};
    this.outputSchema = config.outputSchema || {};
    
    // Conditional logic
    this.condition = config.condition || null;
    this.onError = config.onError || 'stop';
    
    // Metadata
    this.tags = config.tags || [];
    this.author = config.author || 'system';
    this.createdAt = Date.now();
  }

  /**
   * Generate a Skill from this template
   */
  toSkill(overrides = {}) {
    const skillId = overrides.id || `${this.id}-${Date.now()}`;
    
    const handler = async (context, options) => {
      const { registry } = options;
      const results = [];

      for (const step of this.steps) {
        // Check condition if exists
        if (step.condition && !evaluateCondition(step.condition, context)) {
          continue;
        }

        try {
          let stepResult;

          if (step.skillId) {
            // Execute a registered skill
            const skill = registry.getSkill(step.skillId);
            if (!skill) {
              throw new Error(`Skill not found: ${step.skillId}`);
            }

            // Bind parameters
            const boundParams = bindParameters(step.params || {}, context);
            stepResult = await skill.execute(context, boundParams);

          } else if (step.action) {
            // Execute inline action
            stepResult = await step.action(context, {
              params: bindParameters(step.params || {}, context),
              stepId: step.id
            });
          }

          results.push({ step: step.id, ...stepResult });

          // Handle step error
          if (!stepResult.success && this.onError === 'stop') {
            throw new Error(`Step "${step.id}" failed: ${stepResult.error}`);
          }

        } catch (error) {
          results.push({ step: step.id, success: false, error: error.message });
          
          if (this.onError === 'stop') {
            throw error;
          }
        }
      }

      return {
        templateId: this.id,
        steps: results,
        success: results.every(r => r.success)
      };
    };

    return new Skill(skillId, {
      name: overrides.name || this.name,
      description: this.description,
      handler,
      parameters: Object.values(this.inputSchema),
      tags: [...this.tags, 'template'],
      ...overrides
    });
  }
}

/**
 * Parameter binding utilities
 */
function bindParameters(params, context) {
  const bound = {};

  Object.entries(params).forEach(([key, value]) => {
    if (typeof value === 'string' && value.startsWith('$')) {
      // Reference to context variable
      const path = value.slice(1).split('.');
      let resolved = context;
      
      for (const segment of path) {
        resolved = resolved?.[segment];
      }
      
      bound[key] = resolved ?? null;
    } else {
      bound[key] = value;
    }
  });

  return bound;
}

function evaluateCondition(condition, context) {
  if (!condition) return true;

  const { field, operator, value } = condition;
  const fieldValue = context[field];

  switch (operator) {
    case 'equals':
      return fieldValue === value;
    case 'notEquals':
      return fieldValue !== value;
    case 'contains':
      return String(fieldValue).includes(value);
    case 'greaterThan':
      return fieldValue > value;
    case 'lessThan':
      return fieldValue < value;
    case 'exists':
      return fieldValue !== undefined && fieldValue !== null;
    case 'notExists':
      return fieldValue === undefined || fieldValue === null;
    default:
      return true;
  }
}

/**
 * SkillRegistry - central registry for skills and templates
 */
class SkillRegistry {
  constructor(options = {}) {
    this.skills = new Map();
    this.templates = new Map();
    this.categories = new Map();
    this.aliases = new Map();

    this.options = {
      maxSkills: options.maxSkills || 100,
      enableVersioning: options.enableVersioning !== false,
      verbose: options.verbose || false
    };

    // Initialize default skill library
    this.initializeDefaultSkills();
  }

  /**
   * Register a new skill
   */
  register(skill) {
    if (this.skills.size >= this.options.maxSkills) {
      throw new Error(`Maximum skills (${this.options.maxSkills}) reached`);
    }

    if (this.skills.has(skill.id)) {
      // Version handling
      if (this.options.enableVersioning) {
        const existing = this.skills.get(skill.id);
        if (existing.version !== skill.version) {
          // Store with version suffix
          const versionedId = `${skill.id}:${skill.version}`;
          this.skills.set(versionedId, skill);
          
          if (this.options.verbose) {
            console.log(`[SkillRegistry] Registered versioned skill: ${versionedId}`);
          }
        }
      } else {
        throw new Error(`Skill "${skill.id}" already registered`);
      }
    } else {
      this.skills.set(skill.id, skill);
    }

    // Update category index
    if (!this.categories.has(skill.category)) {
      this.categories.set(skill.category, []);
    }
    this.categories.get(skill.category).push(skill.id);

    if (this.options.verbose) {
      console.log(`[SkillRegistry] Registered skill: ${skill.id}`);
    }

    return this;
  }

  /**
   * Register a skill template
   */
  registerTemplate(template) {
    this.templates.set(template.id, template);

    if (this.options.verbose) {
      console.log(`[SkillRegistry] Registered template: ${template.id}`);
    }

    return this;
  }

  /**
   * Create skill from template and register it
   */
  createFromTemplate(templateId, overrides = {}) {
    const template = this.templates.get(templateId);

    if (!template) {
      throw new Error(`Template "${templateId}" not found`);
    }

    const skill = template.toSkill(overrides);
    this.register(skill);

    return skill;
  }

  /**
   * Get a skill by ID
   */
  getSkill(id) {
    return this.skills.get(id) || null;
  }

  /**
   * Get skill by alias
   */
  getSkillByAlias(alias) {
    const skillId = this.aliases.get(alias);
    return skillId ? this.skills.get(skillId) : null;
  }

  /**
   * Find skills matching criteria
   */
  findSkills(criteria = {}) {
    let results = Array.from(this.skills.values());

    if (criteria.category) {
      results = results.filter(s => s.category === criteria.category);
    }

    if (criteria.tags && criteria.tags.length > 0) {
      results = results.filter(s =>
        criteria.tags.some(tag => s.tags.includes(tag))
      );
    }

    if (criteria.search) {
      const search = criteria.search.toLowerCase();
      results = results.filter(s =>
        s.name.toLowerCase().includes(search) ||
        s.description.toLowerCase().includes(search)
      );
    }

    return results;
  }

  /**
   * Create an alias for a skill
   */
  alias(alias, skillId) {
    if (!this.skills.has(skillId)) {
      throw new Error(`Skill "${skillId}" not found`);
    }

    this.aliases.set(alias, skillId);
    return this;
  }

  /**
   * Execute a skill by ID with context
   */
  async execute(skillId, context = {}, params = {}) {
    const skill = this.skills.get(skillId) || this.getSkillByAlias(skillId);

    if (!skill) {
      throw new Error(`Skill not found: ${skillId}`);
    }

    // Check dependencies
    for (const depId of skill.dependencies) {
      if (!this.skills.has(depId)) {
        throw new Error(`Missing dependency: ${depId}`);
      }
    }

    const executionEngine = new ExecutionEngine();
    return executionEngine.run(
      { name: skill.name, type: skill.category },
      () => skill.execute(context, params)
    );
  }

  /**
   * Execute a workflow from multiple skills
   */
  async executeWorkflow(workflow, context = {}) {
    if (workflow.parallel) {
      // Parallel execution
      const promises = workflow.steps.map(step => this.execute(step.skillId, context, step.params || {}));
      const results = await Promise.all(promises);
      
      return {
        success: results.every(r => r.success),
        results,
        parallel: true
      };
    } else {
      // Sequential execution
      const results = [];
      let currentContext = { ...context };

      for (const step of workflow.steps) {
        const result = await this.execute(step.skillId, currentContext, step.params || {});
        results.push(result);

        // Update context with step output
        if (result.success && result.result) {
          currentContext = {
            ...currentContext,
            [step.outputAs || step.skillId]: result.result
          };
        }

        // Stop on failure unless configured otherwise
        if (!result.success && workflow.stopOnError !== false) {
          return {
            success: false,
            results,
            failedAt: step.skillId
          };
        }
      }

      return {
        success: results.every(r => r.success),
        results
      };
    }
  }

  /**
   * Get registry statistics
   */
  getStats() {
    return {
      totalSkills: this.skills.size,
      totalTemplates: this.templates.size,
      totalAliases: this.aliases.size,
      categories: Array.from(this.categories.keys()),
      categoryCounts: Object.fromEntries(
        Array.from(this.categories.entries()).map(([k, v]) => [k, v.length])
      ),
      topSkills: Array.from(this.skills.values())
        .sort((a, b) => b.usageCount - a.usageCount)
        .slice(0, 5)
        .map(s => ({ id: s.id, usage: s.usageCount, successRate: s.successRate.toFixed(2) }))
    };
  }

  /**
   * Remove a skill from the registry
   */
  remove(skillId) {
    const skill = this.skills.get(skillId);
    
    if (skill) {
      // Remove from category
      const categorySkills = this.categories.get(skill.category);
      if (categorySkills) {
        const index = categorySkills.indexOf(skillId);
        if (index > -1) {
          categorySkills.splice(index, 1);
        }
      }

      // Remove aliases
      for (const [alias, id] of this.aliases) {
        if (id === skillId) {
          this.aliases.delete(alias);
        }
      }

      this.skills.delete(skillId);
      return true;
    }

    return false;
  }

  /**
   * Export registry data
   */
  export() {
    return {
      skills: Array.from(this.skills.values()).map(s => s.getMetadata()),
      templates: Array.from(this.templates.values()).map(t => ({
        id: t.id,
        name: t.name,
        description: t.description,
        steps: t.steps
      })),
      aliases: Object.fromEntries(this.aliases)
    };
  }

  /**
   * Clear all skills and templates
   */
  clear() {
    this.skills.clear();
    this.templates.clear();
    this.categories.clear();
    this.aliases.clear();
  }

  /**
   * Initialize default skill library
   */
  initializeDefaultSkills() {
    // Code analysis skill
    this.register(new Skill('code-analysis', {
      name: 'Code Analysis',
      description: 'Analyze code for quality, complexity, and potential issues',
      category: 'analysis',
      tags: ['code', 'analysis', 'quality'],
      handler: async (context) => {
        const { code, language } = context;
        const llmRouter = getLLMRouter();
        const response = await llmRouter.chat({
          prompt: `Analyze this ${language || 'code'}:\n\n${code}\n\nProvide: complexity score, potential bugs, improvement suggestions`,
          taskType: 'analysis',
          priority: 'balanced'
        });
        return { analysis: response.content };
      },
      parameters: [
        { name: 'code', type: 'string', required: true },
        { name: 'language', type: 'string', required: false }
      ]
    }));

    // Code generation skill
    this.register(new Skill('code-generation', {
      name: 'Code Generation',
      description: 'Generate code based on specifications',
      category: 'generation',
      tags: ['code', 'generation', 'development'],
      handler: async (context) => {
        const { specification, language } = context;
        const llmRouter = getLLMRouter();
        const response = await llmRouter.chat({
          prompt: `Generate ${language || 'code'} for:\n\n${specification}\n\nProvide clean, well-documented code.`,
          taskType: 'code_generation',
          priority: 'high_quality'
        });
        return { code: response.content };
      },
      parameters: [
        { name: 'specification', type: 'string', required: true },
        { name: 'language', type: 'string', required: false }
      ]
    }));

    // Research skill
    this.register(new Skill('research', {
      name: 'Research',
      description: 'Research topics and synthesize information',
      category: 'research',
      tags: ['research', 'information', 'analysis'],
      handler: async (context) => {
        const { topic, depth } = context;
        const llmRouter = getLLMRouter();
        const response = await llmRouter.chat({
          prompt: `Research "${topic}" ${depth || 'standard'} depth. Provide comprehensive findings with sources.`,
          taskType: 'research',
          priority: 'balanced'
        });
        return { findings: response.content };
      },
      parameters: [
        { name: 'topic', type: 'string', required: true },
        { name: 'depth', type: 'string', required: false, enum: ['brief', 'standard', 'comprehensive'] }
      ]
    }));

    // Documentation skill
    this.register(new Skill('documentation', {
      name: 'Documentation',
      description: 'Generate documentation for code or concepts',
      category: 'documentation',
      tags: ['docs', 'generation'],
      handler: async (context) => {
        const { target, format } = context;
        const llmRouter = getLLMRouter();
        const response = await llmRouter.chat({
          prompt: `Generate ${format || 'markdown'} documentation for:\n\n${target}`,
          taskType: 'analysis',
          priority: 'balanced'
        });
        return { documentation: response.content };
      },
      parameters: [
        { name: 'target', type: 'string', required: true },
        { name: 'format', type: 'string', required: false, enum: ['markdown', 'html', 'json'] }
      ]
    }));

    // Create default templates
    this.registerTemplate(new SkillTemplate('code-review-workflow', {
      name: 'Code Review Workflow',
      description: 'Complete code review from analysis to report',
      steps: [
        { id: 'analyze', skillId: 'code-analysis', params: { code: '$code', language: '$language' } },
        { id: 'document', skillId: 'documentation', params: { target: '$analysis', format: 'markdown' } }
      ]
    }));

    this.registerTemplate(new SkillTemplate('development-pipeline', {
      name: 'Development Pipeline',
      description: 'Full development workflow from spec to documentation',
      steps: [
        { id: 'plan', skillId: 'code-generation', params: { specification: '$spec', language: 'planning' } },
        { id: 'implement', skillId: 'code-generation', params: { specification: '$spec', language: '$language' } },
        { id: 'document', skillId: 'documentation', params: { target: '$code', format: 'markdown' } }
      ]
    }));
  }
}

// Export singleton instance
export default SkillRegistry;
export const skillRegistry = new SkillRegistry();

// Export classes for external use
export { Skill, SkillTemplate };
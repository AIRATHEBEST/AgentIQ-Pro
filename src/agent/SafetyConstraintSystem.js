/**
 * SafetyConstraintSystem.js
 * 
 * Safety and constraints with:
 * - Hard limits (steps, cost, time)
 * - Permission system for tools
 * - Risk detection
 * - Sandboxed boundaries
 * 
 * FEATURE #10: Safety & Constraint System
 */

class SafetyConstraintSystem {
  constructor() {
    this.constraints = {};
    this.permissions = {};
    this.riskScores = [];
    this.blockedActions = [];
  }

  /**
   * Set hard limits for execution
   */
  setHardLimits(execution) {
    return {
      maxSteps: execution.maxSteps || 50,
      maxCost: execution.maxCost || 100, // tokens or dollars
      maxDuration: execution.maxDuration || 3600000, // milliseconds
      maxRetries: execution.maxRetries || 3,
      maxToolCalls: execution.maxToolCalls || 100,
    };
  }

  /**
   * Set tool permissions
   */
  setToolPermissions(tool, permissions) {
    this.permissions[tool.id] = {
      tool,
      canExecute: permissions.canExecute !== false,
      allowedInputs: permissions.allowedInputs || [], // e.g., ['*.pdf'] for file_reader
      deniedInputs: permissions.deniedInputs || [], // Blocklist
      sandboxLevel: permissions.sandboxLevel || 'medium', // low, medium, high
      rateLimit: permissions.rateLimit || null, // calls per hour
      requiresApproval: permissions.requiresApproval || false,
    };
  }

  /**
   * Check if action is permitted
   */
  canExecuteAction(action, context = {}) {
    const perm = this.permissions[action.toolId];

    if (!perm || !perm.canExecute) {
      return { allowed: false, reason: 'Tool not permitted' };
    }

    // Check input restrictions
    if (perm.allowedInputs.length > 0) {
      const input = JSON.stringify(action.input);
      const isAllowed = perm.allowedInputs.some(pattern => this.matchesPattern(input, pattern));
      if (!isAllowed) {
        return { allowed: false, reason: 'Input not in allowed list' };
      }
    }

    // Check denied inputs
    if (perm.deniedInputs.length > 0) {
      const input = JSON.stringify(action.input);
      const isDenied = perm.deniedInputs.some(pattern => this.matchesPattern(input, pattern));
      if (isDenied) {
        return { allowed: false, reason: 'Input in denied list' };
      }
    }

    // Check rate limit
    if (perm.rateLimit) {
      const recentCalls = this.countRecentCalls(action.toolId);
      if (recentCalls >= perm.rateLimit) {
        return { allowed: false, reason: `Rate limit exceeded (${perm.rateLimit}/hour)` };
      }
    }

    // Check if approval required
    if (perm.requiresApproval) {
      return { allowed: 'pending_approval', reason: 'Requires manual approval' };
    }

    return { allowed: true };
  }

  /**
   * Detect risky actions
   */
  detectRisk(action, context = {}) {
    let riskScore = 0;
    const risks = [];

    // High-risk tool patterns
    const highRiskTools = ['execute_code', 'delete_files', 'modify_system'];
    if (highRiskTools.includes(action.toolId)) {
      riskScore += 40;
      risks.push('High-risk tool');
    }

    // Check for suspicious patterns
    if (JSON.stringify(action.input).includes('password') || JSON.stringify(action.input).includes('apikey')) {
      riskScore += 30;
      risks.push('Potential credential exposure');
    }

    // Large batch operations
    if (action.input?.count > 1000) {
      riskScore += 20;
      risks.push('Large batch operation');
    }

    // Unknown context
    if (!context.taskDescription) {
      riskScore += 10;
      risks.push('Unknown task context');
    }

    return {
      riskScore,
      riskLevel: riskScore < 30 ? 'low' : riskScore < 60 ? 'medium' : 'high',
      risks,
      recommended: riskScore > 50 ? 'require_approval' : 'allow',
    };
  }

  /**
   * Enforce hard limits
   */
  enforceHardLimits(execution, limits) {
    const violations = [];

    if (execution.stepCount > limits.maxSteps) {
      violations.push(`Step limit exceeded (${execution.stepCount}/${limits.maxSteps})`);
    }

    if (execution.costAccumulated > limits.maxCost) {
      violations.push(`Cost limit exceeded (${execution.costAccumulated}/${limits.maxCost})`);
    }

    if (execution.duration > limits.maxDuration) {
      violations.push(`Time limit exceeded (${execution.duration}/${limits.maxDuration}ms)`);
    }

    if (execution.toolCalls > limits.maxToolCalls) {
      violations.push(`Tool call limit exceeded (${execution.toolCalls}/${limits.maxToolCalls})`);
    }

    return {
      withinLimits: violations.length === 0,
      violations,
    };
  }

  /**
   * Create sandbox for tool execution
   */
  createSandbox(toolId) {
    const perm = this.permissions[toolId];
    const sandboxLevel = perm?.sandboxLevel || 'medium';

    return {
      toolId,
      sandboxLevel,
      allowedResources: this.getAllowedResources(sandboxLevel),
      blockedResources: this.getBlockedResources(sandboxLevel),
      timeout: sandboxLevel === 'high' ? 5000 : 30000,
      memoryLimit: sandboxLevel === 'high' ? '100MB' : '500MB',
    };
  }

  /**
   * Get allowed resources by sandbox level
   */
  getAllowedResources(level) {
    const resources = {
      low: ['stdout', 'stderr'],
      medium: ['stdout', 'stderr', 'filesystem_read'],
      high: ['stdout', 'stderr', 'filesystem_read', 'http_get'],
    };
    return resources[level] || [];
  }

  /**
   * Get blocked resources by sandbox level
   */
  getBlockedResources(level) {
    const resources = {
      low: ['filesystem', 'network', 'process', 'system'],
      medium: ['filesystem_write', 'network', 'process', 'system'],
      high: ['filesystem_write', 'process', 'system'],
    };
    return resources[level] || [];
  }

  /**
   * Pattern matching helper
   */
  matchesPattern(text, pattern) {
    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
    return regex.test(text);
  }

  /**
   * Count recent tool calls
   */
  countRecentCalls(toolId) {
    const oneHourAgo = Date.now() - 3600000;
    return this.blockedActions.filter(a => a.toolId === toolId && a.timestamp > oneHourAgo).length;
  }

  /**
   * Log blocked action
   */
  logBlockedAction(action, reason) {
    this.blockedActions.push({
      ...action,
      reason,
      timestamp: Date.now(),
    });
  }

  /**
   * Get safety report
   */
  getSafetyReport() {
    return {
      totalConstraints: Object.keys(this.constraints).length,
      totalPermissions: Object.keys(this.permissions).length,
      blockedActionsCount: this.blockedActions.length,
      averageRiskScore: this.riskScores.length > 0
        ? this.riskScores.reduce((a, b) => a + b, 0) / this.riskScores.length
        : 0,
    };
  }
}

export default SafetyConstraintSystem;

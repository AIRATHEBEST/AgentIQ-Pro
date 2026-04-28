/**
 * PolicyEngine.js - Policy Management and Rules Engine for AgentIQ Pro
 * Handles policy definitions, permission management, rule evaluation, and audit logging
 */

import { EventEmitter } from 'events';

// Policy Engine Constants
export const POLICY_TYPES = {
  ACCESS_CONTROL: 'access_control',
  RATE_LIMITING: 'rate_limiting',
  CONTENT_FILTERING: 'content_filtering',
  DATA_PRIVACY: 'data_privacy',
  SECURITY: 'security',
  COMPLIANCE: 'compliance',
  CUSTOM: 'custom'
};

export const POLICY_ACTIONS = {
  ALLOW: 'allow',
  DENY: 'deny',
  LOG: 'log',
  WARN: 'warn',
  CHALLENGE: 'challenge',
  REDIRECT: 'redirect'
};

export const POLICY_EFFECTS = {
  PERMIT: 'permit',
  DENY: 'deny',
  CONDITIONAL: 'conditional'
};

export const AUDIT_LEVELS = {
  INFO: 'info',
  WARNING: 'warning',
  CRITICAL: 'critical',
  EMERGENCY: 'emergency'
};

export const SUBJECT_TYPES = {
  USER: 'user',
  AGENT: 'agent',
  SERVICE: 'service',
  SYSTEM: 'system',
  EXTERNAL: 'external'
};

export const RESOURCE_TYPES = {
  API: 'api',
  DATA: 'data',
  FILE: 'file',
  FUNCTION: 'function',
  MODEL: 'model',
  AGENT: 'agent',
  WORKFLOW: 'workflow',
  DOCKER: 'docker',
  BROWSER: 'browser'
};

/**
 * Policy Definition
 */
export class Policy {
  constructor(config = {}) {
    this.id = config.id || PolicyEngine.generateId('policy');
    this.name = config.name || 'Unnamed Policy';
    this.description = config.description || '';
    this.type = config.type || POLICY_TYPES.CUSTOM;
    this.version = config.version || '1.0.0';
    this.enabled = config.enabled !== undefined ? config.enabled : true;
    this.priority = config.priority || 0;
    this.effect = config.effect || POLICY_EFFECTS.PERMIT;
    this.conditions = config.conditions || [];
    this.actions = config.actions || [POLICY_ACTIONS.ALLOW];
    this.resources = config.resources || ['*'];
    this.subjects = config.subjects || ['*'];
    this.metadata = config.metadata || {};
    this.createdAt = config.createdAt || new Date().toISOString();
    this.updatedAt = config.updatedAt || new Date().toISOString();
    this.createdBy = config.createdBy || 'system';
    this.tags = config.tags || [];
    this.expiryDate = config.expiryDate || null;
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      type: this.type,
      version: this.version,
      enabled: this.enabled,
      priority: this.priority,
      effect: this.effect,
      conditions: this.conditions,
      actions: this.actions,
      resources: this.resources,
      subjects: this.subjects,
      metadata: this.metadata,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      createdBy: this.createdBy,
      tags: this.tags,
      expiryDate: this.expiryDate
    };
  }

  isExpired() {
    if (!this.expiryDate) return false;
    return new Date(this.expiryDate) < new Date();
  }

  isActive() {
    return this.enabled && !this.isExpired();
  }
}

/**
 * Rule Definition
 */
export class Rule {
  constructor(config = {}) {
    this.id = config.id || PolicyEngine.generateId('rule');
    this.policyId = config.policyId || null;
    this.name = config.name || 'Unnamed Rule';
    this.condition = config.condition || {};
    this.conditionType = config.conditionType || 'AND';
    this.effect = config.effect || POLICY_EFFECTS.PERMIT;
    this.action = config.action || POLICY_ACTIONS.ALLOW;
    this.conditions = config.conditions || [];
  }

  toJSON() {
    return {
      id: this.id,
      policyId: this.policyId,
      name: this.name,
      condition: this.condition,
      conditionType: this.conditionType,
      effect: this.effect,
      action: this.action,
      conditions: this.conditions
    };
  }
}

/**
 * Audit Log Entry
 */
export class AuditLogEntry {
  constructor(config = {}) {
    this.id = config.id || PolicyEngine.generateId('audit');
    this.timestamp = config.timestamp || new Date().toISOString();
    this.policyId = config.policyId || null;
    this.ruleId = config.ruleId || null;
    this.subject = config.subject || {};
    this.resource = config.resource || {};
    this.action = config.action || 'unknown';
    this.effect = config.effect || POLICY_EFFECTS.PERMIT;
    this.decision = config.decision || null;
    this.level = config.level || AUDIT_LEVELS.INFO;
    this.message = config.message || '';
    this.context = config.context || {};
    this.ipAddress = config.ipAddress || null;
    this.userAgent = config.userAgent || null;
    this.metadata = config.metadata || {};
  }

  toJSON() {
    return {
      id: this.id,
      timestamp: this.timestamp,
      policyId: this.policyId,
      ruleId: this.ruleId,
      subject: this.subject,
      resource: this.resource,
      action: this.action,
      effect: this.effect,
      decision: this.decision,
      level: this.level,
      message: this.message,
      context: this.context,
      ipAddress: this.ipAddress,
      userAgent: this.userAgent,
      metadata: this.metadata
    };
  }
}

/**
 * Subject (User/Agent/Service)
 */
export class Subject {
  constructor(config = {}) {
    this.id = config.id || PolicyEngine.generateId('subject');
    this.type = config.type || SUBJECT_TYPES.USER;
    this.name = config.name || '';
    this.attributes = config.attributes || {};
    this.roles = config.roles || [];
    this.permissions = config.permissions || [];
    this.groups = config.groups || [];
    this.metadata = config.metadata || {};
    this.trustLevel = config.trustLevel || 0.5;
    this.isActive = config.isActive !== undefined ? config.isActive : true;
    this.lastActivity = config.lastActivity || null;
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      name: this.name,
      attributes: this.attributes,
      roles: this.roles,
      permissions: this.permissions,
      groups: this.groups,
      metadata: this.metadata,
      trustLevel: this.trustLevel,
      isActive: this.isActive,
      lastActivity: this.lastActivity
    };
  }

  hasRole(role) {
    return this.roles.includes(role);
  }

  hasPermission(permission) {
    return this.permissions.includes(permission) || this.permissions.includes('*');
  }

  belongsToGroup(group) {
    return this.groups.includes(group);
  }
}

/**
 * Resource Definition
 */
export class Resource {
  constructor(config = {}) {
    this.id = config.id || PolicyEngine.generateId('resource');
    this.type = config.type || RESOURCE_TYPES.DATA;
    this.name = config.name || '';
    this.path = config.path || '';
    this.owner = config.owner || null;
    this.attributes = config.attributes || {};
    this.sensitivity = config.sensitivity || 'medium';
    this.metadata = config.metadata || {};
    this.acl = config.acl || {};
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      name: this.name,
      path: this.path,
      owner: this.owner,
      attributes: this.attributes,
      sensitivity: this.sensitivity,
      metadata: this.metadata,
      acl: this.acl
    };
  }

  getAclForSubject(subjectId) {
    return this.acl[subjectId] || this.acl['*'] || { read: false, write: false, execute: false };
  }
}

/**
 * Permission Definition
 */
export class Permission {
  constructor(config = {}) {
    this.id = config.id || PolicyEngine.generateId('permission');
    this.name = config.name || '';
    this.description = config.description || '';
    this.resourceType = config.resourceType || RESOURCE_TYPES.DATA;
    this.actions = config.actions || [];
    this.conditions = config.conditions || [];
    this.metadata = config.metadata || {};
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      resourceType: this.resourceType,
      actions: this.actions,
      conditions: this.conditions,
      metadata: this.metadata
    };
  }
}

/**
 * Role Definition
 */
export class Role {
  constructor(config = {}) {
    this.id = config.id || PolicyEngine.generateId('role');
    this.name = config.name || '';
    this.description = config.description || '';
    this.permissions = config.permissions || [];
    this.parentRoles = config.parentRoles || [];
    this.metadata = config.metadata || {};
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      permissions: this.permissions,
      parentRoles: this.parentRoles,
      metadata: this.metadata
    };
  }
}

/**
 * Policy Version
 */
export class PolicyVersion {
  constructor(config = {}) {
    this.version = config.version || '1.0.0';
    this.policy = config.policy || null;
    this.changelog = config.changelog || '';
    this.createdAt = config.createdAt || new Date().toISOString();
    this.createdBy = config.createdBy || 'system';
    this.isActive = config.isActive !== undefined ? config.isActive : false;
  }

  toJSON() {
    return {
      version: this.version,
      policy: this.policy ? this.policy.toJSON() : null,
      changelog: this.changelog,
      createdAt: this.createdAt,
      createdBy: this.createdBy,
      isActive: this.isActive
    };
  }
}

/**
 * Main PolicyEngine Class
 */
class PolicyEngine extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = {
      storagePath: config.storagePath || './data/policies',
      maxAuditLogs: config.maxAuditLogs || 10000,
      logRetention: config.logRetention || 30,
      enableAuditLogging: config.enableAuditLogging !== false,
      enableVersioning: config.enableVersioning !== false,
      cacheEnabled: config.cacheEnabled !== false,
      cacheExpiry: config.cacheExpiry || 300000,
      ...config
    };

    this.policies = new Map();
    this.rules = new Map();
    this.auditLogs = [];
    this.subjects = new Map();
    this.resources = new Map();
    this.permissions = new Map();
    this.roles = new Map();
    this.policyVersions = new Map();
    this.cache = new Map();
    this.cacheExpiry = new Map();

    this.stats = {
      totalPolicies: 0,
      totalRules: 0,
      totalAuditLogs: 0,
      decisionsMade: 0,
      allowCount: 0,
      denyCount: 0,
      warnCount: 0,
      startTime: new Date().toISOString()
    };

    this.initializeDefaultPolicies();
  }

  /**
   * Initialize default policies
   */
  initializeDefaultPolicies() {
    // Default admin policy
    const adminPolicy = new Policy({
      id: 'policy_admin',
      name: 'Administrator Access',
      description: 'Full access for administrators',
      type: POLICY_TYPES.ACCESS_CONTROL,
      effect: POLICY_EFFECTS.PERMIT,
      subjects: ['role:admin'],
      resources: ['*'],
      actions: [POLICY_ACTIONS.ALLOW]
    });
    this.policies.set(adminPolicy.id, adminPolicy);

    // Default rate limiting policy
    const rateLimitPolicy = new Policy({
      id: 'policy_rate_limit',
      name: 'API Rate Limiting',
      description: 'Standard rate limiting for API calls',
      type: POLICY_TYPES.RATE_LIMITING,
      effect: POLICY_EFFECTS.CONDITIONAL,
      priority: 10,
      conditions: [
        { type: 'rate_limit', maxRequests: 100, windowMs: 60000 }
      ]
    });
    this.policies.set(rateLimitPolicy.id, rateLimitPolicy);

    // Default security policy
    const securityPolicy = new Policy({
      id: 'policy_security',
      name: 'Security Policy',
      description: 'Core security enforcement policy',
      type: POLICY_TYPES.SECURITY,
      effect: POLICY_EFFECTS.DENY,
      conditions: [
        { type: 'blacklist', check: 'ip' },
        { type: 'blacklist', check: 'user_agent' }
      ],
      actions: [POLICY_ACTIONS.DENY, POLICY_ACTIONS.LOG]
    });
    this.policies.set(securityPolicy.id, securityPolicy);

    // Default data privacy policy
    const privacyPolicy = new Policy({
      id: 'policy_privacy',
      name: 'Data Privacy',
      description: 'Data privacy and protection policy',
      type: POLICY_TYPES.DATA_PRIVACY,
      effect: POLICY_EFFECTS.PERMIT,
      conditions: [
        { type: 'encryption', required: true },
        { type: 'audit_trail', required: true }
      ]
    });
    this.policies.set(privacyPolicy.id, privacyPolicy);

    this.stats.totalPolicies = this.policies.size;
  }

  /**
   * Generate unique ID
   */
  static generateId(prefix = 'id') {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Policy Management
   */
  createPolicy(config) {
    const policy = new Policy(config);
    this.policies.set(policy.id, policy);
    this.stats.totalPolicies++;

    this.emit('policy:created', { policy });
    this.logAudit({
      policyId: policy.id,
      effect: POLICY_EFFECTS.PERMIT,
      level: AUDIT_LEVELS.INFO,
      message: `Policy created: ${policy.name}`
    });

    return policy;
  }

  updatePolicy(policyId, updates) {
    const policy = this.policies.get(policyId);
    if (!policy) {
      throw new Error(`Policy not found: ${policyId}`);
    }

    if (this.config.enableVersioning) {
      this.createPolicyVersion(policyId);
    }

    Object.assign(policy, updates, { updatedAt: new Date().toISOString() });
    this.invalidateCache(policyId);

    this.emit('policy:updated', { policy });
    this.logAudit({
      policyId: policy.id,
      effect: POLICY_EFFECTS.PERMIT,
      level: AUDIT_LEVELS.INFO,
      message: `Policy updated: ${policy.name}`
    });

    return policy;
  }

  deletePolicy(policyId) {
    const policy = this.policies.get(policyId);
    if (!policy) {
      throw new Error(`Policy not found: ${policyId}`);
    }

    this.policies.delete(policyId);
    this.stats.totalPolicies--;
    this.invalidateCache(policyId);

    this.emit('policy:deleted', { policyId });
    this.logAudit({
      policyId,
      effect: POLICY_EFFECTS.DENY,
      level: AUDIT_LEVELS.WARNING,
      message: `Policy deleted: ${policy.name}`
    });

    return true;
  }

  getPolicy(policyId) {
    return this.policies.get(policyId);
  }

  getAllPolicies(includeDisabled = false) {
    const policies = Array.from(this.policies.values());
    if (!includeDisabled) {
      return policies.filter(p => p.isActive());
    }
    return policies;
  }

  getPoliciesByType(type) {
    return Array.from(this.policies.values()).filter(p => p.type === type && p.isActive());
  }

  enablePolicy(policyId) {
    return this.updatePolicy(policyId, { enabled: true });
  }

  disablePolicy(policyId) {
    return this.updatePolicy(policyId, { enabled: false });
  }

  /**
   * Rule Management
   */
  createRule(config) {
    const rule = new Rule(config);
    this.rules.set(rule.id, rule);
    this.stats.totalRules++;

    this.emit('rule:created', { rule });
    return rule;
  }

  updateRule(ruleId, updates) {
    const rule = this.rules.get(ruleId);
    if (!rule) {
      throw new Error(`Rule not found: ${ruleId}`);
    }

    Object.assign(rule, updates);
    this.emit('rule:updated', { rule });
    return rule;
  }

  deleteRule(ruleId) {
    const rule = this.rules.get(ruleId);
    if (!rule) {
      throw new Error(`Rule not found: ${ruleId}`);
    }

    this.rules.delete(ruleId);
    this.stats.totalRules--;
    this.emit('rule:deleted', { ruleId });
    return true;
  }

  getRulesForPolicy(policyId) {
    return Array.from(this.rules.values()).filter(r => r.policyId === policyId);
  }

  /**
   * Policy Versioning
   */
  createPolicyVersion(policyId) {
    const policy = this.policies.get(policyId);
    if (!policy) {
      throw new Error(`Policy not found: ${policyId}`);
    }

    const versionKey = `${policyId}_${policy.version}`;
    const version = new PolicyVersion({
      version: policy.version,
      policy: JSON.parse(JSON.stringify(policy.toJSON())),
      createdBy: 'system',
      isActive: false
    });

    if (!this.policyVersions.has(policyId)) {
      this.policyVersions.set(policyId, []);
    }
    this.policyVersions.get(policyId).push(version);

    return version;
  }

  getPolicyVersions(policyId) {
    return this.policyVersions.get(policyId) || [];
  }

  rollbackPolicyVersion(policyId, version) {
    const versions = this.policyVersions.get(policyId);
    if (!versions) {
      throw new Error(`No versions found for policy: ${policyId}`);
    }

    const targetVersion = versions.find(v => v.version === version);
    if (!targetVersion) {
      throw new Error(`Version not found: ${version}`);
    }

    const policyData = targetVersion.policy;
    const policy = new Policy(policyData);
    this.policies.set(policyId, policy);

    this.emit('policy:rollback', { policyId, version });
    this.logAudit({
      policyId,
      effect: POLICY_EFFECTS.PERMIT,
      level: AUDIT_LEVELS.WARNING,
      message: `Policy rolled back to version: ${version}`
    });

    return policy;
  }

  /**
   * Subject Management
   */
  registerSubject(config) {
    const subject = new Subject(config);
    this.subjects.set(subject.id, subject);
    this.emit('subject:registered', { subject });
    return subject;
  }

  getSubject(subjectId) {
    return this.subjects.get(subjectId);
  }

  getSubjectByType(type) {
    return Array.from(this.subjects.values()).filter(s => s.type === type);
  }

  updateSubject(subjectId, updates) {
    const subject = this.subjects.get(subjectId);
    if (!subject) {
      throw new Error(`Subject not found: ${subjectId}`);
    }

    Object.assign(subject, updates);
    subject.lastActivity = new Date().toISOString();
    this.emit('subject:updated', { subject });
    return subject;
  }

  deleteSubject(subjectId) {
    const subject = this.subjects.get(subjectId);
    if (!subject) {
      throw new Error(`Subject not found: ${subjectId}`);
    }

    this.subjects.delete(subjectId);
    this.emit('subject:deleted', { subjectId });
    return true;
  }

  /**
   * Resource Management
   */
  registerResource(config) {
    const resource = new Resource(config);
    this.resources.set(resource.id, resource);
    this.emit('resource:registered', { resource });
    return resource;
  }

  getResource(resourceId) {
    return this.resources.get(resourceId);
  }

  getResourcesByType(type) {
    return Array.from(this.resources.values()).filter(r => r.type === type);
  }

  updateResource(resourceId, updates) {
    const resource = this.resources.get(resourceId);
    if (!resource) {
      throw new Error(`Resource not found: ${resourceId}`);
    }

    Object.assign(resource, updates);
    this.emit('resource:updated', { resource });
    return resource;
  }

  deleteResource(resourceId) {
    const resource = this.resources.get(resourceId);
    if (!resource) {
      throw new Error(`Resource not found: ${resourceId}`);
    }

    this.resources.delete(resourceId);
    this.emit('resource:deleted', { resourceId });
    return true;
  }

  /**
   * Role Management
   */
  createRole(config) {
    const role = new Role(config);
    this.roles.set(role.id, role);
    this.emit('role:created', { role });
    return role;
  }

  getRole(roleId) {
    return this.roles.get(roleId);
  }

  getAllRoles() {
    return Array.from(this.roles.values());
  }

  assignRoleToSubject(subjectId, roleId) {
    const subject = this.subjects.get(subjectId);
    if (!subject) {
      throw new Error(`Subject not found: ${subjectId}`);
    }

    if (!subject.roles.includes(roleId)) {
      subject.roles.push(roleId);
      this.emit('role:assigned', { subjectId, roleId });
    }

    return subject;
  }

  getEffectivePermissions(subjectId) {
    const subject = this.subjects.get(subjectId);
    if (!subject) {
      return [];
    }

    const permissions = new Set([...subject.permissions]);

    for (const roleId of subject.roles) {
      const role = this.roles.get(roleId);
      if (role) {
        role.permissions.forEach(p => permissions.add(p));
      }
    }

    return Array.from(permissions);
  }

  /**
   * Permission Management
   */
  createPermission(config) {
    const permission = new Permission(config);
    this.permissions.set(permission.id, permission);
    this.emit('permission:created', { permission });
    return permission;
  }

  getPermission(permissionId) {
    return this.permissions.get(permissionId);
  }

  getAllPermissions() {
    return Array.from(this.permissions.values());
  }

  /**
   * Policy Evaluation
   */
  async evaluate(context) {
    const { subject, resource, action, additionalContext = {} } = context;

    if (this.config.cacheEnabled) {
      const cachedResult = this.getCachedDecision(context);
      if (cachedResult !== null) {
        return cachedResult;
      }
    }

    let decision = { effect: POLICY_EFFECTS.PERMIT, actions: [], matchedPolicies: [] };

    const sortedPolicies = Array.from(this.policies.values())
      .filter(p => p.isActive())
      .sort((a, b) => b.priority - a.priority);

    for (const policy of sortedPolicies) {
      if (this.matchesPolicy(policy, subject, resource, action)) {
        const result = await this.evaluateConditions(policy, context);
        
        if (result.matches) {
          decision.matchedPolicies.push(policy.id);
          
          if (policy.effect === POLICY_EFFECTS.DENY) {
            decision.effect = POLICY_EFFECTS.DENY;
            break;
          }
          
          if (policy.effect === POLICY_EFFECTS.CONDITIONAL) {
            decision.effect = POLICY_EFFECTS.CONDITIONAL;
            decision.actions = [...decision.actions, ...policy.actions];
          }
        }
      }
    }

    this.stats.decisionsMade++;
    if (decision.effect === POLICY_EFFECTS.PERMIT) {
      this.stats.allowCount++;
    } else if (decision.effect === POLICY_EFFECTS.DENY) {
      this.stats.denyCount++;
    } else {
      this.stats.warnCount++;
    }

    this.logAudit({
      subject: subject ? subject.toJSON() : null,
      resource: resource ? resource.toJSON() : null,
      action,
      effect: decision.effect,
      decision: 'evaluated',
      level: decision.effect === POLICY_EFFECTS.DENY ? AUDIT_LEVELS.WARNING : AUDIT_LEVELS.INFO,
      message: `Decision made: ${decision.effect}`,
      context: additionalContext
    });

    if (this.config.cacheEnabled) {
      this.setCachedDecision(context, decision);
    }

    this.emit('policy:evaluated', { context, decision });
    return decision;
  }

  matchesPolicy(policy, subject, resource, action) {
    const subjectMatches = this.matchesPattern(policy.subjects, subject);
    const resourceMatches = this.matchesPattern(policy.resources, resource);
    const actionMatches = policy.actions.includes(action) || policy.actions.includes('*');

    return subjectMatches && resourceMatches && actionMatches;
  }

  matchesPattern(patterns, target) {
    if (!patterns || patterns.length === 0) return false;
    if (patterns.includes('*')) return true;

    if (!target) return patterns.includes('anonymous');

    if (typeof target === 'string') {
      return patterns.includes(target);
    }

    if (target.id) {
      if (patterns.includes(target.id)) return true;
    }

    if (target.roles && target.roles.length > 0) {
      for (const role of target.roles) {
        if (patterns.includes(`role:${role}`)) return true;
      }
    }

    if (target.groups && target.groups.length > 0) {
      for (const group of target.groups) {
        if (patterns.includes(`group:${group}`)) return true;
      }
    }

    if (target.type) {
      if (patterns.includes(`type:${target.type}`)) return true;
    }

    return false;
  }

  async evaluateConditions(policy, context) {
    if (!policy.conditions || policy.conditions.length === 0) {
      return { matches: true, conditions: [] };
    }

    const results = [];

    for (const condition of policy.conditions) {
      const result = await this.evaluateCondition(condition, context);
      results.push(result);
    }

    const allMatch = results.every(r => r.matches);
    return {
      matches: allMatch,
      conditions: results
    };
  }

  async evaluateCondition(condition, context) {
    const { type, ...params } = condition;
    const { subject, resource, action, additionalContext } = context;

    switch (type) {
      case 'role':
        return {
          matches: subject && subject.hasRole(params.role),
          condition,
          reason: params.role ? `Role check: ${params.role}` : 'No role specified'
        };

      case 'permission':
        return {
          matches: subject && subject.hasPermission(params.permission),
          condition,
          reason: params.permission ? `Permission check: ${params.permission}` : 'No permission specified'
        };

      case 'group':
        return {
          matches: subject && subject.belongsToGroup(params.group),
          condition,
          reason: params.group ? `Group check: ${params.group}` : 'No group specified'
        };

      case 'trust_level':
        const minTrust = params.min || 0;
        return {
          matches: subject && subject.trustLevel >= minTrust,
          condition,
          reason: `Trust level check: >= ${minTrust}`
        };

      case 'time':
        const now = new Date();
        const startTime = params.startTime ? new Date(params.startTime) : null;
        const endTime = params.endTime ? new Date(params.endTime) : null;
        return {
          matches: (!startTime || now >= startTime) && (!endTime || now <= endTime),
          condition,
          reason: 'Time window check'
        };

      case 'ip_whitelist':
        return {
          matches: additionalContext?.ipAddress && this.isIpWhitelisted(additionalContext.ipAddress, params.ips),
          condition,
          reason: 'IP whitelist check'
        };

      case 'ip_blacklist':
        return {
          matches: additionalContext?.ipAddress && !this.isIpBlacklisted(additionalContext.ipAddress, params.ips),
          condition,
          reason: 'IP blacklist check'
        };

      case 'rate_limit':
        return await this.checkRateLimit(subject?.id, params.maxRequests, params.windowMs);

      case 'sensitivity':
        return {
          matches: resource?.sensitivity === params.level,
          condition,
          reason: `Sensitivity check: ${params.level}`
        };

      case 'resource_type':
        return {
          matches: resource?.type === params.type,
          condition,
          reason: `Resource type check: ${params.type}`
        };

      case 'custom':
        if (params.validator && typeof params.validator === 'function') {
          try {
            return await params.validator(context, params);
          } catch (error) {
            return { matches: false, condition, reason: `Custom validation failed: ${error.message}` };
          }
        }
        return { matches: true, condition, reason: 'Custom condition (no validator)' };

      default:
        return { matches: true, condition, reason: `Unknown condition type: ${type}` };
    }
  }

  isIpWhitelisted(ip, whitelist) {
    if (!whitelist || whitelist.length === 0) return true;
    return whitelist.some(pattern => this.matchesIpPattern(ip, pattern));
  }

  isIpBlacklisted(ip, blacklist) {
    if (!blacklist || blacklist.length === 0) return false;
    return blacklist.some(pattern => this.matchesIpPattern(ip, pattern));
  }

  matchesIpPattern(ip, pattern) {
    if (pattern === '*') return true;
    if (pattern.includes('/')) {
      return this.isInSubnet(ip, pattern);
    }
    return ip === pattern;
  }

  isInSubnet(ip, subnet) {
    const [subnetIp, prefixLength] = subnet.split('/');
    const ipNum = this.ipToNumber(ip);
    const subnetNum = this.ipToNumber(subnetIp);
    const mask = ~( (1 << (32 - parseInt(prefixLength))) - 1);
    return (ipNum & mask) === (subnetNum & mask);
  }

  ipToNumber(ip) {
    const parts = ip.split('.').map(Number);
    return (parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3];
  }

  async checkRateLimit(subjectId, maxRequests, windowMs) {
    if (!subjectId) {
      return { matches: true, condition: { type: 'rate_limit' }, reason: 'No subject ID' };
    }

    const key = `rate_limit:${subjectId}`;
    const now = Date.now();
    const windowStart = now - windowMs;

    if (!this.rateLimitData) {
      this.rateLimitData = new Map();
    }

    let userData = this.rateLimitData.get(key);
    if (!userData || userData.windowStart < windowStart) {
      userData = { requests: [], windowStart: now };
      this.rateLimitData.set(key, userData);
    }

    userData.requests = userData.requests.filter(t => t > windowStart);
    userData.requests.push(now);

    const matches = userData.requests.length <= maxRequests;
    return {
      matches,
      condition: { type: 'rate_limit' },
      reason: `Rate limit: ${userData.requests.length}/${maxRequests}`
    };
  }

  /**
   * Caching
   */
  getCachedDecision(context) {
    if (!this.config.cacheEnabled) return null;

    const key = this.getCacheKey(context);
    const cached = this.cache.get(key);

    if (cached) {
      const expiry = this.cacheExpiry.get(key);
      if (Date.now() < expiry) {
        return cached;
      }
      this.cache.delete(key);
      this.cacheExpiry.delete(key);
    }

    return null;
  }

  setCachedDecision(context, decision) {
    if (!this.config.cacheEnabled) return;

    const key = this.getCacheKey(context);
    this.cache.set(key, decision);
    this.cacheExpiry.set(key, Date.now() + this.config.cacheExpiry);
  }

  getCacheKey(context) {
    const { subject, resource, action } = context;
    return `decision:${subject?.id || 'anon'}:${resource?.id || 'any'}:${action || 'unknown'}`;
  }

  invalidateCache(policyId) {
    for (const [key, value] of this.cache.entries()) {
      if (value.matchedPolicies.includes(policyId)) {
        this.cache.delete(key);
        this.cacheExpiry.delete(key);
      }
    }
  }

  clearCache() {
    this.cache.clear();
    this.cacheExpiry.clear();
    this.emit('cache:cleared');
  }

  /**
   * Audit Logging
   */
  logAudit(entry) {
    if (!this.config.enableAuditLogging) return;

    const logEntry = new AuditLogEntry(entry);
    this.auditLogs.unshift(logEntry);
    this.stats.totalAuditLogs++;

    if (this.auditLogs.length > this.config.maxAuditLogs) {
      this.auditLogs = this.auditLogs.slice(0, this.config.maxAuditLogs);
    }

    this.emit('audit:logged', { entry: logEntry });
    return logEntry;
  }

  getAuditLogs(filter = {}) {
    let logs = [...this.auditLogs];

    if (filter.policyId) {
      logs = logs.filter(l => l.policyId === filter.policyId);
    }
    if (filter.level) {
      logs = logs.filter(l => l.level === filter.level);
    }
    if (filter.action) {
      logs = logs.filter(l => l.action === filter.action);
    }
    if (filter.subjectId) {
      logs = logs.filter(l => l.subject?.id === filter.subjectId);
    }
    if (filter.startDate) {
      const startDate = new Date(filter.startDate);
      logs = logs.filter(l => new Date(l.timestamp) >= startDate);
    }
    if (filter.endDate) {
      const endDate = new Date(filter.endDate);
      logs = logs.filter(l => new Date(l.timestamp) <= endDate);
    }
    if (filter.limit) {
      logs = logs.slice(0, filter.limit);
    }

    return logs;
  }

  exportAuditLogs(filter = {}) {
    const logs = this.getAuditLogs(filter);
    return {
      exportedAt: new Date().toISOString(),
      count: logs.length,
      logs: logs.map(l => l.toJSON())
    };
  }

  /**
   * Import/Export
   */
  exportPolicies() {
    return {
      exportedAt: new Date().toISOString(),
      version: '1.0.0',
      policies: Array.from(this.policies.values()).map(p => p.toJSON()),
      roles: Array.from(this.roles.values()).map(r => r.toJSON()),
      permissions: Array.from(this.permissions.values()).map(p => p.toJSON()),
      stats: this.stats
    };
  }

  async importPolicies(data) {
    const results = { imported: 0, skipped: 0, errors: [] };

    if (data.policies) {
      for (const policyData of data.policies) {
        try {
          const policy = new Policy(policyData);
          this.policies.set(policy.id, policy);
          results.imported++;
        } catch (error) {
          results.errors.push({ policy: policyData.name, error: error.message });
          results.skipped++;
        }
      }
    }

    if (data.roles) {
      for (const roleData of data.roles) {
        try {
          const role = new Role(roleData);
          this.roles.set(role.id, role);
        } catch (error) {
          results.errors.push({ role: roleData.name, error: error.message });
        }
      }
    }

    if (data.permissions) {
      for (const permData of data.permissions) {
        try {
          const permission = new Permission(permData);
          this.permissions.set(permission.id, permission);
        } catch (error) {
          results.errors.push({ permission: permData.name, error: error.message });
        }
      }
    }

    this.emit('policies:imported', { results });
    return results;
  }

  /**
   * Statistics
   */
  getStats() {
    return {
      ...this.stats,
      policiesByType: this.getPoliciesByTypeCount(),
      cacheSize: this.cache.size,
      activeSubjects: this.subjects.size,
      activeResources: this.resources.size,
      uptime: Date.now() - new Date(this.stats.startTime).getTime()
    };
  }

  getPoliciesByTypeCount() {
    const counts = {};
    for (const policy of this.policies.values()) {
      counts[policy.type] = (counts[policy.type] || 0) + 1;
    }
    return counts;
  }

  /**
   * Reset
   */
  reset() {
    this.policies.clear();
    this.rules.clear();
    this.auditLogs = [];
    this.subjects.clear();
    this.resources.clear();
    this.permissions.clear();
    this.roles.clear();
    this.policyVersions.clear();
    this.cache.clear();
    this.cacheExpiry.clear();

    this.stats = {
      totalPolicies: 0,
      totalRules: 0,
      totalAuditLogs: 0,
      decisionsMade: 0,
      allowCount: 0,
      denyCount: 0,
      warnCount: 0,
      startTime: new Date().toISOString()
    };

    this.initializeDefaultPolicies();
    this.emit('reset');
  }

  /**
   * Cleanup
   */
  async cleanup() {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - this.config.logRetention);

    this.auditLogs = this.auditLogs.filter(
      log => new Date(log.timestamp) > thirtyDaysAgo
    );

    if (this.rateLimitData) {
      const now = Date.now();
      for (const [key, data] of this.rateLimitData.entries()) {
        if (now - data.windowStart > 600000) {
          this.rateLimitData.delete(key);
        }
      }
    }

    this.emit('cleanup:completed');
  }
}

// Singleton export
const policyEngine = new PolicyEngine();
export default policyEngine;
export { PolicyEngine, Policy, Rule, AuditLogEntry, Subject, Resource, Permission, Role, PolicyVersion };
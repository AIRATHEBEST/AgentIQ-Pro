/**
 * Enterprise Security - Manus 1.6 Max Pro Feature
 * RBAC, audit trails, and compliance features
 */

import { EventEmitter } from 'events';

// Permission types
export const Permission = {
  READ: 'read',
  WRITE: 'write',
  DELETE: 'delete',
  ADMIN: 'admin',
  EXECUTE: 'execute',
  CONFIGURE: 'configure'
};

// Resource types
export const Resource = {
  AGENTS: 'agents',
  TASKS: 'tasks',
  TOOLS: 'tools',
  MEMORY: 'memory',
  WORKFLOWS: 'workflows',
  METRICS: 'metrics',
  USERS: 'users',
  SETTINGS: 'settings'
};

// Role definitions
export const Role = {
  ADMIN: 'admin',
  OPERATOR: 'operator',
  DEVELOPER: 'developer',
  VIEWER: 'viewer',
  GUEST: 'guest'
};

export class User {
  constructor(id, config = {}) {
    this.id = id;
    this.username = config.username || '';
    this.email = config.email || '';
    this.roles = config.roles || [Role.VIEWER];
    this.permissions = new Set(config.permissions || []);
    this.metadata = {
      createdAt: config.createdAt || Date.now(),
      lastLogin: config.lastLogin || null,
      active: config.active !== false,
      mfaEnabled: config.mfaEnabled || false
    };
    this.apiKeys = new Map();
    this.sessions = [];
  }

  hasRole(role) {
    return this.roles.includes(role);
  }

  hasPermission(permission) {
    return this.permissions.has(permission) || 
           this.roles.includes(Role.ADMIN);
  }

  canAccess(resource, action) {
    // Admin has all permissions
    if (this.hasRole(Role.ADMIN)) return true;
    
    // Check explicit permissions
    const permissionKey = `${resource}:${action}`;
    if (this.permissions.has(permissionKey)) return true;
    
    // Check role-based permissions
    return this.getRolePermissions().has(permissionKey);
  }

  getRolePermissions() {
    const permissions = new Set();
    
    for (const role of this.roles) {
      const rolePerms = ROLE_PERMISSIONS[role] || [];
      rolePerms.forEach(p => permissions.add(p));
    }
    
    return permissions;
  }

  addApiKey(keyId, metadata = {}) {
    this.apiKeys.set(keyId, {
      createdAt: Date.now(),
      lastUsed: null,
      expiresAt: metadata.expiresAt || Date.now() + 86400000 * 30, // 30 days
      description: metadata.description || 'API Key',
      active: true
    });
  }

  revokeApiKey(keyId) {
    const key = this.apiKeys.get(keyId);
    if (key) {
      key.active = false;
      return true;
    }
    return false;
  }

  recordLogin() {
    this.metadata.lastLogin = Date.now();
    this.sessions.push({
      id: `session-${Date.now()}`,
      timestamp: Date.now(),
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'node'
    });
    
    // Keep only last 10 sessions
    if (this.sessions.length > 10) {
      this.sessions.shift();
    }
  }

  toJSON() {
    return {
      id: this.id,
      username: this.username,
      email: this.email,
      roles: this.roles,
      permissions: Array.from(this.permissions),
      metadata: this.metadata,
      apiKeys: Array.from(this.apiKeys.entries()).map(([id, data]) => ({
        id,
        ...data
      }))
    };
  }
}

// Role to permissions mapping
const ROLE_PERMISSIONS = {
  [Role.ADMIN]: [
    '*:read', '*:write', '*:delete', '*:execute', '*:configure',
    'users:read', 'users:write', 'settings:read', 'settings:write'
  ],
  [Role.OPERATOR]: [
    'agents:read', 'agents:execute',
    'tasks:read', 'tasks:write',
    'tools:read', 'tools:execute',
    'memory:read', 'memory:write',
    'workflows:read', 'workflows:write',
    'metrics:read'
  ],
  [Role.DEVELOPER]: [
    'agents:read', 'agents:write',
    'tasks:read', 'tasks:write',
    'tools:read', 'tools:write', 'tools:configure',
    'memory:read', 'memory:write',
    'workflows:read', 'workflows:write', 'workflows:configure',
    'metrics:read', 'metrics:write'
  ],
  [Role.VIEWER]: [
    'agents:read',
    'tasks:read',
    'tools:read',
    'memory:read',
    'workflows:read',
    'metrics:read'
  ],
  [Role.GUEST]: [
    'agents:read',
    'tasks:read',
    'tools:read',
    'metrics:read'
  ]
};

export class AccessControl {
  constructor(config = {}) {
    this.users = new Map();
    this.roles = new Map(Object.entries(ROLE_PERMISSIONS));
    this.sessions = new Map();
    this.defaultRole = config.defaultRole || Role.VIEWER;
  }

  createUser(id, config) {
    const user = new User(id, config);
    this.users.set(id, user);
    return user;
  }

  getUser(id) {
    return this.users.get(id);
  }

  deleteUser(id) {
    // Revoke all API keys
    const user = this.users.get(id);
    if (user) {
      for (const [keyId] of user.apiKeys) {
        user.revokeApiKey(keyId);
      }
    }
    return this.users.delete(id);
  }

  updateUser(id, updates) {
    const user = this.users.get(id);
    if (user) {
      Object.assign(user, updates);
      return user;
    }
    return null;
  }

  assignRole(userId, role) {
    const user = this.users.get(userId);
    if (user && Object.values(Role).includes(role)) {
      if (!user.roles.includes(role)) {
        user.roles.push(role);
      }
      return true;
    }
    return false;
  }

  removeRole(userId, role) {
    const user = this.users.get(userId);
    if (user) {
      user.roles = user.roles.filter(r => r !== role);
      return true;
    }
    return false;
  }

  grantPermission(userId, permission) {
    const user = this.users.get(userId);
    if (user) {
      user.permissions.add(permission);
      return true;
    }
    return false;
  }

  revokePermission(userId, permission) {
    const user = this.users.get(userId);
    if (user) {
      return user.permissions.delete(permission);
    }
    return false;
  }

  checkPermission(userId, resource, action) {
    const user = this.users.get(userId);
    if (!user) return false;
    return user.canAccess(resource, action);
  }

  createSession(userId, config = {}) {
    const user = this.users.get(userId);
    if (!user || !user.metadata.active) return null;

    const sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const session = {
      id: sessionId,
      userId,
      createdAt: Date.now(),
      expiresAt: config.expiresAt || Date.now() + 86400000, // 24 hours
      lastActivity: Date.now(),
      ipAddress: config.ipAddress || 'unknown',
      userAgent: config.userAgent || 'unknown'
    };

    this.sessions.set(sessionId, session);
    user.recordLogin();

    return session;
  }

  validateSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    if (session.expiresAt < Date.now()) {
      this.sessions.delete(sessionId);
      return null;
    }

    session.lastActivity = Date.now();
    return session;
  }

  invalidateSession(sessionId) {
    return this.sessions.delete(sessionId);
  }

  getActiveSessions(userId) {
    return Array.from(this.sessions.values())
      .filter(s => s.userId === userId && s.expiresAt > Date.now());
  }

  listUsers(filters = {}) {
    let users = Array.from(this.users.values());

    if (filters.role) {
      users = users.filter(u => u.hasRole(filters.role));
    }
    if (filters.active !== undefined) {
      users = users.filter(u => u.metadata.active === filters.active);
    }

    return users.map(u => u.toJSON());
  }

  export() {
    return {
      users: this.listUsers(),
      roles: Array.from(this.roles.keys()),
      sessions: this.sessions.size,
      exportedAt: Date.now()
    };
  }
}

export class AuditTrail extends EventEmitter {
  constructor(config = {}) {
    super();
    this.entries = [];
    this.maxEntries = config.maxEntries || 50000;
    this.filters = {
      includeRead: config.includeReadEvents !== false,
      includeSystem: config.includeSystemEvents !== false,
      minSeverity: config.minSeverity || 'info'
    };
    this.complianceMode = config.complianceMode || false;
  }

  log(action, actor, resource, details = {}) {
    const entry = {
      id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      action,
      actor: {
        id: actor.id || 'system',
        type: actor.type || 'user',
        roles: actor.roles || []
      },
      resource: {
        type: resource.type || 'unknown',
        id: resource.id || 'unknown',
        name: resource.name || ''
      },
      details: {
        before: details.before || null,
        after: details.after || null,
        metadata: details.metadata || {}
      },
      severity: details.severity || 'info',
      ipAddress: details.ipAddress || 'unknown',
      userAgent: details.userAgent || 'unknown',
      sessionId: details.sessionId || null,
      success: details.success !== false,
      error: details.error || null
    };

    // Compliance mode adds cryptographic signature
    if (this.complianceMode) {
      entry.signature = this.generateSignature(entry);
      entry.hash = this.hashEntry(entry);
    }

    this.entries.push(entry);

    if (this.entries.length > this.maxEntries) {
      this.entries.shift();
    }

    this.emit('audit:log', entry);
    return entry;
  }

  generateSignature(entry) {
    // In production, use proper crypto library
    const data = JSON.stringify({
      timestamp: entry.timestamp,
      action: entry.action,
      actor: entry.actor,
      resource: entry.resource
    });
    return `sig_${Date.now()}_${this.simpleHash(data)}`;
  }

  hashEntry(entry) {
    const data = JSON.stringify(entry);
    return this.simpleHash(data);
  }

  simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  // Audit actions
  logRead(actor, resource, details = {}) {
    if (!this.filters.includeRead) return null;
    return this.log('read', actor, resource, { ...details, severity: 'debug' });
  }

  logCreate(actor, resource, details = {}) {
    return this.log('create', actor, resource, { ...details, severity: 'info' });
  }

  logUpdate(actor, resource, details = {}) {
    return this.log('update', actor, resource, { ...details, severity: 'warning' });
  }

  logDelete(actor, resource, details = {}) {
    return this.log('delete', actor, resource, { ...details, severity: 'critical' });
  }

  logLogin(actor, details = {}) {
    return this.log('login', actor, { type: 'session' }, { ...details, severity: 'info' });
  }

  logLogout(actor, details = {}) {
    return this.log('logout', actor, { type: 'session' }, { ...details, severity: 'info' });
  }

  logPermissionChange(actor, targetUser, details = {}) {
    return this.log('permission_change', actor, { type: 'user', id: targetUser }, 
      { ...details, severity: 'critical' });
  }

  logAccessDenied(actor, resource, details = {}) {
    return this.log('access_denied', actor, resource, 
      { ...details, severity: 'warning', success: false });
  }

  query(filters = {}) {
    let results = [...this.entries];

    if (filters.action) {
      results = results.filter(e => e.action === filters.action);
    }
    if (filters.actorId) {
      results = results.filter(e => e.actor.id === filters.actorId);
    }
    if (filters.resourceType) {
      results = results.filter(e => e.resource.type === filters.resourceType);
    }
    if (filters.resourceId) {
      results = results.filter(e => e.resource.id === filters.resourceId);
    }
    if (filters.since) {
      results = results.filter(e => e.timestamp >= filters.since);
    }
    if (filters.until) {
      results = results.filter(e => e.timestamp <= filters.until);
    }
    if (filters.severity) {
      const severities = ['debug', 'info', 'warning', 'critical'];
      const minIndex = severities.indexOf(filters.minSeverity || 'debug');
      results = results.filter(e => severities.indexOf(e.severity) >= minIndex);
    }
    if (filters.success !== undefined) {
      results = results.filter(e => e.success === filters.success);
    }

    return results;
  }

  getStats() {
    const actionCounts = {};
    const severityCounts = {};

    for (const entry of this.entries) {
      actionCounts[entry.action] = (actionCounts[entry.action] || 0) + 1;
      severityCounts[entry.severity] = (severityCounts[entry.severity] || 0) + 1;
    }

    return {
      totalEntries: this.entries.length,
      byAction: actionCounts,
      bySeverity: severityCounts,
      oldestEntry: this.entries[0]?.timestamp || null,
      newestEntry: this.entries[this.entries.length - 1]?.timestamp || null
    };
  }

  export(format = 'json', filters = {}) {
    const entries = filters ? this.query(filters) : this.entries;

    if (format === 'json') {
      return JSON.stringify(entries, null, 2);
    }
    if (format === 'csv') {
      const headers = ['id', 'timestamp', 'action', 'actor_id', 'resource_type', 
                      'resource_id', 'success', 'severity'];
      const rows = entries.map(e => [
        e.id,
        new Date(e.timestamp).toISOString(),
        e.action,
        e.actor.id,
        e.resource.type,
        e.resource.id,
        e.success,
        e.severity
      ].join(','));
      return [headers.join(','), ...rows].join('\n');
    }
    return entries;
  }

  verify(entry) {
    if (!this.complianceMode) return { valid: true, reason: 'Compliance mode disabled' };

    const expectedHash = this.hashEntry(entry);
    return {
      valid: entry.hash === expectedHash,
      reason: entry.hash === expectedHash ? 'Hash verified' : 'Hash mismatch - possible tampering'
    };
  }

  clear() {
    this.entries = [];
    this.emit('cleared');
  }
}

export class ComplianceReporter {
  constructor(config = {}) {
    this.auditTrail = config.auditTrail;
    this.reports = new Map();
    this.retentionPeriod = config.retentionPeriod || 365 * 86400000; // 1 year
  }

  generateReport(type, config = {}) {
    const reportId = `report-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    let report;
    switch (type) {
      case 'access':
        report = this.generateAccessReport(config);
        break;
      case 'activity':
        report = this.generateActivityReport(config);
        break;
      case 'security':
        report = this.generateSecurityReport(config);
        break;
      case 'compliance':
        report = this.generateComplianceReport(config);
        break;
      default:
        throw new Error(`Unknown report type: ${type}`);
    }

    report.id = reportId;
    report.type = type;
    report.generatedAt = Date.now();
    report.generatedBy = config.generatedBy || 'system';

    this.reports.set(reportId, report);
    return report;
  }

  generateAccessReport(config = {}) {
    const since = config.since || Date.now() - 30 * 86400000;
    const entries = this.auditTrail.query({ since });

    const accessByUser = {};
    const accessByResource = {};

    for (const entry of entries) {
      // By user
      if (!accessByUser[entry.actor.id]) {
        accessByUser[entry.actor.id] = { read: 0, write: 0, delete: 0, denied: 0 };
      }
      if (entry.action === 'read') accessByUser[entry.actor.id].read++;
      if (entry.action === 'write' || entry.action === 'create' || entry.action === 'update') accessByUser[entry.actor.id].write++;
      if (entry.action === 'delete') accessByUser[entry.actor.id].delete++;
      if (!entry.success) accessByUser[entry.actor.id].denied++;

      // By resource
      const resKey = `${entry.resource.type}:${entry.resource.id}`;
      if (!accessByResource[resKey]) {
        accessByResource[resKey] = { count: 0, lastAccess: null };
      }
      accessByResource[resKey].count++;
      accessByResource[resKey].lastAccess = entry.timestamp;
    }

    return {
      title: 'Access Report',
      period: { since, until: Date.now() },
      summary: {
        totalAccess: entries.length,
        uniqueUsers: Object.keys(accessByUser).length,
        uniqueResources: Object.keys(accessByResource).length
      },
      byUser: accessByUser,
      byResource: accessByResource
    };
  }

  generateActivityReport(config = {}) {
    const since = config.since || Date.now() - 7 * 86400000;
    const entries = this.auditTrail.query({ since });

    const dailyActivity = {};
    for (const entry of entries) {
      const date = new Date(entry.timestamp).toISOString().split('T')[0];
      if (!dailyActivity[date]) {
        dailyActivity[date] = { total: 0, byAction: {} };
      }
      dailyActivity[date].total++;
      dailyActivity[date].byAction[entry.action] = 
        (dailyActivity[date].byAction[entry.action] || 0) + 1;
    }

    return {
      title: 'Activity Report',
      period: { since, until: Date.now() },
      dailyActivity,
      summary: {
        totalActions: entries.length,
        avgPerDay: (entries.length / 7).toFixed(1)
      }
    };
  }

  generateSecurityReport(config = {}) {
    const since = config.since || Date.now() - 30 * 86400000;
    const entries = this.auditTrail.query({ since });

    const failedLogins = entries.filter(e => 
      e.action === 'login' && !e.success
    );
    const deniedAccess = entries.filter(e => 
      e.action === 'access_denied'
    );
    const permissionChanges = entries.filter(e => 
      e.action === 'permission_change'
    );

    return {
      title: 'Security Report',
      period: { since, until: Date.now() },
      findings: {
        failedLogins: failedLogins.length,
        deniedAccess: deniedAccess.length,
        permissionChanges: permissionChanges.length
      },
      failedLoginDetails: failedLogins.slice(0, 10),
      deniedAccessDetails: deniedAccess.slice(0, 10),
      permissionChangeDetails: permissionChanges.slice(0, 10)
    };
  }

  generateComplianceReport(config = {}) {
    const since = config.since || Date.now() - 90 * 86400000;
    const entries = this.auditTrail.query({ since });

    const now = Date.now();
    const compliantEntries = entries.filter(e => 
      e.success && 
      e.timestamp > now - this.retentionPeriod
    );

    return {
      title: 'Compliance Report',
      period: { since, until: Date.now() },
      complianceScore: (compliantEntries.length / entries.length * 100).toFixed(1) + '%',
      totalEntries: entries.length,
      compliantEntries: compliantEntries.length,
      retentionPeriodDays: Math.floor(this.retentionPeriod / 86400000),
      signatureValid: entries.every(e => 
        !this.auditTrail.complianceMode || e.hash === this.auditTrail.hashEntry(e)
      )
    };
  }

  exportReport(reportId, format = 'json') {
    const report = this.reports.get(reportId);
    if (!report) return null;

    if (format === 'json') {
      return JSON.stringify(report, null, 2);
    }
    return report;
  }

  listReports() {
    return Array.from(this.reports.values()).map(r => ({
      id: r.id,
      type: r.type,
      title: r.title,
      generatedAt: r.generatedAt
    }));
  }
}

export class SecurityManager extends EventEmitter {
  constructor(config = {}) {
    super();
    this.accessControl = new AccessControl(config.accessControl);
    this.auditTrail = new AuditTrail(config.auditTrail || { complianceMode: config.complianceMode });
    this.complianceReporter = new ComplianceReporter({ auditTrail: this.auditTrail });
    
    // Security settings
    this.maxLoginAttempts = config.maxLoginAttempts || 5;
    this.lockoutDuration = config.lockoutDuration || 900000; // 15 minutes
    this.passwordPolicy = config.passwordPolicy || {
      minLength: 8,
      requireUppercase: true,
      requireLowercase: true,
      requireNumbers: true,
      requireSpecial: false
    };
    
    this.loginAttempts = new Map();
    this.suspendedUsers = new Set();
  }

  // User management
  createUser(id, config) {
    const user = this.accessControl.createUser(id, config);
    this.auditTrail.logCreate(
      { id: 'system', type: 'system' },
      { type: 'user', id, name: config.username }
    );
    return user;
  }

  authenticate(username, password, context = {}) {
    const user = Array.from(this.accessControl.users.values())
      .find(u => u.username === username || u.email === username);

    if (!user) {
      this.auditTrail.logAccessDenied(
        { id: username, type: 'unknown' },
        { type: 'auth' },
        { error: 'User not found', ...context }
      );
      return { success: false, error: 'Invalid credentials' };
    }

    // Check suspension
    if (this.suspendedUsers.has(user.id)) {
      return { success: false, error: 'Account suspended' };
    }

    // Check lockout
    const attempts = this.loginAttempts.get(user.id) || { count: 0, until: 0 };
    if (attempts.until > Date.now()) {
      return { success: false, error: 'Account locked', lockedUntil: attempts.until };
    }

    // Validate password (simplified - use proper hashing in production)
    if (this.validatePassword(password, user)) {
      attempts.count = 0;
      this.loginAttempts.set(user.id, attempts);
      
      const session = this.accessControl.createSession(user.id, context);
      this.auditTrail.logLogin(
        { id: user.id, type: 'user', roles: user.roles },
        context
      );
      
      this.emit('user:login', { userId: user.id, sessionId: session.id });
      return { success: true, user, session };
    }

    // Failed login
    attempts.count++;
    if (attempts.count >= this.maxLoginAttempts) {
      attempts.until = Date.now() + this.lockoutDuration;
      this.suspendedUsers.add(user.id);
      this.auditTrail.logAccessDenied(
        { id: user.id, type: 'user' },
        { type: 'auth' },
        { error: 'Too many attempts', ...context }
      );
    } else {
      attempts.until = 0;
    }
    this.loginAttempts.set(user.id, attempts);

    return { success: false, error: 'Invalid credentials', attemptsLeft: this.maxLoginAttempts - attempts.count };
  }

  validatePassword(password, user) {
    // Placeholder - implement proper password validation with hashing
    return password && password.length >= this.passwordPolicy.minLength;
  }

  checkPermission(userId, resource, action) {
    const allowed = this.accessControl.checkPermission(userId, resource, action);
    
    if (!allowed) {
      this.auditTrail.logAccessDenied(
        { id: userId, type: 'user' },
        { type: resource, id: resource }
      );
    }
    
    return allowed;
  }

  logAction(userId, action, resource, details = {}) {
    const user = this.accessControl.getUser(userId);
    return this.auditTrail.log(action, user, resource, details);
  }

  generateComplianceReport(type, config = {}) {
    return this.complianceReporter.generateReport(type, config);
  }

  getStats() {
    return {
      users: this.accessControl.users.size,
      activeSessions: this.accessControl.sessions.size,
      auditEntries: this.auditTrail.entries.length,
      suspendedUsers: this.suspendedUsers.size,
      failedLogins24h: this.auditTrail.query({ 
        since: Date.now() - 86400000,
        action: 'login',
        success: false
      }).length
    };
  }
}

// Factory function
export function createSecurityManager(config) {
  return new SecurityManager(config);
}
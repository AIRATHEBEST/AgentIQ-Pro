/**
 * TeamCollaboration.js - Comprehensive Team & Collaboration Features
 * Implements shared workspaces, role-based permissions, real-time collaboration, and team management
 */

import { EventEmitter } from 'events';

// ============================================================================
// CONSTANTS
// ============================================================================

export const TEAM_ROLES = {
  OWNER: 'owner',
  ADMIN: 'admin',
  EDITOR: 'editor',
  VIEWER: 'viewer',
  GUEST: 'guest'
};

export const PERMISSIONS = {
  // Workspace permissions
  WORKSPACE_VIEW: 'workspace:view',
  WORKSPACE_EDIT: 'workspace:edit',
  WORKSPACE_DELETE: 'workspace:delete',
  WORKSPACE_SHARE: 'workspace:share',
  
  // Task permissions
  TASK_CREATE: 'task:create',
  TASK_VIEW: 'task:view',
  TASK_EDIT: 'task:edit',
  TASK_DELETE: 'task:delete',
  TASK_ASSIGN: 'task:assign',
  TASK_EXECUTE: 'task:execute',
  
  // File permissions
  FILE_UPLOAD: 'file:upload',
  FILE_VIEW: 'file:view',
  FILE_EDIT: 'file:edit',
  FILE_DELETE: 'file:delete',
  FILE_SHARE: 'file:share',
  
  // Member permissions
  MEMBER_INVITE: 'member:invite',
  MEMBER_REMOVE: 'member:remove',
  MEMBER_ROLE_CHANGE: 'member:role_change',
  
  // Billing permissions
  BILLING_VIEW: 'billing:view',
  BILLING_MANAGE: 'billing:manage',
  
  // Admin permissions
  ADMIN_SETTINGS: 'admin:settings',
  ADMIN_AUDIT_LOGS: 'admin:audit_logs',
  ADMIN_INTEGRATIONS: 'admin:integrations'
};

export const ROLE_PERMISSIONS = {
  [TEAM_ROLES.OWNER]: Object.values(PERMISSIONS),
  [TEAM_ROLES.ADMIN]: [
    PERMISSIONS.WORKSPACE_VIEW,
    PERMISSIONS.WORKSPACE_EDIT,
    PERMISSIONS.WORKSPACE_SHARE,
    PERMISSIONS.TASK_CREATE,
    PERMISSIONS.TASK_VIEW,
    PERMISSIONS.TASK_EDIT,
    PERMISSIONS.TASK_DELETE,
    PERMISSIONS.TASK_ASSIGN,
    PERMISSIONS.TASK_EXECUTE,
    PERMISSIONS.FILE_UPLOAD,
    PERMISSIONS.FILE_VIEW,
    PERMISSIONS.FILE_EDIT,
    PERMISSIONS.FILE_DELETE,
    PERMISSIONS.FILE_SHARE,
    PERMISSIONS.MEMBER_INVITE,
    PERMISSIONS.BILLING_VIEW,
    PERMISSIONS.ADMIN_SETTINGS,
    PERMISSIONS.ADMIN_INTEGRATIONS
  ],
  [TEAM_ROLES.EDITOR]: [
    PERMISSIONS.WORKSPACE_VIEW,
    PERMISSIONS.TASK_CREATE,
    PERMISSIONS.TASK_VIEW,
    PERMISSIONS.TASK_EDIT,
    PERMISSIONS.TASK_EXECUTE,
    PERMISSIONS.FILE_UPLOAD,
    PERMISSIONS.FILE_VIEW,
    PERMISSIONS.FILE_EDIT
  ],
  [TEAM_ROLES.VIEWER]: [
    PERMISSIONS.WORKSPACE_VIEW,
    PERMISSIONS.TASK_VIEW,
    PERMISSIONS.FILE_VIEW
  ],
  [TEAM_ROLES.GUEST]: [
    PERMISSIONS.WORKSPACE_VIEW,
    PERMISSIONS.TASK_VIEW
  ]
};

export const WORKSPACE_STATUS = {
  ACTIVE: 'active',
  ARCHIVED: 'archived',
  SUSPENDED: 'suspended'
};

export const INVITATION_STATUS = {
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  DECLINED: 'declined',
  EXPIRED: 'expired'
};

export const ACTIVITY_TYPES = {
  MEMBER_JOINED: 'member_joined',
  MEMBER_LEFT: 'member_left',
  MEMBER_ROLE_CHANGED: 'member_role_changed',
  TASK_CREATED: 'task_created',
  TASK_UPDATED: 'task_updated',
  TASK_COMPLETED: 'task_completed',
  TASK_ASSIGNED: 'task_assigned',
  FILE_UPLOADED: 'file_uploaded',
  FILE_SHARED: 'file_shared',
  COMMENT_ADDED: 'comment_added',
  WORKSPACE_CREATED: 'workspace_created',
  WORKSPACE_UPDATED: 'workspace_updated',
  INTEGRATION_ADDED: 'integration_added',
  SETTINGS_CHANGED: 'settings_changed'
};

// ============================================================================
// TEAM MEMBER CLASS
// ============================================================================

class TeamMember {
  constructor(userId, email, name, role, joinedAt = Date.now()) {
    this.userId = userId;
    this.email = email;
    this.name = name;
    this.role = role;
    this.joinedAt = joinedAt;
    this.status = 'active';
    this.lastActiveAt = null;
    this.avatar = null;
    this.timezone = 'UTC';
    this.preferences = {
      notifications: {
        email: true,
        inApp: true,
        slack: false
      },
      language: 'en'
    };
  }

  hasPermission(permission) {
    const rolePerms = ROLE_PERMISSIONS[this.role] || [];
    return rolePerms.includes(permission);
  }

  getPermissions() {
    return ROLE_PERMISSIONS[this.role] || [];
  }

  toJSON() {
    return {
      userId: this.userId,
      email: this.email,
      name: this.name,
      role: this.role,
      joinedAt: this.joinedAt,
      status: this.status,
      lastActiveAt: this.lastActiveAt,
      avatar: this.avatar,
      timezone: this.timezone,
      preferences: this.preferences
    };
  }
}

// ============================================================================
// INVITATION CLASS
// ============================================================================

class Invitation {
  constructor(workspaceId, email, role, invitedBy, message = '') {
    this.id = `inv-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.workspaceId = workspaceId;
    this.email = email;
    this.role = role;
    this.invitedBy = invitedBy;
    this.message = message;
    this.status = INVITATION_STATUS.PENDING;
    this.createdAt = Date.now();
    this.expiresAt = Date.now() + (7 * 24 * 60 * 60 * 1000); // 7 days
    this.acceptedAt = null;
    this.declinedAt = null;
  }

  accept() {
    if (this.status !== INVITATION_STATUS.PENDING) {
      throw new Error('Invitation is not pending');
    }
    if (Date.now() > this.expiresAt) {
      this.status = INVITATION_STATUS.EXPIRED;
      throw new Error('Invitation has expired');
    }
    
    this.status = INVITATION_STATUS.ACCEPTED;
    this.acceptedAt = Date.now();
  }

  decline() {
    if (this.status !== INVITATION_STATUS.PENDING) {
      throw new Error('Invitation is not pending');
    }
    
    this.status = INVITATION_STATUS.DECLINED;
    this.declinedAt = Date.now();
  }

  isExpired() {
    return Date.now() > this.expiresAt && this.status === INVITATION_STATUS.PENDING;
  }

  toJSON() {
    return {
      id: this.id,
      workspaceId: this.workspaceId,
      email: this.email,
      role: this.role,
      invitedBy: this.invitedBy,
      message: this.message,
      status: this.status,
      createdAt: this.createdAt,
      expiresAt: this.expiresAt,
      acceptedAt: this.acceptedAt,
      declinedAt: this.declinedAt,
      isExpired: this.isExpired()
    };
  }
}

// ============================================================================
// ACTIVITY LOG ENTRY CLASS
// ============================================================================

class ActivityLogEntry {
  constructor(type, userId, workspaceId, details = {}) {
    this.id = `act-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.type = type;
    this.userId = userId;
    this.workspaceId = workspaceId;
    this.details = details;
    this.timestamp = Date.now();
    this.ipAddress = null;
    this.userAgent = null;
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      userId: this.userId,
      workspaceId: this.workspaceId,
      details: this.details,
      timestamp: this.timestamp,
      ipAddress: this.ipAddress,
      userAgent: this.userAgent
    };
  }
}

// ============================================================================
// COMMENT CLASS
// ============================================================================

class Comment {
  constructor(content, userId, targetType, targetId) {
    this.id = `cmt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.content = content;
    this.userId = userId;
    this.targetType = targetId; // 'task', 'file', 'output'
    this.targetId = targetId;
    this.createdAt = Date.now();
    this.updatedAt = null;
    this.edits = [];
    this.replies = [];
    this.mentions = [];
    this.attachments = [];
    this.reactions = {};
  }

  edit(newContent) {
    this.edits.push({
      content: this.content,
      editedAt: Date.now()
    });
    this.content = newContent;
    this.updatedAt = Date.now();
  }

  addReply(comment) {
    this.replies.push(comment);
  }

  addReaction(userId, emoji) {
    if (!this.reactions[emoji]) {
      this.reactions[emoji] = [];
    }
    if (!this.reactions[emoji].includes(userId)) {
      this.reactions[emoji].push(userId);
    }
  }

  removeReaction(userId, emoji) {
    if (this.reactions[emoji]) {
      this.reactions[emoji] = this.reactions[emoji].filter(id => id !== userId);
    }
  }

  toJSON() {
    return {
      id: this.id,
      content: this.content,
      userId: this.userId,
      targetType: this.targetType,
      targetId: this.targetId,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      edits: this.edits,
      replies: this.replies.map(r => r.toJSON()),
      mentions: this.mentions,
      attachments: this.attachments,
      reactions: this.reactions
    };
  }
}

// ============================================================================
// WORKSPACE CLASS
// ============================================================================

class Workspace {
  constructor(name, ownerId, options = {}) {
    this.id = `ws-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.name = name;
    this.ownerId = ownerId;
    this.description = options.description || '';
    this.status = WORKSPACE_STATUS.ACTIVE;
    this.createdAt = Date.now();
    this.updatedAt = Date.now();
    
    // Members
    this.members = new Map();
    this.invitations = [];
    
    // Resources
    this.tasks = [];
    this.files = [];
    this.sharedTemplates = [];
    this.integrations = [];
    
    // Settings
    this.settings = {
      visibility: 'private', // private, public
      allowGuestAccess: false,
      requireApprovalForJoin: true,
      defaultMemberRole: TEAM_ROLES.VIEWER,
      branding: {
        logo: null,
        colors: {
          primary: '#3B82F6',
          secondary: '#1E40AF'
        }
      },
      retention: {
        taskHistory: 90, // days
        fileStorage: 365, // days
        auditLogs: 730 // days
      }
    };
    
    // Usage tracking
    this.usage = {
      storageUsed: 0,
      tasksExecuted: 0,
      creditsUsed: 0
    };
    
    // Initialize with owner
    this.addMember(ownerId, 'owner@example.com', 'Owner', TEAM_ROLES.OWNER);
  }

  addMember(userId, email, name, role) {
    if (this.members.has(userId)) {
      throw new Error('User is already a member');
    }
    
    const member = new TeamMember(userId, email, name, role);
    this.members.set(userId, member);
    this.updatedAt = Date.now();
    
    return member;
  }

  removeMember(userId) {
    if (!this.members.has(userId)) {
      throw new Error('Member not found');
    }
    
    const member = this.members.get(userId);
    if (member.role === TEAM_ROLES.OWNER) {
      throw new Error('Cannot remove the owner');
    }
    
    member.status = 'inactive';
    this.members.delete(userId);
    this.updatedAt = Date.now();
    
    return member;
  }

  updateMemberRole(userId, newRole) {
    if (!this.members.has(userId)) {
      throw new Error('Member not found');
    }
    
    const member = this.members.get(userId);
    const oldRole = member.role;
    member.role = newRole;
    this.updatedAt = Date.now();
    
    return { member, oldRole, newRole };
  }

  getMember(userId) {
    return this.members.get(userId);
  }

  hasPermission(userId, permission) {
    const member = this.members.get(userId);
    if (!member) return false;
    return member.hasPermission(permission);
  }

  inviteMember(email, role, invitedBy, message = '') {
    const invitation = new Invitation(this.id, email, role, invitedBy, message);
    this.invitations.push(invitation);
    this.updatedAt = Date.now();
    
    return invitation;
  }

  acceptInvitation(invitationId, userId, email, name) {
    const invitation = this.invitations.find(i => i.id === invitationId);
    if (!invitation) {
      throw new Error('Invitation not found');
    }
    
    invitation.accept();
    this.addMember(userId, email, name, invitation.role);
    this.updatedAt = Date.now();
    
    return invitation;
  }

  addActivityLog(type, userId, details = {}) {
    const entry = new ActivityLogEntry(type, userId, this.id, details);
    if (!this.activityLogs) {
      this.activityLogs = [];
    }
    this.activityLogs.push(entry);
    
    // Keep only last 10000 entries
    if (this.activityLogs.length > 10000) {
      this.activityLogs = this.activityLogs.slice(-10000);
    }
    
    return entry;
  }

  getActivityLogs(options = {}) {
    let logs = this.activityLogs || [];
    
    if (options.type) {
      logs = logs.filter(l => l.type === options.type);
    }
    if (options.userId) {
      logs = logs.filter(l => l.userId === options.userId);
    }
    if (options.startDate) {
      logs = logs.filter(l => l.timestamp >= options.startDate);
    }
    if (options.endDate) {
      logs = logs.filter(l => l.timestamp <= options.endDate);
    }
    
    const limit = options.limit || 100;
    return logs.slice(-limit).reverse();
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      ownerId: this.ownerId,
      description: this.description,
      status: this.status,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      memberCount: this.members.size,
      members: Array.from(this.members.values()).map(m => m.toJSON()),
      invitationCount: this.invitations.filter(i => i.status === INVITATION_STATUS.PENDING).length,
      settings: this.settings,
      usage: this.usage
    };
  }
}

// ============================================================================
// TEAM COLLABORATION MANAGER CLASS
// ============================================================================

class TeamCollaborationManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this.currentUserId = options.currentUserId || null;
    this.workspaces = new Map();
    this.activeSessions = new Map(); // For real-time collaboration
    this.comments = new Map();
    this.notifications = [];
    
    // Load from localStorage
    this.loadFromStorage();
    
    // Start cleanup interval
    this.startCleanupInterval();
  }

  // ============================================================================
  // STORAGE MANAGEMENT
  // ============================================================================

  loadFromStorage() {
    try {
      const saved = localStorage.getItem('team_collaboration');
      if (saved) {
        const data = JSON.parse(saved);
        
        // Restore workspaces
        if (data.workspaces) {
          data.workspaces.forEach(wsData => {
            const ws = new Workspace(wsData.name, wsData.ownerId, wsData);
            ws.id = wsData.id;
            ws.createdAt = wsData.createdAt;
            ws.updatedAt = wsData.updatedAt;
            
            // Restore members
            if (wsData.members) {
              wsData.members.forEach(m => {
                ws.members.set(m.userId, new TeamMember(
                  m.userId, m.email, m.name, m.role, m.joinedAt
                ));
              });
            }
            
            this.workspaces.set(ws.id, ws);
          });
        }
      }
    } catch (e) {
      console.warn('Failed to load team collaboration data:', e);
    }
  }

  saveToStorage() {
    try {
      const data = {
        workspaces: Array.from(this.workspaces.values()).map(ws => ws.toJSON())
      };
      localStorage.setItem('team_collaboration', JSON.stringify(data));
    } catch (e) {
      console.warn('Failed to save team collaboration data:', e);
    }
  }

  // ============================================================================
  // WORKSPACE MANAGEMENT
  // ============================================================================

  createWorkspace(name, options = {}) {
    if (!this.currentUserId) {
      throw new Error('User must be authenticated');
    }
    
    const workspace = new Workspace(name, this.currentUserId, options);
    this.workspaces.set(workspace.id, workspace);
    
    workspace.addActivityLog(
      ACTIVITY_TYPES.WORKSPACE_CREATED,
      this.currentUserId,
      { workspaceName: name }
    );
    
    this.emit('workspace_created', workspace);
    this.saveToStorage();
    
    return workspace;
  }

  getWorkspace(workspaceId) {
    return this.workspaces.get(workspaceId);
  }

  getWorkspaces(options = {}) {
    let workspaces = Array.from(this.workspaces.values());
    
    if (options.status) {
      workspaces = workspaces.filter(ws => ws.status === options.status);
    }
    
    if (options.memberId) {
      workspaces = workspaces.filter(ws => ws.members.has(options.memberId));
    }
    
    return workspaces;
  }

  updateWorkspace(workspaceId, updates) {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) {
      throw new Error('Workspace not found');
    }
    
    if (!this.hasPermission(workspaceId, PERMISSIONS.WORKSPACE_EDIT)) {
      throw new Error('Insufficient permissions');
    }
    
    Object.assign(workspace, updates);
    workspace.updatedAt = Date.now();
    
    workspace.addActivityLog(
      ACTIVITY_TYPES.WORKSPACE_UPDATED,
      this.currentUserId,
      { updates: Object.keys(updates) }
    );
    
    this.emit('workspace_updated', workspace);
    this.saveToStorage();
    
    return workspace;
  }

  archiveWorkspace(workspaceId) {
    return this.updateWorkspace(workspaceId, { status: WORKSPACE_STATUS.ARCHIVED });
  }

  deleteWorkspace(workspaceId) {
    if (!this.workspaces.has(workspaceId)) {
      throw new Error('Workspace not found');
    }
    
    const workspace = this.workspaces.get(workspaceId);
    if (workspace.ownerId !== this.currentUserId) {
      throw new Error('Only the owner can delete the workspace');
    }
    
    this.workspaces.delete(workspaceId);
    this.emit('workspace_deleted', { workspaceId });
    this.saveToStorage();
    
    return true;
  }

  // ============================================================================
  // PERMISSION MANAGEMENT
  // ============================================================================

  hasPermission(workspaceId, permission) {
    if (!this.currentUserId) return false;
    
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) return false;
    
    return workspace.hasPermission(this.currentUserId, permission);
  }

  checkPermission(workspaceId, permission) {
    if (!this.hasPermission(workspaceId, permission)) {
      throw new Error(`Permission denied: ${permission}`);
    }
  }

  // ============================================================================
  // MEMBER MANAGEMENT
  // ============================================================================

  inviteMembers(workspaceId, invitations) {
    this.checkPermission(workspaceId, PERMISSIONS.MEMBER_INVITE);
    
    const workspace = this.workspaces.get(workspaceId);
    const createdInvitations = [];
    
    invitations.forEach(inv => {
      const invitation = workspace.inviteMember(
        inv.email,
        inv.role || workspace.settings.defaultMemberRole,
        this.currentUserId,
        inv.message
      );
      createdInvitations.push(invitation);
      
      this.emit('member_invited', { workspace: workspaceId, invitation });
    });
    
    this.saveToStorage();
    return createdInvitations;
  }

  acceptInvitation(invitationId) {
    // Find the invitation across all workspaces
    for (const [_, workspace] of this.workspaces) {
      const invitation = workspace.invitations.find(i => i.id === invitationId);
      if (invitation && invitation.email === this.getCurrentUserEmail()) {
        workspace.acceptInvitation(
          invitationId,
          this.currentUserId,
          invitation.email,
          invitation.email.split('@')[0]
        );
        
        workspace.addActivityLog(
          ACTIVITY_TYPES.MEMBER_JOINED,
          this.currentUserId,
          { role: invitation.role }
        );
        
        this.emit('invitation_accepted', { workspace: workspace.id, invitation });
        this.saveToStorage();
        
        return { workspace, invitation };
      }
    }
    
    throw new Error('Invitation not found');
  }

  updateMemberRole(workspaceId, userId, newRole) {
    this.checkPermission(workspaceId, PERMISSIONS.MEMBER_ROLE_CHANGE);
    
    const workspace = this.workspaces.get(workspaceId);
    const { member, oldRole } = workspace.updateMemberRole(userId, newRole);
    
    workspace.addActivityLog(
      ACTIVITY_TYPES.MEMBER_ROLE_CHANGED,
      this.currentUserId,
      { memberId: userId, oldRole, newRole }
    );
    
    this.emit('member_role_changed', { workspace: workspaceId, member, oldRole, newRole });
    this.saveToStorage();
    
    return member;
  }

  removeMember(workspaceId, userId) {
    this.checkPermission(workspaceId, PERMISSIONS.MEMBER_REMOVE);
    
    const workspace = this.workspaces.get(workspaceId);
    const member = workspace.removeMember(userId);
    
    workspace.addActivityLog(
      ACTIVITY_TYPES.MEMBER_LEFT,
      this.currentUserId,
      { memberId: userId, reason: 'removed' }
    );
    
    this.emit('member_removed', { workspace: workspaceId, member });
    this.saveToStorage();
    
    return member;
  }

  // ============================================================================
  // REAL-TIME COLLABORATION
  // ============================================================================

  joinSession(workspaceId, resourceId, resourceType) {
    const sessionKey = `${workspaceId}:${resourceType}:${resourceId}`;
    
    if (!this.activeSessions.has(sessionKey)) {
      this.activeSessions.set(sessionKey, {
        workspaceId,
        resourceId,
        resourceType,
        participants: new Map(),
        createdAt: Date.now()
      });
    }
    
    const session = this.activeSessions.get(sessionKey);
    session.participants.set(this.currentUserId, {
      userId: this.currentUserId,
      joinedAt: Date.now(),
      lastActiveAt: Date.now()
    });
    
    this.emit('session_joined', { sessionKey, session });
    
    return session;
  }

  leaveSession(workspaceId, resourceId, resourceType) {
    const sessionKey = `${workspaceId}:${resourceType}:${resourceId}`;
    const session = this.activeSessions.get(sessionKey);
    
    if (session) {
      session.participants.delete(this.currentUserId);
      
      if (session.participants.size === 0) {
        this.activeSessions.delete(sessionKey);
      } else {
        this.emit('participant_left', { sessionKey, userId: this.currentUserId });
      }
    }
  }

  broadcastToSession(workspaceId, resourceId, resourceType, event, data) {
    const sessionKey = `${workspaceId}:${resourceType}:${resourceId}`;
    const session = this.activeSessions.get(sessionKey);
    
    if (session) {
      this.emit('session_broadcast', { sessionKey, event, data, from: this.currentUserId });
    }
  }

  // ============================================================================
  // COMMENTS & DISCUSSIONS
  // ============================================================================

  addComment(workspaceId, content, targetType, targetId) {
    const comment = new Comment(content, this.currentUserId, targetType, targetId);
    
    const key = `${targetType}:${targetId}`;
    if (!this.comments.has(key)) {
      this.comments.set(key, []);
    }
    this.comments.get(key).push(comment);
    
    const workspace = this.workspaces.get(workspaceId);
    if (workspace) {
      workspace.addActivityLog(
        ACTIVITY_TYPES.COMMENT_ADDED,
        this.currentUserId,
        { targetType, targetId, commentId: comment.id }
      );
    }
    
    this.emit('comment_added', { workspace: workspaceId, comment });
    
    return comment;
  }

  getComments(targetType, targetId) {
    const key = `${targetType}:${targetId}`;
    return this.comments.get(key) || [];
  }

  mentionUser(workspaceId, commentId, userIds) {
    const comment = this.findComment(commentId);
    if (comment) {
      comment.mentions = [...new Set([...comment.mentions, ...userIds])];
      this.emit('users_mentioned', { workspace: workspaceId, comment, userIds });
    }
  }

  findComment(commentId) {
    for (const [_, comments] of this.comments) {
      const comment = comments.find(c => c.id === commentId);
      if (comment) return comment;
    }
    return null;
  }

  // ============================================================================
  // NOTIFICATIONS
  // ============================================================================

  addNotification(type, title, message, metadata = {}) {
    const notification = {
      id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type,
      title,
      message,
      metadata,
      createdAt: Date.now(),
      read: false
    };
    
    this.notifications.unshift(notification);
    
    // Keep only last 100 notifications
    if (this.notifications.length > 100) {
      this.notifications = this.notifications.slice(0, 100);
    }
    
    this.emit('notification_added', notification);
    
    return notification;
  }

  markNotificationRead(notificationId) {
    const notification = this.notifications.find(n => n.id === notificationId);
    if (notification) {
      notification.read = true;
    }
  }

  markAllNotificationsRead() {
    this.notifications.forEach(n => n.read = true);
  }

  getUnreadNotifications() {
    return this.notifications.filter(n => !n.read);
  }

  // ============================================================================
  // SHARED TEMPLATES
  // ============================================================================

  saveTemplate(workspaceId, name, templateData, options = {}) {
    this.checkPermission(workspaceId, PERMISSIONS.TASK_CREATE);
    
    const workspace = this.workspaces.get(workspaceId);
    const template = {
      id: `tpl-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name,
      data: templateData,
      createdBy: this.currentUserId,
      createdAt: Date.now(),
      tags: options.tags || [],
      category: options.category || 'general',
      isPublic: options.isPublic || false
    };
    
    workspace.sharedTemplates.push(template);
    workspace.updatedAt = Date.now();
    
    this.emit('template_saved', { workspace: workspaceId, template });
    this.saveToStorage();
    
    return template;
  }

  getTemplates(workspaceId, options = {}) {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) return [];
    
    let templates = workspace.sharedTemplates;
    
    if (options.category) {
      templates = templates.filter(t => t.category === options.category);
    }
    
    if (options.tag) {
      templates = templates.filter(t => t.tags.includes(options.tag));
    }
    
    return templates;
  }

  // ============================================================================
  // AUDIT LOGS & ANALYTICS
  // ============================================================================

  getAuditLogs(workspaceId, options = {}) {
    this.checkPermission(workspaceId, PERMISSIONS.ADMIN_AUDIT_LOGS);
    
    const workspace = this.workspaces.get(workspaceId);
    return workspace.getActivityLogs(options);
  }

  exportAuditLogs(workspaceId, format = 'json', options = {}) {
    const logs = this.getAuditLogs(workspaceId, options);
    
    if (format === 'json') {
      return JSON.stringify(logs.map(l => l.toJSON()), null, 2);
    } else if (format === 'csv') {
      const headers = ['ID', 'Type', 'User', 'Timestamp', 'Details'];
      const rows = logs.map(l => 
        `${l.id},${l.type},${l.userId},${new Date(l.timestamp).toISOString()},"${JSON.stringify(l.details)}"`
      );
      return [headers.join(','), ...rows].join('\n');
    }
    
    return logs;
  }

  getTeamAnalytics(workspaceId) {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) return null;
    
    const members = Array.from(workspace.members.values());
    const now = Date.now();
    const dayAgo = now - (24 * 60 * 60 * 1000);
    const weekAgo = now - (7 * 24 * 60 * 60 * 1000);
    const monthAgo = now - (30 * 24 * 60 * 60 * 1000);
    
    const activityLogs = workspace.getActivityLogs();
    
    return {
      workspace: {
        id: workspace.id,
        name: workspace.name,
        memberCount: members.length,
        activeMembers: members.filter(m => m.lastActiveAt && m.lastActiveAt > weekAgo).length
      },
      activity: {
        last24h: activityLogs.filter(l => l.timestamp > dayAgo).length,
        last7d: activityLogs.filter(l => l.timestamp > weekAgo).length,
        last30d: activityLogs.filter(l => l.timestamp > monthAgo).length
      },
      members: members.map(m => ({
        userId: m.userId,
        name: m.name,
        role: m.role,
        activityCount: activityLogs.filter(l => l.userId === m.userId).length
      })),
      usage: workspace.usage
    };
  }

  // ============================================================================
  // UTILITIES
  // ============================================================================

  getCurrentUserEmail() {
    // In a real app, this would fetch from auth service
    return 'user@example.com';
  }

  startCleanupInterval() {
    // Clean up expired invitations daily
    setInterval(() => {
      for (const [_, workspace] of this.workspaces) {
        workspace.invitations.forEach(inv => {
          if (inv.isExpired()) {
            inv.status = INVITATION_STATUS.EXPIRED;
          }
        });
      }
      this.saveToStorage();
    }, 24 * 60 * 60 * 1000);
    
    // Clean up inactive sessions hourly
    setInterval(() => {
      const now = Date.now();
      const timeout = 30 * 60 * 1000; // 30 minutes
      
      for (const [key, session] of this.activeSessions) {
        for (const [userId, participant] of session.participants) {
          if (now - participant.lastActiveAt > timeout) {
            session.participants.delete(userId);
          }
        }
        
        if (session.participants.size === 0) {
          this.activeSessions.delete(key);
        }
      }
    }, 60 * 60 * 1000);
  }

  setCurrentUser(userId) {
    this.currentUserId = userId;
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let collaborationInstance = null;

export function getTeamCollaboration(options = {}) {
  if (!collaborationInstance) {
    collaborationInstance = new TeamCollaborationManager(options);
  }
  return collaborationInstance;
}

export function resetCollaborationInstance() {
  collaborationInstance = null;
}

export default TeamCollaborationManager;

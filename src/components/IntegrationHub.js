/**
 * IntegrationHub.js - Comprehensive Integrations & Connectivity
 * Implements RESTful API, webhooks, third-party integrations, and data connectors
 */

import { EventEmitter } from 'events';

// ============================================================================
// CONSTANTS
// ============================================================================

export const INTEGRATION_TYPES = {
  COMMUNICATION: 'communication',
  PRODUCTIVITY: 'productivity',
  STORAGE: 'storage',
  DATABASE: 'database',
  CRM: 'crm',
  PROJECT_MANAGEMENT: 'project_management',
  ANALYTICS: 'analytics',
  PAYMENT: 'payment',
  SOCIAL_MEDIA: 'social_media',
  CUSTOM: 'custom'
};

export const INTEGRATION_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  ERROR: 'error',
  PENDING: 'pending'
};

export const AUTH_METHODS = {
  OAUTH2: 'oauth2',
  API_KEY: 'api_key',
  BASIC: 'basic',
  BEARER: 'bearer',
  JWT: 'jwt'
};

export const WEBHOOK_EVENTS = {
  TASK_CREATED: 'task.created',
  TASK_COMPLETED: 'task.completed',
  TASK_FAILED: 'task.failed',
  FILE_UPLOADED: 'file.uploaded',
  MESSAGE_RECEIVED: 'message.received',
  USER_JOINED: 'user.joined',
  PAYMENT_RECEIVED: 'payment.received',
  CUSTOM: 'custom'
};

// ============================================================================
// INTEGRATION CONFIGURATIONS
// ============================================================================

export const INTEGRATION_CONFIGS = {
  // Communication
  slack: {
    id: 'slack',
    name: 'Slack',
    type: INTEGRATION_TYPES.COMMUNICATION,
    authMethod: AUTH_METHODS.OAUTH2,
    scopes: ['chat:write', 'channels:read', 'files:write'],
    endpoints: {
      authorize: 'https://slack.com/oauth/v2/authorize',
      token: 'https://slack.com/api/oauth.v2.access',
      revoke: 'https://slack.com/api/auth.revoke'
    },
    features: ['send_message', 'create_channel', 'upload_file', 'get_channels']
  },
  teams: {
    id: 'teams',
    name: 'Microsoft Teams',
    type: INTEGRATION_TYPES.COMMUNICATION,
    authMethod: AUTH_METHODS.OAUTH2,
    scopes: ['Chat.ReadWrite', 'Channel.ReadBasic.All'],
    endpoints: {
      authorize: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
      token: 'https://login.microsoftonline.com/common/oauth2/v2.0/token'
    },
    features: ['send_message', 'create_team', 'upload_file']
  },
  
  // Storage
  googleDrive: {
    id: 'googleDrive',
    name: 'Google Drive',
    type: INTEGRATION_TYPES.STORAGE,
    authMethod: AUTH_METHODS.OAUTH2,
    scopes: ['drive.file', 'drive.readonly'],
    endpoints: {
      authorize: 'https://accounts.google.com/o/oauth2/v2/auth',
      token: 'https://oauth2.googleapis.com/token'
    },
    features: ['upload_file', 'download_file', 'list_files', 'create_folder']
  },
  dropbox: {
    id: 'dropbox',
    name: 'Dropbox',
    type: INTEGRATION_TYPES.STORAGE,
    authMethod: AUTH_METHODS.OAUTH2,
    scopes: ['files.content.write', 'files.content.read'],
    endpoints: {
      authorize: 'https://www.dropbox.com/oauth2/authorize',
      token: 'https://api.dropboxapi.com/oauth2/token'
    },
    features: ['upload_file', 'download_file', 'list_files']
  },
  oneDrive: {
    id: 'oneDrive',
    name: 'OneDrive',
    type: INTEGRATION_TYPES.STORAGE,
    authMethod: AUTH_METHODS.OAUTH2,
    scopes: ['Files.ReadWrite'],
    endpoints: {
      authorize: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
      token: 'https://login.microsoftonline.com/common/oauth2/v2.0/token'
    },
    features: ['upload_file', 'download_file', 'list_files']
  },
  
  // Database
  postgresql: {
    id: 'postgresql',
    name: 'PostgreSQL',
    type: INTEGRATION_TYPES.DATABASE,
    authMethod: AUTH_METHODS.BASIC,
    config: ['host', 'port', 'database', 'username', 'password', 'ssl'],
    features: ['query', 'insert', 'update', 'delete', 'transaction']
  },
  mysql: {
    id: 'mysql',
    name: 'MySQL',
    type: INTEGRATION_TYPES.DATABASE,
    authMethod: AUTH_METHODS.BASIC,
    config: ['host', 'port', 'database', 'username', 'password'],
    features: ['query', 'insert', 'update', 'delete']
  },
  mongodb: {
    id: 'mongodb',
    name: 'MongoDB',
    type: INTEGRATION_TYPES.DATABASE,
    authMethod: AUTH_METHODS.BASIC,
    config: ['connectionString', 'database'],
    features: ['find', 'insert', 'update', 'delete', 'aggregate']
  },
  
  // CRM
  salesforce: {
    id: 'salesforce',
    name: 'Salesforce',
    type: INTEGRATION_TYPES.CRM,
    authMethod: AUTH_METHODS.OAUTH2,
    scopes: ['api', 'refresh_token'],
    endpoints: {
      authorize: 'https://login.salesforce.com/services/oauth2/authorize',
      token: 'https://login.salesforce.com/services/oauth2/token'
    },
    features: ['create_lead', 'update_contact', 'query_records']
  },
  hubspot: {
    id: 'hubspot',
    name: 'HubSpot',
    type: INTEGRATION_TYPES.CRM,
    authMethod: AUTH_METHODS.OAUTH2,
    scopes: ['crm.objects.contacts.read', 'crm.objects.contacts.write'],
    endpoints: {
      authorize: 'https://app.hubspot.com/oauth/authorize',
      token: 'https://api.hubapi.com/oauth/v1/token'
    },
    features: ['create_contact', 'update_deal', 'get_companies']
  },
  
  // Project Management
  jira: {
    id: 'jira',
    name: 'Jira',
    type: INTEGRATION_TYPES.PROJECT_MANAGEMENT,
    authMethod: AUTH_METHODS.BEARER,
    config: ['baseUrl', 'email', 'apiToken'],
    features: ['create_issue', 'update_issue', 'get_projects', 'get_sprints']
  },
  asana: {
    id: 'asana',
    name: 'Asana',
    type: INTEGRATION_TYPES.PROJECT_MANAGEMENT,
    authMethod: AUTH_METHODS.OAUTH2,
    scopes: ['default'],
    endpoints: {
      authorize: 'https://app.asana.com/-/oauth_authorize',
      token: 'https://app.asana.com/-/oauth_token'
    },
    features: ['create_task', 'update_task', 'get_projects']
  },
  trello: {
    id: 'trello',
    name: 'Trello',
    type: INTEGRATION_TYPES.PROJECT_MANAGEMENT,
    authMethod: AUTH_METHODS.API_KEY,
    config: ['apiKey', 'token'],
    features: ['create_card', 'update_card', 'get_boards', 'get_lists']
  },
  
  // Analytics
  googleAnalytics: {
    id: 'googleAnalytics',
    name: 'Google Analytics',
    type: INTEGRATION_TYPES.ANALYTICS,
    authMethod: AUTH_METHODS.OAUTH2,
    scopes: ['https://www.googleapis.com/auth/analytics.readonly'],
    endpoints: {
      authorize: 'https://accounts.google.com/o/oauth2/v2/auth',
      token: 'https://oauth2.googleapis.com/token'
    },
    features: ['get_reports', 'get_realtime_data', 'list_accounts']
  },
  mixpanel: {
    id: 'mixpanel',
    name: 'Mixpanel',
    type: INTEGRATION_TYPES.ANALYTICS,
    authMethod: AUTH_METHODS.API_KEY,
    config: ['apiSecret', 'projectId'],
    features: ['query_events', 'get_funnel', 'get_retention']
  },
  
  // Payment
  stripe: {
    id: 'stripe',
    name: 'Stripe',
    type: INTEGRATION_TYPES.PAYMENT,
    authMethod: AUTH_METHODS.BEARER,
    config: ['secretKey', 'webhookSecret'],
    features: ['create_charge', 'create_customer', 'create_subscription', 'get_payments']
  },
  paypal: {
    id: 'paypal',
    name: 'PayPal',
    type: INTEGRATION_TYPES.PAYMENT,
    authMethod: AUTH_METHODS.OAUTH2,
    endpoints: {
      authorize: 'https://www.paypal.com/webapps/auth/protocol/openidconnect/v1/authorize',
      token: 'https://api.paypal.com/v1/oauth2/token'
    },
    features: ['create_payment', 'capture_payment', 'get_transactions']
  },
  
  // Social Media
  twitter: {
    id: 'twitter',
    name: 'Twitter/X',
    type: INTEGRATION_TYPES.SOCIAL_MEDIA,
    authMethod: AUTH_METHODS.OAUTH2,
    scopes: ['tweet.read', 'tweet.write', 'users.read'],
    endpoints: {
      authorize: 'https://twitter.com/i/oauth2/authorize',
      token: 'https://api.twitter.com/2/oauth2/token'
    },
    features: ['post_tweet', 'get_timeline', 'get_mentions']
  },
  linkedin: {
    id: 'linkedin',
    name: 'LinkedIn',
    type: INTEGRATION_TYPES.SOCIAL_MEDIA,
    authMethod: AUTH_METHODS.OAUTH2,
    scopes: ['w_member_social', 'r_basicprofile'],
    endpoints: {
      authorize: 'https://www.linkedin.com/oauth/v2/authorization',
      token: 'https://www.linkedin.com/oauth/v2/accessToken'
    },
    features: ['post_share', 'get_profile', 'get_connections']
  }
};

// ============================================================================
// API CONNECTION CLASS
// ============================================================================

class ApiConnection {
  constructor(integrationId, config) {
    this.id = `conn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.integrationId = integrationId;
    this.config = { ...config };
    this.status = INTEGRATION_STATUS.PENDING;
    this.createdAt = Date.now();
    this.lastUsedAt = null;
    this.errorCount = 0;
    this.lastError = null;
    this.rateLimits = {
      requestsPerMinute: 60,
      requestsPerHour: 1000,
      remaining: 60,
      resetAt: Date.now() + 60000
    };
    this.cache = new Map();
    this.cacheExpiry = 5 * 60 * 1000; // 5 minutes
  }

  async test() {
    // Simulated connection test
    return {
      success: true,
      message: 'Connection successful',
      timestamp: Date.now()
    };
  }

  updateStatus(status, error = null) {
    this.status = status;
    if (error) {
      this.errorCount++;
      this.lastError = error;
    } else {
      this.errorCount = 0;
      this.lastError = null;
    }
  }

  updateRateLimits(headers) {
    if (headers['x-rate-limit-limit']) {
      this.rateLimits.requestsPerMinute = parseInt(headers['x-rate-limit-limit']);
    }
    if (headers['x-rate-limit-remaining']) {
      this.rateLimits.remaining = parseInt(headers['x-rate-limit-remaining']);
    }
    if (headers['x-rate-limit-reset']) {
      this.rateLimits.resetAt = parseInt(headers['x-rate-limit-reset']) * 1000;
    }
  }

  getCached(key) {
    const cached = this.cache.get(key);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.data;
    }
    this.cache.delete(key);
    return null;
  }

  setCache(key, data, ttl = null) {
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + (ttl || this.cacheExpiry)
    });
  }

  toJSON() {
    return {
      id: this.id,
      integrationId: this.integrationId,
      status: this.status,
      createdAt: this.createdAt,
      lastUsedAt: this.lastUsedAt,
      errorCount: this.errorCount,
      lastError: this.lastError,
      rateLimits: this.rateLimits
    };
  }
}

// ============================================================================
// WEBHOOK SUBSCRIPTION CLASS
// ============================================================================

class WebhookSubscription {
  constructor(url, events, secret) {
    this.id = `wh-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.url = url;
    this.events = events;
    this.secret = secret;
    this.active = true;
    this.createdAt = Date.now();
    this.lastTriggeredAt = null;
    this.deliveryStats = {
      total: 0,
      successful: 0,
      failed: 0,
      lastStatus: null,
      lastAttempt: null
    };
    this.retryConfig = {
      maxAttempts: 3,
      backoffMultiplier: 2,
      initialDelay: 1000
    };
  }

  async deliver(payload) {
    const delivery = {
      id: `del-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      webhookId: this.id,
      payload,
      attempts: 0,
      createdAt: Date.now()
    };

    // In a real implementation, this would make HTTP POST request
    this.deliveryStats.total++;
    this.deliveryStats.lastAttempt = Date.now();
    this.lastTriggeredAt = Date.now();

    // Simulate successful delivery
    this.deliveryStats.successful++;
    this.deliveryStats.lastStatus = 'success';

    return { success: true, delivery };
  }

  recordFailure(error) {
    this.deliveryStats.failed++;
    this.deliveryStats.lastStatus = 'failed';
  }

  toJSON() {
    return {
      id: this.id,
      url: this.url,
      events: this.events,
      active: this.active,
      createdAt: this.createdAt,
      lastTriggeredAt: this.lastTriggeredAt,
      deliveryStats: this.deliveryStats
    };
  }
}

// ============================================================================
// INTEGRATION HUB CLASS
// ============================================================================

class IntegrationHub extends EventEmitter {
  constructor(options = {}) {
    super();
    this.connections = new Map();
    this.webhooks = [];
    this.eventQueue = [];
    this.processingEvents = false;
    this.customIntegrations = [];
    
    // Load from localStorage
    this.loadFromStorage();
    
    // Start event processor
    this.startEventProcessor();
  }

  // ============================================================================
  // STORAGE MANAGEMENT
  // ============================================================================

  loadFromStorage() {
    try {
      const saved = localStorage.getItem('integration_hub');
      if (saved) {
        const data = JSON.parse(saved);
        
        if (data.connections) {
          data.connections.forEach(connData => {
            const conn = new ApiConnection(connData.integrationId, connData.config);
            conn.id = connData.id;
            conn.status = connData.status;
            this.connections.set(conn.id, conn);
          });
        }
        
        if (data.webhooks) {
          data.webhooks.forEach(whData => {
            const wh = new WebhookSubscription(whData.url, whData.events, whData.secret);
            wh.id = whData.id;
            wh.active = whData.active;
            this.webhooks.push(wh);
          });
        }
      }
    } catch (e) {
      console.warn('Failed to load integration data:', e);
    }
  }

  saveToStorage() {
    try {
      const data = {
        connections: Array.from(this.connections.values()).map(c => c.toJSON()),
        webhooks: this.webhooks.map(w => w.toJSON())
      };
      localStorage.setItem('integration_hub', JSON.stringify(data));
    } catch (e) {
      console.warn('Failed to save integration data:', e);
    }
  }

  // ============================================================================
  // CONNECTION MANAGEMENT
  // ============================================================================

  createConnection(integrationId, config) {
    const integration = INTEGRATION_CONFIGS[integrationId] || this.customIntegrations.find(i => i.id === integrationId);
    if (!integration) {
      throw new Error(`Unknown integration: ${integrationId}`);
    }

    const connection = new ApiConnection(integrationId, config);
    this.connections.set(connection.id, connection);
    
    this.emit('connection_created', connection);
    this.saveToStorage();
    
    return connection;
  }

  getConnection(connectionId) {
    return this.connections.get(connectionId);
  }

  getConnections(options = {}) {
    let connections = Array.from(this.connections.values());
    
    if (options.type) {
      const integrationIds = Object.entries(INTEGRATION_CONFIGS)
        .filter(([_, config]) => config.type === options.type)
        .map(([id]) => id);
      connections = connections.filter(c => integrationIds.includes(c.integrationId));
    }
    
    if (options.status) {
      connections = connections.filter(c => c.status === options.status);
    }
    
    return connections;
  }

  async testConnection(connectionId) {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      throw new Error('Connection not found');
    }

    try {
      const result = await connection.test();
      connection.updateStatus(INTEGRATION_STATUS.ACTIVE);
      connection.lastUsedAt = Date.now();
      
      this.emit('connection_tested', { connectionId, success: true });
      this.saveToStorage();
      
      return result;
    } catch (error) {
      connection.updateStatus(INTEGRATION_STATUS.ERROR, error.message);
      this.emit('connection_tested', { connectionId, success: false, error });
      this.saveToStorage();
      
      throw error;
    }
  }

  deleteConnection(connectionId) {
    if (!this.connections.has(connectionId)) {
      throw new Error('Connection not found');
    }
    
    this.connections.delete(connectionId);
    this.emit('connection_deleted', connectionId);
    this.saveToStorage();
    
    return true;
  }

  // ============================================================================
  // API REQUEST HANDLING
  // ============================================================================

  async request(connectionId, endpoint, options = {}) {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      throw new Error('Connection not found');
    }

    if (connection.status === INTEGRATION_STATUS.ERROR) {
      throw new Error('Connection is in error state');
    }

    // Check rate limits
    if (connection.rateLimits.remaining <= 0) {
      const waitTime = connection.rateLimits.resetAt - Date.now();
      if (waitTime > 0) {
        throw new Error(`Rate limit exceeded. Retry after ${Math.ceil(waitTime / 1000)}s`);
      }
    }

    // Check cache
    if (options.method === 'GET' && options.cache !== false) {
      const cached = connection.getCached(endpoint);
      if (cached) {
        return { data: cached, fromCache: true };
      }
    }

    try {
      // In a real implementation, this would make actual HTTP request
      const response = await this.simulateApiRequest(connection, endpoint, options);
      
      connection.lastUsedAt = Date.now();
      connection.rateLimits.remaining--;
      
      // Cache GET requests
      if (options.method === 'GET' && options.cache !== false) {
        connection.setCache(endpoint, response.data);
      }
      
      return { data: response.data, fromCache: false };
    } catch (error) {
      connection.updateStatus(INTEGRATION_STATUS.ERROR, error.message);
      throw error;
    }
  }

  async simulateApiRequest(connection, endpoint, options) {
    // Simulated API response
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          data: { success: true, endpoint, method: options.method || 'GET' },
          headers: {
            'x-rate-limit-limit': '60',
            'x-rate-limit-remaining': '59',
            'x-rate-limit-reset': Math.floor((Date.now() + 60000) / 1000)
          }
        });
      }, 100);
    });
  }

  // ============================================================================
  // WEBHOOK MANAGEMENT
  // ============================================================================

  createWebhook(url, events, options = {}) {
    const webhook = new WebhookSubscription(url, events, options.secret);
    this.webhooks.push(webhook);
    
    this.emit('webhook_created', webhook);
    this.saveToStorage();
    
    return webhook;
  }

  deleteWebhook(webhookId) {
    const index = this.webhooks.findIndex(w => w.id === webhookId);
    if (index === -1) {
      throw new Error('Webhook not found');
    }
    
    this.webhooks.splice(index, 1);
    this.emit('webhook_deleted', webhookId);
    this.saveToStorage();
    
    return true;
  }

  toggleWebhook(webhookId, active) {
    const webhook = this.webhooks.find(w => w.id === webhookId);
    if (!webhook) {
      throw new Error('Webhook not found');
    }
    
    webhook.active = active;
    this.emit('webhook_toggled', { webhookId, active });
    this.saveToStorage();
    
    return webhook;
  }

  getWebhooks(options = {}) {
    let webhooks = this.webhooks;
    
    if (options.event) {
      webhooks = webhooks.filter(w => w.events.includes(options.event));
    }
    
    if (options.active !== undefined) {
      webhooks = webhooks.filter(w => w.active === options.active);
    }
    
    return webhooks;
  }

  // ============================================================================
  // EVENT PROCESSING
  // ============================================================================

  queueEvent(event, payload) {
    const queuedEvent = {
      id: `evt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      event,
      payload,
      createdAt: Date.now(),
      attempts: 0
    };
    
    this.eventQueue.push(queuedEvent);
    
    // Trigger processing if not already running
    if (!this.processingEvents) {
      this.processEventQueue();
    }
    
    return queuedEvent;
  }

  async processEventQueue() {
    if (this.processingEvents || this.eventQueue.length === 0) {
      return;
    }

    this.processingEvents = true;

    while (this.eventQueue.length > 0) {
      const event = this.eventQueue.shift();
      await this.deliverEvent(event);
    }

    this.processingEvents = false;
  }

  async deliverEvent(event) {
    const webhooks = this.webhooks.filter(w => w.active && w.events.includes(event.event));
    
    const deliveries = await Promise.allSettled(
      webhooks.map(w => w.deliver({ event: event.event, payload: event.payload }))
    );

    const results = {
      event: event.event,
      totalWebhooks: webhooks.length,
      successful: deliveries.filter(d => d.status === 'fulfilled').length,
      failed: deliveries.filter(d => d.status === 'rejected').length
    };

    this.emit('event_delivered', results);
    
    return results;
  }

  // ============================================================================
  // PRE-BUILT INTEGRATIONS
  // ============================================================================

  async sendSlackMessage(connectionId, channel, text, options = {}) {
    return this.request(connectionId, '/chat.postMessage', {
      method: 'POST',
      body: { channel, text, ...options }
    });
  }

  async uploadToGoogleDrive(connectionId, filename, content, folderId = null) {
    return this.request(connectionId, '/upload/drive/v3/files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { name: filename, parents: folderId ? [folderId] : [] },
      media: content
    });
  }

  async createJiraIssue(connectionId, projectKey, summary, description, issueType = 'Task') {
    return this.request(connectionId, '/rest/api/3/issue', {
      method: 'POST',
      body: {
        fields: {
          project: { key: projectKey },
          summary,
          description,
          issuetype: { name: issueType }
        }
      }
    });
  }

  async createStripeCharge(connectionId, amount, currency, source, metadata = {}) {
    return this.request(connectionId, '/v1/charges', {
      method: 'POST',
      body: { amount, currency, source, metadata }
    });
  }

  async postTweet(connectionId, text, mediaIds = []) {
    return this.request(connectionId, '/2/tweets', {
      method: 'POST',
      body: { text, media: { media_ids: mediaIds } }
    });
  }

  // ============================================================================
  // CUSTOM INTEGRATIONS
  // ============================================================================

  registerCustomIntegration(config) {
    const required = ['id', 'name', 'type', 'authMethod'];
    const missing = required.filter(r => !config[r]);
    
    if (missing.length > 0) {
      throw new Error(`Missing required fields: ${missing.join(', ')}`);
    }

    this.customIntegrations.push({
      ...config,
      registeredAt: Date.now()
    });

    this.emit('custom_integration_registered', config);
    
    return config;
  }

  getAvailableIntegrations() {
    const builtIn = Object.values(INTEGRATION_CONFIGS);
    return [...builtIn, ...this.customIntegrations];
  }

  // ============================================================================
  // UTILITIES
  // ============================================================================

  startEventProcessor() {
    // Process queued events every 5 seconds
    setInterval(() => {
      if (!this.processingEvents && this.eventQueue.length > 0) {
        this.processEventQueue();
      }
    }, 5000);
  }

  getIntegrationStats() {
    const connections = Array.from(this.connections.values());
    const now = Date.now();
    const dayAgo = now - (24 * 60 * 60 * 1000);

    return {
      totalConnections: connections.length,
      activeConnections: connections.filter(c => c.status === INTEGRATION_STATUS.ACTIVE).length,
      errorConnections: connections.filter(c => c.status === INTEGRATION_STATUS.ERROR).length,
      totalWebhooks: this.webhooks.length,
      activeWebhooks: this.webhooks.filter(w => w.active).length,
      eventsQueued: this.eventQueue.length,
      connectionsUsedToday: connections.filter(c => c.lastUsedAt && c.lastUsedAt > dayAgo).length
    };
  }

  exportConfiguration() {
    return {
      connections: Array.from(this.connections.values()).map(c => c.toJSON()),
      webhooks: this.webhooks.map(w => w.toJSON()),
      customIntegrations: this.customIntegrations,
      exportedAt: Date.now()
    };
  }

  importConfiguration(config) {
    if (config.connections) {
      config.connections.forEach(connData => {
        const conn = new ApiConnection(connData.integrationId, connData.config);
        conn.id = connData.id;
        conn.status = connData.status;
        this.connections.set(conn.id, conn);
      });
    }

    if (config.webhooks) {
      config.webhooks.forEach(whData => {
        const wh = new WebhookSubscription(whData.url, whData.events, whData.secret);
        wh.id = whData.id;
        wh.active = whData.active;
        this.webhooks.push(wh);
      });
    }

    this.saveToStorage();
    this.emit('configuration_imported');
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let integrationInstance = null;

export function getIntegrationHub(options = {}) {
  if (!integrationInstance) {
    integrationInstance = new IntegrationHub(options);
  }
  return integrationInstance;
}

export function resetIntegrationInstance() {
  integrationInstance = null;
}

export default IntegrationHub;

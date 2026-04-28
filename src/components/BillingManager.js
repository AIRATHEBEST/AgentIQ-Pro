/**
 * BillingManager.js - Comprehensive Billing, Credits & Account Management
 * Implements all billing, credit tracking, subscription management, and usage analytics
 */

import { EventEmitter } from 'events';

// ============================================================================
// CONSTANTS
// ============================================================================

export const BILLING_TIERS = {
  FREE: 'free',
  PRO: 'pro',
  TEAM: 'team',
  ENTERPRISE: 'enterprise'
};

export const CREDIT_PACKS = [
  { id: 'pack-100', credits: 100, price: 9.99, bonus: 0 },
  { id: 'pack-500', credits: 500, price: 39.99, bonus: 50 },
  { id: 'pack-1000', credits: 1000, price: 69.99, bonus: 200 },
  { id: 'pack-5000', credits: 5000, price: 299.99, bonus: 1500 },
  { id: 'pack-10000', credits: 10000, price: 499.99, bonus: 5000 }
];

export const SUBSCRIPTION_PLANS = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    currency: 'USD',
    interval: 'monthly',
    creditsIncluded: 100,
    features: ['Basic AI models', 'Limited task execution', 'Community support'],
    limits: { maxTasksPerDay: 10, maxFileSize: '10MB', maxConcurrentTasks: 1 }
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 29.99,
    currency: 'USD',
    interval: 'monthly',
    creditsIncluded: 1000,
    features: ['Advanced AI models', 'Unlimited tasks', 'Priority support', 'API access'],
    limits: { maxTasksPerDay: 1000, maxFileSize: '100MB', maxConcurrentTasks: 10 }
  },
  {
    id: 'team',
    name: 'Team',
    price: 99.99,
    currency: 'USD',
    interval: 'monthly',
    creditsIncluded: 5000,
    features: ['All Pro features', 'Team collaboration', 'Shared workspaces', 'Admin controls'],
    limits: { maxTasksPerDay: 10000, maxFileSize: '500MB', maxConcurrentTasks: 50 }
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 499.99,
    currency: 'USD',
    interval: 'monthly',
    creditsIncluded: 50000,
    features: ['All Team features', 'Custom models', 'SLA guarantee', 'Dedicated support', 'SSO'],
    limits: { maxTasksPerDay: -1, maxFileSize: '5GB', maxConcurrentTasks: -1 }
  }
];

export const TASK_COMPLEXITY_MULTIPLIERS = {
  trivial: 0.1,
  simple: 0.5,
  medium: 1.0,
  complex: 2.5,
  advanced: 5.0,
  expert: 10.0
};

export const FEATURE_CREDIT_COSTS = {
  webSearch: 0.5,
  codeExecution: 2.0,
  fileProcessing: 1.0,
  imageGeneration: 5.0,
  dataAnalysis: 3.0,
  multiAgent: 5.0,
  autonomousTask: 10.0
};

export const CURRENCY_SYMBOLS = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
  CAD: 'C$',
  AUD: 'A$'
};

// ============================================================================
// CREDIT TRANSACTION CLASS
// ============================================================================

class CreditTransaction {
  constructor(type, amount, balance, description, metadata = {}) {
    this.id = `txn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.type = type; // 'credit' or 'debit'
    this.amount = amount;
    this.balance = balance;
    this.description = description;
    this.metadata = metadata;
    this.timestamp = Date.now();
    this.status = 'completed';
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      amount: this.amount,
      balance: this.balance,
      description: this.description,
      metadata: this.metadata,
      timestamp: this.timestamp,
      status: this.status
    };
  }
}

// ============================================================================
// USAGE RECORD CLASS
// ============================================================================

class UsageRecord {
  constructor(feature, credits, taskId = null, metadata = {}) {
    this.id = `usage-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.feature = feature;
    this.credits = credits;
    this.taskId = taskId;
    this.metadata = metadata;
    this.timestamp = Date.now();
    this.date = new Date().toISOString().split('T')[0];
  }

  toJSON() {
    return {
      id: this.id,
      feature: this.feature,
      credits: this.credits,
      taskId: this.taskId,
      metadata: this.metadata,
      timestamp: this.timestamp,
      date: this.date
    };
  }
}

// ============================================================================
// INVOICE CLASS
// ============================================================================

class Invoice {
  constructor(userId, items, subtotal, tax = 0, discount = 0) {
    this.id = `inv-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.userId = userId;
    this.items = items;
    this.subtotal = subtotal;
    this.tax = tax;
    this.discount = discount;
    this.total = subtotal + tax - discount;
    this.status = 'pending';
    this.created = Date.now();
    this.dueDate = Date.now() + (30 * 24 * 60 * 60 * 1000); // 30 days
    this.currency = 'USD';
    this.paymentMethod = null;
    this.paidDate = null;
  }

  markPaid(paymentMethod) {
    this.status = 'paid';
    this.paymentMethod = paymentMethod;
    this.paidDate = Date.now();
  }

  toJSON() {
    return {
      id: this.id,
      userId: this.userId,
      items: this.items,
      subtotal: this.subtotal,
      tax: this.tax,
      discount: this.discount,
      total: this.total,
      status: this.status,
      created: this.created,
      dueDate: this.dueDate,
      currency: this.currency,
      paymentMethod: this.paymentMethod,
      paidDate: this.paidDate
    };
  }

  generatePDF() {
    // In a real implementation, this would generate a PDF
    return {
      filename: `invoice-${this.id}.pdf`,
      url: `/invoices/${this.id}/download`,
      generated: Date.now()
    };
  }
}

// ============================================================================
// BILLING MANAGER CLASS
// ============================================================================

class BillingManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this.userId = options.userId || 'anonymous';
    this.tier = options.tier || BILLING_TIERS.FREE;
    this.credits = options.initialCredits || 0;
    this.transactions = [];
    this.usageRecords = [];
    this.invoices = [];
    this.subscriptions = [];
    this.budgetLimits = options.budgetLimits || {};
    this.autoRecharge = options.autoRecharge || null;
    this.promoCodes = [];
    this.giftCredits = [];
    this.creditExpiry = options.creditExpiry || null;
    
    // Load from localStorage if available
    this.loadFromStorage();
    
    // Start usage tracking
    this.startUsageTracking();
  }

  // ============================================================================
  // STORAGE MANAGEMENT
  // ============================================================================

  loadFromStorage() {
    try {
      const saved = localStorage.getItem(`billing_${this.userId}`);
      if (saved) {
        const data = JSON.parse(saved);
        this.credits = data.credits || this.credits;
        this.tier = data.tier || this.tier;
        this.transactions = data.transactions || [];
        this.usageRecords = data.usageRecords || [];
        this.budgetLimits = data.budgetLimits || {};
        this.autoRecharge = data.autoRecharge || null;
      }
    } catch (e) {
      console.warn('Failed to load billing data:', e);
    }
  }

  saveToStorage() {
    try {
      const data = {
        credits: this.credits,
        tier: this.tier,
        transactions: this.transactions.slice(-1000), // Keep last 1000
        usageRecords: this.usageRecords.slice(-10000), // Keep last 10000
        budgetLimits: this.budgetLimits,
        autoRecharge: this.autoRecharge
      };
      localStorage.setItem(`billing_${this.userId}`, JSON.stringify(data));
    } catch (e) {
      console.warn('Failed to save billing data:', e);
    }
  }

  // ============================================================================
  // CREDIT MANAGEMENT
  // ============================================================================

  addCredits(amount, description = 'Credit purchase', metadata = {}) {
    const transaction = new CreditTransaction('credit', amount, this.credits + amount, description, metadata);
    this.transactions.push(transaction);
    this.credits += amount;
    
    this.emit('credits_added', { amount, balance: this.credits, transaction });
    this.saveToStorage();
    
    return transaction;
  }

  deductCredits(amount, description = 'Task execution', metadata = {}) {
    if (amount > this.credits) {
      this.emit('insufficient_credits', { required: amount, available: this.credits });
      return null;
    }

    const transaction = new CreditTransaction('debit', amount, this.credits - amount, description, metadata);
    this.transactions.push(transaction);
    this.credits -= amount;
    
    // Track usage
    if (metadata.feature) {
      const usage = new UsageRecord(metadata.feature, amount, metadata.taskId, metadata);
      this.usageRecords.push(usage);
    }
    
    this.emit('credits_deducted', { amount, balance: this.credits, transaction });
    this.saveToStorage();
    
    // Check budget limits
    this.checkBudgetLimits();
    
    return transaction;
  }

  estimateTaskCost(complexity, features = []) {
    const baseCost = TASK_COMPLEXITY_MULTIPLIERS[complexity] || 1.0;
    const featureCost = features.reduce((sum, f) => sum + (FEATURE_CREDIT_COSTS[f] || 0), 0);
    return baseCost + featureCost;
  }

  canAffordTask(complexity, features = []) {
    const estimatedCost = this.estimateTaskCost(complexity, features);
    return {
      canAfford: this.credits >= estimatedCost,
      estimatedCost,
      availableCredits: this.credits,
      shortfall: Math.max(0, estimatedCost - this.credits)
    };
  }

  // ============================================================================
  // BUDGET MANAGEMENT
  // ============================================================================

  setBudgetLimit(period, amount) {
    this.budgetLimits[period] = amount;
    this.saveToStorage();
    this.emit('budget_updated', { period, amount });
  }

  getBudgetUsage(period = 'monthly') {
    const now = new Date();
    let startDate;
    
    if (period === 'daily') {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (period === 'weekly') {
      const dayOfWeek = now.getDay();
      startDate = new Date(now);
      startDate.setDate(now.getDate() - dayOfWeek);
    } else { // monthly
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }
    
    const periodUsage = this.usageRecords
      .filter(r => new Date(r.timestamp) >= startDate)
      .reduce((sum, r) => sum + r.credits, 0);
    
    const limit = this.budgetLimits[period] || Infinity;
    
    return {
      period,
      used: periodUsage,
      limit,
      remaining: limit - periodUsage,
      percentageUsed: (periodUsage / limit) * 100
    };
  }

  checkBudgetLimits() {
    const periods = ['daily', 'weekly', 'monthly'];
    
    for (const period of periods) {
      if (this.budgetLimits[period]) {
        const usage = this.getBudgetUsage(period);
        if (usage.percentageUsed >= 80) {
          this.emit('budget_warning', { period, ...usage });
        }
        if (usage.percentageUsed >= 100) {
          this.emit('budget_exceeded', { period, ...usage });
        }
      }
    }
  }

  // ============================================================================
  // SUBSCRIPTION MANAGEMENT
  // ============================================================================

  subscribe(planId, paymentMethod = null) {
    const plan = SUBSCRIPTION_PLANS.find(p => p.id === planId);
    if (!plan) {
      throw new Error(`Invalid plan: ${planId}`);
    }

    const subscription = {
      id: `sub-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      planId,
      plan,
      status: 'active',
      startDate: Date.now(),
      nextBillingDate: Date.now() + (30 * 24 * 60 * 60 * 1000),
      paymentMethod,
      autoRenew: true
    };

    this.subscriptions.push(subscription);
    this.tier = planId.toUpperCase();
    
    // Add included credits
    if (plan.creditsIncluded > 0) {
      this.addCredits(plan.creditsIncluded, `Subscription: ${plan.name}`, { subscriptionId: subscription.id });
    }

    this.emit('subscription_started', subscription);
    this.saveToStorage();
    
    return subscription;
  }

  cancelSubscription(subscriptionId, immediate = false) {
    const subscription = this.subscriptions.find(s => s.id === subscriptionId);
    if (!subscription) {
      throw new Error('Subscription not found');
    }

    if (immediate) {
      subscription.status = 'cancelled';
      subscription.cancelledDate = Date.now();
    } else {
      subscription.autoRenew = false;
      subscription.status = 'cancelling';
    }

    this.emit('subscription_cancelled', { subscription, immediate });
    this.saveToStorage();
    
    return subscription;
  }

  upgradeSubscription(newPlanId) {
    const activeSub = this.subscriptions.find(s => s.status === 'active');
    if (!activeSub) {
      return this.subscribe(newPlanId);
    }

    const newPlan = SUBSCRIPTION_PLANS.find(p => p.id === newPlanId);
    if (!newPlan) {
      throw new Error(`Invalid plan: ${newPlanId}`);
    }

    // Calculate prorated difference
    const daysRemaining = (activeSub.nextBillingDate - Date.now()) / (24 * 60 * 60 * 1000);
    const oldDailyRate = activeSub.plan.price / 30;
    const newDailyRate = newPlan.price / 30;
    const proratedDifference = (newDailyRate - oldDailyRate) * daysRemaining;

    activeSub.plan = newPlan;
    activeSub.planId = newPlanId;
    this.tier = newPlanId.toUpperCase();

    this.emit('subscription_upgraded', { subscription: activeSub, proratedDifference });
    this.saveToStorage();
    
    return { subscription: activeSub, proratedDifference };
  }

  // ============================================================================
  // AUTO-RECHARGE
  // ============================================================================

  enableAutoRecharge(packId, threshold = 10) {
    const pack = CREDIT_PACKS.find(p => p.id === packId);
    if (!pack) {
      throw new Error('Invalid credit pack');
    }

    this.autoRecharge = {
      packId,
      pack,
      threshold,
      enabled: true
    };

    this.emit('auto_recharge_enabled', this.autoRecharge);
    this.saveToStorage();
  }

  disableAutoRecharge() {
    this.autoRecharge = null;
    this.emit('auto_recharge_disabled');
    this.saveToStorage();
  }

  checkAutoRecharge() {
    if (!this.autoRecharge || !this.autoRecharge.enabled) {
      return;
    }

    if (this.credits <= this.autoRecharge.threshold) {
      const pack = this.autoRecharge.pack;
      const totalCredits = pack.credits + pack.bonus;
      
      // Simulate purchase (in real app, would charge payment method)
      this.addCredits(totalCredits, `Auto-recharge: ${pack.name}`, { 
        autoRecharge: true,
        packId: pack.id 
      });

      this.emit('auto_recharge_triggered', { pack, newBalance: this.credits });
    }
  }

  // ============================================================================
  // PROMO CODES & GIFTS
  // ============================================================================

  applyPromoCode(code) {
    // Simulated promo code validation
    const validCodes = {
      'WELCOME10': { type: 'credits', amount: 10 },
      'FIRST50': { type: 'credits', amount: 50 },
      'BONUS100': { type: 'credits', amount: 100 },
      'DISCOUNT20': { type: 'discount', percentage: 20 }
    };

    if (!validCodes[code]) {
      return { success: false, error: 'Invalid promo code' };
    }

    const promo = validCodes[code];
    if (promo.type === 'credits') {
      this.addCredits(promo.amount, `Promo code: ${code}`, { promoCode: code });
    }

    this.promoCodes.push({ code, applied: Date.now(), ...promo });
    this.emit('promo_applied', { code, ...promo });
    this.saveToStorage();
    
    return { success: true, ...promo };
  }

  giftCredits(amount, recipientId, message = '') {
    if (amount > this.credits) {
      return { success: false, error: 'Insufficient credits' };
    }

    this.deductCredits(amount, `Gift to ${recipientId}`, { giftTo: recipientId, message });
    
    const gift = {
      id: `gift-${Date.now()}`,
      from: this.userId,
      to: recipientId,
      amount,
      message,
      timestamp: Date.now()
    };

    this.giftCredits.push(gift);
    this.emit('credits_gifted', gift);
    
    return { success: true, gift };
  }

  // ============================================================================
  // USAGE ANALYTICS
  // ============================================================================

  getUsageBreakdown(options = {}) {
    const { startDate, endDate, groupBy = 'feature' } = options;
    
    let records = this.usageRecords;
    
    if (startDate) {
      records = records.filter(r => r.timestamp >= startDate);
    }
    if (endDate) {
      records = records.filter(r => r.timestamp <= endDate);
    }

    const breakdown = {};
    let totalCredits = 0;

    records.forEach(record => {
      const key = groupBy === 'feature' ? record.feature : 
                  groupBy === 'date' ? record.date : 
                  groupBy === 'task' ? record.taskId : 'other';
      
      if (!breakdown[key]) {
        breakdown[key] = { credits: 0, count: 0 };
      }
      
      breakdown[key].credits += record.credits;
      breakdown[key].count += 1;
      totalCredits += record.credits;
    });

    return {
      breakdown,
      totalCredits,
      period: { startDate, endDate },
      groupBy
    };
  }

  getUsageForecast(days = 30) {
    const dailyAverage = this.calculateDailyAverage();
    const projectedUsage = dailyAverage * days;
    
    return {
      dailyAverage,
      projectedUsage,
      currentCredits: this.credits,
      estimatedDaysUntilDepletion: this.credits / dailyAverage,
      recommendedTopUp: Math.max(0, projectedUsage - this.credits)
    };
  }

  calculateDailyAverage() {
    if (this.usageRecords.length === 0) return 0;
    
    const oldestRecord = Math.min(...this.usageRecords.map(r => r.timestamp));
    const daysSinceFirstUse = (Date.now() - oldestRecord) / (24 * 60 * 60 * 1000);
    const totalUsage = this.usageRecords.reduce((sum, r) => sum + r.credits, 0);
    
    return daysSinceFirstUse > 0 ? totalUsage / daysSinceFirstUse : totalUsage;
  }

  // ============================================================================
  // INVOICING
  // ============================================================================

  generateInvoice(items, options = {}) {
    const subtotal = items.reduce((sum, item) => sum + item.amount, 0);
    const taxRate = options.taxRate || 0;
    const tax = subtotal * taxRate;
    const discount = options.discount || 0;

    const invoice = new Invoice(this.userId, items, subtotal, tax, discount);
    this.invoices.push(invoice);
    
    this.emit('invoice_generated', invoice);
    
    return invoice;
  }

  payInvoice(invoiceId, paymentMethod) {
    const invoice = this.invoices.find(i => i.id === invoiceId);
    if (!invoice) {
      throw new Error('Invoice not found');
    }

    invoice.markPaid(paymentMethod);
    this.emit('invoice_paid', invoice);
    this.saveToStorage();
    
    return invoice;
  }

  getInvoices(options = {}) {
    let invoices = this.invoices;
    
    if (options.status) {
      invoices = invoices.filter(i => i.status === options.status);
    }
    
    return invoices.sort((a, b) => b.created - a.created);
  }

  // ============================================================================
  // EXPORT & REPORTING
  // ============================================================================

  exportUsageReport(format = 'json', options = {}) {
    const data = this.getUsageBreakdown(options);
    
    if (format === 'json') {
      return JSON.stringify(data, null, 2);
    } else if (format === 'csv') {
      const headers = ['Feature', 'Credits', 'Count'];
      const rows = Object.entries(data.breakdown).map(([key, value]) => 
        `${key},${value.credits},${value.count}`
      );
      return [headers.join(','), ...rows].join('\n');
    }
    
    return data;
  }

  exportTransactions(format = 'json', options = {}) {
    let transactions = this.transactions;
    
    if (options.startDate) {
      transactions = transactions.filter(t => t.timestamp >= options.startDate);
    }
    if (options.endDate) {
      transactions = transactions.filter(t => t.timestamp <= options.endDate);
    }
    
    if (format === 'json') {
      return JSON.stringify(transactions.map(t => t.toJSON()), null, 2);
    } else if (format === 'csv') {
      const headers = ['ID', 'Type', 'Amount', 'Balance', 'Description', 'Timestamp'];
      const rows = transactions.map(t => 
        `${t.id},${t.type},${t.amount},${t.balance},"${t.description}",${new Date(t.timestamp).toISOString()}`
      );
      return [headers.join(','), ...rows].join('\n');
    }
    
    return transactions;
  }

  // ============================================================================
  // COST OPTIMIZATION
  // ============================================================================

  getCostOptimizationSuggestions() {
    const suggestions = [];
    const usage = this.getUsageBreakdown({ groupBy: 'feature' });
    
    // Analyze high-cost features
    const sortedFeatures = Object.entries(usage.breakdown)
      .sort(([, a], [, b]) => b.credits - a.credits);
    
    if (sortedFeatures.length > 0) {
      const topFeature = sortedFeatures[0];
      if (topFeature[1].credits > usage.totalCredits * 0.5) {
        suggestions.push({
          type: 'high_usage_feature',
          feature: topFeature[0],
          message: `You're spending ${(topFeature[1].credits / usage.totalCredits * 100).toFixed(1)}% of credits on ${topFeature[0]}. Consider optimizing usage.`,
          potentialSavings: topFeature[1].credits * 0.2
        });
      }
    }

    // Subscription recommendation
    const monthlyUsage = this.getBudgetUsage('monthly').used;
    const currentPlan = SUBSCRIPTION_PLANS.find(p => p.id.toLowerCase() === this.tier.toLowerCase());
    
    if (currentPlan && monthlyUsage > currentPlan.creditsIncluded * 1.5) {
      const nextPlan = SUBSCRIPTION_PLANS.find(p => p.price > currentPlan.price);
      if (nextPlan) {
        suggestions.push({
          type: 'upgrade_recommendation',
          currentPlan: currentPlan.name,
          recommendedPlan: nextPlan.name,
          message: `Based on your usage, upgrading to ${nextPlan.name} could save you $${((monthlyUsage / currentPlan.creditsIncluded) * currentPlan.price - nextPlan.price).toFixed(2)}/month`,
          potentialSavings: (monthlyUsage / currentPlan.creditsIncluded) * currentPlan.price - nextPlan.price
        });
      }
    }

    return suggestions;
  }

  // ============================================================================
  // USAGE TRACKING
  // ============================================================================

  startUsageTracking() {
    // Check auto-recharge every hour
    setInterval(() => this.checkAutoRecharge(), 60 * 60 * 1000);
    
    // Emit periodic usage summary
    setInterval(() => {
      const summary = {
        credits: this.credits,
        tier: this.tier,
        monthlyUsage: this.getBudgetUsage('monthly'),
        forecast: this.getUsageForecast()
      };
      this.emit('usage_summary', summary);
    }, 24 * 60 * 60 * 1000);
  }

  trackTaskExecution(taskId, complexity, features, duration) {
    const cost = this.estimateTaskCost(complexity, features);
    const transaction = this.deductCredits(cost, `Task: ${taskId}`, {
      taskId,
      complexity,
      features,
      duration,
      feature: 'task_execution'
    });

    return { cost, transaction };
  }

  // ============================================================================
  // ACCOUNT MANAGEMENT
  // ============================================================================

  getAccountSummary() {
    return {
      userId: this.userId,
      tier: this.tier,
      credits: this.credits,
      subscriptions: this.subscriptions.filter(s => s.status === 'active'),
      budgetLimits: this.budgetLimits,
      autoRecharge: this.autoRecharge,
      promoCodes: this.promoCodes,
      stats: {
        totalTransactions: this.transactions.length,
        totalUsageRecords: this.usageRecords.length,
        totalInvoices: this.invoices.length
      }
    };
  }

  resetUsage(resetTransactions = false) {
    this.usageRecords = [];
    if (resetTransactions) {
      this.transactions = [];
    }
    this.emit('usage_reset');
    this.saveToStorage();
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let billingInstance = null;

export function getBillingManager(options = {}) {
  if (!billingInstance) {
    billingInstance = new BillingManager(options);
  }
  return billingInstance;
}

export function resetBillingInstance() {
  billingInstance = null;
}

export default BillingManager;

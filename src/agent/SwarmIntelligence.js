/**
 * Multi-Agent Swarm Intelligence Module
 * Orchestrates multiple specialized agents with delegation, negotiation, voting, and conflict resolution
 */

import { EventEmitter } from 'events';

// Agent Types
export const AgentType = {
  PLANNER: 'planner',
  RESEARCHER: 'researcher',
  CODE: 'code',
  SECURITY: 'security',
  VALIDATOR: 'validator',
  EXECUTOR: 'executor',
  REVIEWER: 'reviewer'
};

// Agent Roles
export const AgentRole = {
  COORDINATOR: 'coordinator',
  SPECIALIST: 'specialist',
  ADVISOR: 'advisor',
  EXECUTOR: 'executor',
  MONITOR: 'monitor'
};

// Message Types
export const MessageType = {
  TASK: 'task',
  RESULT: 'result',
  QUERY: 'query',
  RESPONSE: 'response',
  VOTE: 'vote',
  NEGOTIATE: 'negotiate',
  CONFLICT: 'conflict',
  SYNC: 'sync',
  ABORT: 'abort'
};

// Vote Types
export const VoteType = {
  APPROVAL: 'approval',
  REJECTION: 'rejection',
  ABSTENTION: 'abstention',
  CONSENSUS: 'consensus'
};

// Conflict Resolution Strategies
export const ConflictResolution = {
  VOTING: 'voting',
  PRIORITY: 'priority',
  NEGOTIATION: 'negotiation',
  ESCALATION: 'escalation',
  ROUND_ROBIN: 'round_robin'
};

export class AgentMessage {
  constructor(from, to, type, content, metadata = {}) {
    this.id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.from = from;
    this.to = to;
    this.type = type;
    this.content = content;
    this.metadata = {
      timestamp: new Date(),
      priority: metadata.priority || 'normal',
      correlationId: metadata.correlationId || null,
      ttl: metadata.ttl || 10,
      retryCount: 0,
      ...metadata
    };
  }

  decrementTTL() {
    this.metadata.ttl--;
    return this.metadata.ttl > 0;
  }
}

export class Agent {
  constructor(id, type, role = AgentRole.SPECIALIST, capabilities = []) {
    this.id = id;
    this.type = type;
    this.role = role;
    this.capabilities = capabilities;
    this.state = 'idle'; // idle, busy, waiting, error
    this.currentTask = null;
    this.performanceMetrics = {
      tasksCompleted: 0,
      tasksFailed: 0,
      avgResponseTime: 0,
      totalResponseTime: 0,
      successRate: 1.0,
      votesParticipated: 0,
      votesWon: 0,
      negotiationsWon: 0
    };
    this.busyUntil = null;
    this.priority = 1.0;
    this.specialization = this.getSpecializationScore();
  }

  getSpecializationScore() {
    const scores = {
      [AgentType.PLANNER]: { planning: 1.0, research: 0.3, code: 0.2 },
      [AgentType.RESEARCHER]: { planning: 0.3, research: 1.0, code: 0.4 },
      [AgentType.CODE]: { planning: 0.2, research: 0.4, code: 1.0 },
      [AgentType.SECURITY]: { planning: 0.3, research: 0.5, code: 0.7, security: 1.0 },
      [AgentType.VALIDATOR]: { planning: 0.3, research: 0.3, code: 0.6, validation: 1.0 },
      [AgentType.EXECUTOR]: { planning: 0.4, research: 0.3, code: 0.6, execution: 1.0 },
      [AgentType.REVIEWER]: { planning: 0.4, research: 0.5, code: 0.7, review: 1.0 }
    };
    return scores[this.type] || { general: 1.0 };
  }

  canHandle(task) {
    if (this.state === 'busy' || this.state === 'waiting') {
      return this.busyUntil && Date.now() > this.busyUntil;
    }
    return this.capabilities.some(cap => 
      task.requiredCapabilities.includes(cap) ||
      this.specialization[cap] > 0.3
    );
  }

  assignTask(task) {
    this.state = 'busy';
    this.currentTask = task;
    this.busyUntil = Date.now() + (task.estimatedTime || 60000);
  }

  completeTask(success, responseTime) {
    this.state = 'idle';
    this.currentTask = null;
    this.busyUntil = null;
    
    this.performanceMetrics.tasksCompleted++;
    this.performanceMetrics.totalResponseTime += responseTime;
    this.performanceMetrics.avgResponseTime = 
      this.performanceMetrics.totalResponseTime / this.performanceMetrics.tasksCompleted;
    
    if (success) {
      this.performanceMetrics.successRate = 
        (this.performanceMetrics.successRate * (this.performanceMetrics.tasksCompleted - 1) + 1) / 
        this.performanceMetrics.tasksCompleted;
    } else {
      this.performanceMetrics.tasksFailed++;
    }
  }

  getAvailability() {
    if (this.state === 'idle') return 1.0;
    if (this.state === 'busy' && this.busyUntil && Date.now() > this.busyUntil) return 1.0;
    if (this.state === 'busy') {
      const remainingTime = this.busyUntil - Date.now();
      return Math.max(0, 1 - (remainingTime / 60000));
    }
    return 0;
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      role: this.role,
      capabilities: this.capabilities,
      state: this.state,
      currentTask: this.currentTask?.id,
      performanceMetrics: this.performanceMetrics,
      priority: this.priority,
      specialization: this.specialization
    };
  }
}

export class Task {
  constructor(id, description, type, requiredCapabilities = [], priority = 1, parentTask = null) {
    this.id = id;
    this.description = description;
    this.type = type;
    this.requiredCapabilities = requiredCapabilities;
    this.priority = priority;
    this.parentTask = parentTask;
    this.status = 'pending'; // pending, assigned, in_progress, completed, failed
    this.subtasks = [];
    this.results = null;
    this.assignedAgent = null;
    this.createdAt = new Date();
    this.startedAt = null;
    this.completedAt = null;
    this.estimatedTime = 60000;
    this.dependencies = [];
    this.tags = [];
    this.context = {};
  }

  addSubtask(subtask) {
    this.subtasks.push(subtask);
    subtask.dependencies.push(this.id);
  }

  isReady() {
    return this.dependencies.every(depId => {
      const depTask = TaskQueue.getTask(depId);
      return depTask && depTask.status === 'completed';
    });
  }
}

export class TaskQueue {
  constructor() {
    this.tasks = new Map();
    this.pendingQueue = [];
    this.completedQueue = [];
    this.failedQueue = [];
  }

  addTask(task) {
    this.tasks.set(task.id, task);
    this.pendingQueue.push(task.id);
    this.reorderQueue();
  }

  getTask(id) {
    return this.tasks.get(id);
  }

  reorderQueue() {
    this.pendingQueue.sort((a, b) => {
      const taskA = this.tasks.get(a);
      const taskB = this.tasks.get(b);
      if (!taskA || !taskB) return 0;
      return taskB.priority - taskA.priority;
    });
  }

  nextTask() {
    while (this.pendingQueue.length > 0) {
      const taskId = this.pendingQueue.shift();
      const task = this.tasks.get(taskId);
      if (task && task.isReady()) {
        return task;
      }
    }
    return null;
  }

  completeTask(taskId, success, results = null) {
    const task = this.tasks.get(taskId);
    if (!task) return;

    task.status = success ? 'completed' : 'failed';
    task.completedAt = new Date();
    task.results = results;

    if (success) {
      this.completedQueue.push(taskId);
    } else {
      this.failedQueue.push(taskId);
    }
  }
}

export class VotingMechanism {
  constructor(agents, topic, options = {}) {
    this.agents = agents;
    this.topic = topic;
    this.options = {
      threshold: options.threshold || 0.5,
      quorum: options.quorum || agents.length / 2,
      anonymous: options.anonymous || false,
      weightByPerformance: options.weightByPerformance || false,
      maxRounds: options.maxRounds || 3,
      ...options
    };
    this.votes = new Map();
    this.rounds = 0;
    this.decided = false;
    this.result = null;
  }

  castVote(agentId, vote, justification = '') {
    if (this.decided) return false;
    
    const agent = this.agents.find(a => a.id === agentId);
    if (!agent) return false;

    let weight = 1;
    if (this.options.weightByPerformance) {
      weight = agent.performanceMetrics.successRate * agent.priority;
    }

    this.votes.set(agentId, {
      vote,
      justification,
      weight,
      timestamp: new Date()
    });

    return this.checkDecision();
  }

  checkDecision() {
    const validVotes = Array.from(this.votes.values());
    const totalWeight = validVotes.reduce((sum, v) => sum + (v.vote !== 'abstention' ? v.weight : 0), 0);
    const voteCount = validVotes.filter(v => v.vote !== 'abstention').length;

    if (voteCount < this.options.quorum) return false;

    const approvalWeight = validVotes
      .filter(v => v.vote === 'approval')
      .reduce((sum, v) => sum + v.weight, 0);
    
    const approvalRatio = totalWeight > 0 ? approvalWeight / totalWeight : 0;

    if (approvalRatio >= this.options.threshold) {
      this.decided = true;
      this.result = 'approved';
      return true;
    }

    const rejectionWeight = validVotes
      .filter(v => v.vote === 'rejection')
      .reduce((sum, v) => sum + v.weight, 0);
    
    const rejectionRatio = totalWeight > 0 ? rejectionWeight / totalWeight : 0;

    if (rejectionRatio >= this.options.threshold) {
      this.decided = true;
      this.result = 'rejected';
      return true;
    }

    if (this.rounds < this.options.maxRounds) {
      this.rounds++;
      return false;
    }

    this.decided = true;
    this.result = approvalRatio > rejectionRatio ? 'approved' : 'rejected';
    return true;
  }

  getResults() {
    const summary = {
      totalVotes: this.votes.size,
      rounds: this.rounds,
      result: this.result,
      breakdown: {
        approval: 0,
        rejection: 0,
        abstention: 0
      }
    };

    this.votes.forEach(vote => {
      summary.breakdown[vote.vote] = (summary.breakdown[vote.vote] || 0) + 1;
    });

    return summary;
  }
}

export class NegotiationSession {
  constructor(agents, issue) {
    this.id = `neg-${Date.now()}`;
    this.agents = agents;
    this.issue = issue;
    this.proposals = new Map();
    this.positions = new Map();
    this.history = [];
    this.status = 'active';
    this.rounds = 0;
    this.maxRounds = 5;
    this.concessions = new Map();
  }

  submitProposal(agentId, proposal) {
    if (this.status !== 'active') return false;
    
    this.proposals.set(agentId, {
      proposal,
      timestamp: new Date(),
      round: this.rounds
    });
    
    return this.evaluateProposals();
  }

  setPosition(agentId, position) {
    this.positions.set(agentId, {
      position,
      strength: 1.0,
      flexibility: 0.5
    });
  }

  evaluateProposals() {
    const proposals = Array.from(this.proposals.values());
    if (proposals.length < 2) return 'incomplete';

    // Check for convergence
    const uniqueProposals = new Set(proposals.map(p => JSON.stringify(p.proposal)));
    if (uniqueProposals.size === 1) {
      this.status = 'converged';
      this.result = proposals[0].proposal;
      return 'converged';
    }

    // Check for compromise opportunity
    const compromise = this.findCompromise();
    if (compromise) {
      this.status = 'compromised';
      this.result = compromise;
      return 'compromised';
    }

    this.rounds++;
    if (this.rounds >= this.maxRounds) {
      this.status = 'deadlocked';
      return 'deadlocked';
    }

    return 'active';
  }

  findCompromise() {
    const proposals = Array.from(this.proposals.entries());
    if (proposals.length < 2) return null;

    // Simple average compromise
    const scores = proposals.map(([_, data]) => {
      const pos = this.positions.get(_);
      return {
        agentId: _,
        score: pos ? pos.strength : 1.0
      };
    });

    const totalWeight = scores.reduce((sum, s) => sum + s.score, 0);
    if (totalWeight === 0) return null;

    // Weight-based selection
    scores.sort((a, b) => b.score - a.score);
    const winner = scores[0];
    
    return {
      winner: winner.agentId,
      proposal: this.proposals.get(winner.agentId).proposal,
      winningScore: winner.score / totalWeight
    };
  }

  makeConcession(agentId, amount = 0.1) {
    const position = this.positions.get(agentId);
    if (position) {
      position.strength = Math.max(0, position.strength - amount);
      this.concessions.set(agentId, (this.concessions.get(agentId) || 0) + amount);
    }
  }

  forceResolution() {
    this.status = 'forced';
    const proposals = Array.from(this.proposals.entries());
    if (proposals.length > 0) {
      this.result = proposals[0][1].proposal;
    }
  }
}

export class SwarmCoordinator extends EventEmitter {
  constructor() {
    super();
    this.agents = new Map();
    this.taskQueue = new TaskQueue();
    this.activeTasks = new Map();
    this.messageQueue = [];
    this.votingSessions = new Map();
    this.negotiationSessions = new Map();
    this.conflictHistory = [];
    this.strategy = ConflictResolution.VOTING;
    this.settings = {
      maxParallelTasks: 5,
      taskTimeout: 300000, // 5 minutes
      votingThreshold: 0.6,
      minAgentsForTask: 1,
      autoScale: false,
      delegationDepth: 3,
      consensusRequired: true
    };
    this.delegationChain = new Map();
  }

  // Agent Management
  registerAgent(id, type, role = AgentRole.SPECIALIST, capabilities = []) {
    const agent = new Agent(id, type, role, capabilities);
    this.agents.set(id, agent);
    this.emit('agentRegistered', agent);
    return agent;
  }

  unregisterAgent(id) {
    const agent = this.agents.get(id);
    if (agent) {
      this.agents.delete(id);
      this.emit('agentUnregistered', agent);
    }
  }

  getAvailableAgents(capabilities = []) {
    return Array.from(this.agents.values())
      .filter(agent => agent.canHandle({ requiredCapabilities: capabilities }))
      .sort((a, b) => {
        const scoreA = a.priority * a.specialization[capabilities[0]] * a.getAvailability();
        const scoreB = b.priority * b.specialization[capabilities[0]] * b.getAvailability();
        return scoreB - scoreA;
      });
  }

  // Task Management
  createTask(description, type, requiredCapabilities = [], priority = 1, parentTask = null) {
    const id = `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const task = new Task(id, description, type, requiredCapabilities, priority, parentTask);
    this.taskQueue.addTask(task);
    this.emit('taskCreated', task);
    return task;
  }

  assignTask(taskId, agentId) {
    const task = this.taskQueue.getTask(taskId);
    const agent = this.agents.get(agentId);
    
    if (!task || !agent) return false;
    
    agent.assignTask(task);
    task.status = 'assigned';
    task.assignedAgent = agentId;
    task.startedAt = new Date();
    
    this.activeTasks.set(taskId, { task, agent, startedAt: Date.now() });
    this.emit('taskAssigned', { task, agent });
    
    return true;
  }

  // Delegation System
  delegateTask(task, fromAgentId, depth = 0) {
    if (depth >= this.settings.delegationDepth) {
      return { success: false, reason: 'max_depth_reached' };
    }

    const fromAgent = this.agents.get(fromAgentId);
    if (!fromAgent) return { success: false, reason: 'agent_not_found' };

    // Find best agent for delegation
    const availableAgents = this.getAvailableAgents(task.requiredCapabilities)
      .filter(a => a.id !== fromAgentId);

    if (availableAgents.length === 0) {
      return { success: false, reason: 'no_agents_available' };
    }

    const targetAgent = availableAgents[0];
    
    // Record delegation chain
    if (!this.delegationChain.has(task.id)) {
      this.delegationChain.set(task.id, []);
    }
    this.delegationChain.get(task.id).push({
      from: fromAgentId,
      to: targetAgent.id,
      depth,
      timestamp: new Date()
    });

    // Create delegation message
    const message = new AgentMessage(
      fromAgentId,
      targetAgent.id,
      MessageType.TASK,
      {
        task: task.id,
        description: task.description,
        type: task.type,
        originalRequester: task.context.originalRequester
      },
      { correlationId: task.id, priority: task.priority }
    );

    this.sendMessage(message);
    
    this.emit('taskDelegated', {
      task,
      from: fromAgentId,
      to: targetAgent.id,
      depth
    });

    return { success: true, delegatedTo: targetAgent.id };
  }

  // Message Passing
  sendMessage(message) {
    this.messageQueue.push(message);
    this.emit('messageSent', message);
    return message.id;
  }

  processMessages() {
    const processed = [];
    const remaining = [];

    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift();
      
      if (!message.decrementTTL()) {
        this.emit('messageExpired', message);
        continue;
      }

      const result = this.routeMessage(message);
      processed.push({ message, result });

      if (message.metadata.ttl > 0) {
        remaining.push(message);
      }
    }

    this.messageQueue = remaining;
    return processed;
  }

  routeMessage(message) {
    switch (message.type) {
      case MessageType.TASK:
        return this.handleTaskMessage(message);
      case MessageType.RESULT:
        return this.handleResultMessage(message);
      case MessageType.QUERY:
        return this.handleQueryMessage(message);
      case MessageType.VOTE:
        return this.handleVoteMessage(message);
      case MessageType.NEGOTIATE:
        return this.handleNegotiateMessage(message);
      case MessageType.CONFLICT:
        return this.handleConflictMessage(message);
      default:
        return { routed: false, reason: 'unknown_type' };
    }
  }

  handleTaskMessage(message) {
    const agent = this.agents.get(message.to);
    if (!agent) return { success: false, reason: 'agent_not_found' };

    const taskData = message.content;
    const task = this.taskQueue.getTask(taskData.task) || 
      this.createTask(taskData.description, taskData.type, taskData.requiredCapabilities || [], taskData.priority || 1);

    if (agent.canHandle(task)) {
      this.assignTask(task.id, agent.id);
      return { success: true, taskId: task.id, agentId: agent.id };
    }

    // Try delegation
    const delegation = this.delegateTask(task, message.to);
    if (delegation.success) {
      return { success: true, delegated: true, ...delegation };
    }

    return { success: false, reason: 'agent_unavailable' };
  }

  handleResultMessage(message) {
    const taskId = message.content.taskId;
    const success = message.content.success;
    const results = message.content.results;

    const activeTask = this.activeTasks.get(taskId);
    if (activeTask) {
      const { agent } = activeTask;
      const responseTime = Date.now() - activeTask.startedAt;
      agent.completeTask(success, responseTime);
      this.taskQueue.completeTask(taskId, success, results);
      this.activeTasks.delete(taskId);
      
      this.emit('taskCompleted', { taskId, success, results, agent: agent.id });
    }

    return { success: true };
  }

  handleQueryMessage(message) {
    const results = this.handleQuery(message.content);
    const response = new AgentMessage(
      message.to,
      message.from,
      MessageType.RESPONSE,
      results,
      { correlationId: message.metadata.correlationId }
    );
    this.sendMessage(response);
    return { success: true, responseId: response.id };
  }

  handleQuery(content) {
    const { queryType, ...params } = content;
    
    switch (queryType) {
      case 'get_agents':
        return Array.from(this.agents.values()).map(a => a.toJSON());
      case 'get_available_agents':
        return this.getAvailableAgents(params.capabilities || []).map(a => a.toJSON());
      case 'get_task_status':
        const task = this.taskQueue.getTask(params.taskId);
        return task ? task : null;
      case 'get_queue_status':
        return {
          pending: this.taskQueue.pendingQueue.length,
          active: this.activeTasks.size,
          completed: this.taskQueue.completedQueue.length,
          failed: this.taskQueue.failedQueue.length
        };
      default:
        return { error: 'unknown_query_type' };
    }
  }

  // Voting System
  initiateVoting(topic, options = {}) {
    const agents = options.agents || Array.from(this.agents.values());
    const session = new VotingMechanism(agents, topic, {
      ...options,
      threshold: options.threshold || this.settings.votingThreshold
    });
    
    this.votingSessions.set(session.id, session);
    this.emit('votingInitiated', session);
    
    return session;
  }

  castVote(sessionId, agentId, vote, justification = '') {
    const session = this.votingSessions.get(sessionId);
    if (!session) return { success: false, reason: 'session_not_found' };

    const success = session.castVote(agentId, vote, justification);
    
    if (session.decided) {
      this.emit('votingCompleted', session);
    }

    return { success, session: session.getResults() };
  }

  handleVoteMessage(message) {
    const { sessionId, vote, justification } = message.content;
    return this.castVote(sessionId, message.from, vote, justification);
  }

  // Negotiation System
  initiateNegotiation(issue, agentIds = []) {
    const agents = agentIds.length > 0 
      ? agentIds.map(id => this.agents.get(id)).filter(Boolean)
      : Array.from(this.agents.values());
    
    const session = new NegotiationSession(agents, issue);
    this.negotiationSessions.set(session.id, session);
    
    this.emit('negotiationInitiated', session);
    return session;
  }

  handleNegotiateMessage(message) {
    const session = this.negotiationSessions.get(message.content.sessionId);
    if (!session) return { success: false, reason: 'session_not_found' };

    const { proposal } = message.content;
    return session.submitProposal(message.from, proposal);
  }

  // Conflict Resolution
  detectConflict(taskId) {
    const task = this.taskQueue.getTask(taskId);
    if (!task) return null;

    // Check for contradictory requirements
    const conflicts = {
      taskId,
      agents: [],
      issues: []
    };

    // Check for resource conflicts
    this.activeTasks.forEach((active, activeTaskId) => {
      if (activeTaskId !== taskId && active.agent.id === task.assignedAgent) {
        conflicts.issues.push('resource_conflict');
      }
    });

    if (conflicts.issues.length > 0) {
      return conflicts;
    }

    return null;
  }

  resolveConflict(conflict, strategy = null) {
    const resolutionStrategy = strategy || this.strategy;
    let resolution = null;

    switch (resolutionStrategy) {
      case ConflictResolution.VOTING:
        const voting = this.initiateVoting(`Conflict for task ${conflict.taskId}`);
        resolution = { strategy: 'voting', sessionId: voting.id };
        break;
      
      case ConflictResolution.NEGOTIATION:
        const negotiation = this.initiateNegotiation(conflict);
        resolution = { strategy: 'negotiation', sessionId: negotiation.id };
        break;
      
      case ConflictResolution.PRIORITY:
        const priorityAgent = this.getAvailableAgents(conflict.agents)[0];
        resolution = { strategy: 'priority', winner: priorityAgent?.id };
        break;
      
      case ConflictResolution.ESCALATION:
        resolution = { strategy: 'escalation', escalated: true };
        this.emit('conflictEscalated', conflict);
        break;
      
      case ConflictResolution.ROUND_ROBIN:
        resolution = { strategy: 'round_robin', assigned: conflict.agents[0] };
        break;
    }

    this.conflictHistory.push({
      conflict,
      resolution,
      timestamp: new Date()
    });

    return resolution;
  }

  handleConflictMessage(message) {
    const conflict = message.content;
    const resolution = this.resolveConflict(conflict);
    
    this.emit('conflictResolved', { conflict, resolution });
    
    return { success: true, resolution };
  }

  // Swarm Intelligence Operations
  runSwarmAnalysis(problem, options = {}) {
    const { parallel = true, consensus = this.settings.consensusRequired } = options;
    
    // Distribute problem to multiple agents
    const analysisTasks = [];
    
    if (parallel) {
      // Create parallel analysis tasks
      const planningTask = this.createTask(
        `Analyze problem from planner perspective: ${problem}`,
        'analysis',
        ['planning', 'research'],
        1.5
      );
      analysisTasks.push(planningTask);

      const researchTask = this.createTask(
        `Research problem context: ${problem}`,
        'research',
        ['research'],
        1.5
      );
      analysisTasks.push(researchTask);

      const codeTask = this.createTask(
        `Analyze problem from code perspective: ${problem}`,
        'analysis',
        ['code'],
        1.5
      );
      analysisTasks.push(codeTask);
    }

    // Collect and synthesize results
    const results = this.synthesizeResults(analysisTasks);
    
    if (consensus) {
      const voting = this.initiateVoting('Problem Analysis Consensus', {
        agents: this.getAvailableAgents(['planning', 'research', 'code'])
      });
      return { results, consensus: voting.id };
    }

    return { results, consensus: null };
  }

  synthesizeResults(tasks) {
    const results = {
      analyses: [],
      consensus: null,
      confidence: 0,
      recommendations: []
    };

    tasks.forEach(task => {
      const taskData = this.taskQueue.getTask(task.id);
      if (taskData && taskData.results) {
        results.analyses.push(taskData.results);
      }
    });

    // Simple consensus: majority wins
    if (results.analyses.length > 0) {
      const firstAnalysis = results.analyses[0];
      let agreementCount = 1;

      results.analyses.slice(1).forEach(analysis => {
        if (JSON.stringify(analysis) === JSON.stringify(firstAnalysis)) {
          agreementCount++;
        }
      });

      results.consensus = agreementCount / results.analyses.length;
      results.confidence = results.consensus;
      results.recommendations = firstAnalysis?.recommendations || [];
    }

    return results;
  }

  // Consensus Building
  buildConsensus(proposals, threshold = 0.7) {
    const voting = this.initiateVoting('Consensus Building', {
      threshold,
      agents: this.getAvailableAgents()
    });

    proposals.forEach((proposal, index) => {
      const agent = this.getAvailableAgents()[index % this.getAvailableAgents().length];
      if (agent) {
        voting.castVote(agent.id, 'approval', `Proposal: ${proposal}`);
      }
    });

    return voting.getResults();
  }

  // Performance Monitoring
  getSwarmMetrics() {
    const agentMetrics = Array.from(this.agents.values()).map(agent => ({
      ...agent.toJSON(),
      availability: agent.getAvailability()
    }));

    const aggregateMetrics = {
      totalAgents: this.agents.size,
      activeAgents: agentMetrics.filter(a => a.state !== 'idle').length,
      avgSuccessRate: agentMetrics.reduce((sum, a) => sum + a.performanceMetrics.successRate, 0) / this.agents.size,
      totalTasksCompleted: agentMetrics.reduce((sum, a) => sum + a.performanceMetrics.tasksCompleted, 0),
      totalTasksFailed: agentMetrics.reduce((sum, a) => sum + a.performanceMetrics.tasksFailed, 0),
      avgResponseTime: agentMetrics.reduce((sum, a) => sum + a.performanceMetrics.avgResponseTime, 0) / this.agents.size,
      votingParticipation: agentMetrics.reduce((sum, a) => sum + a.performanceMetrics.votesParticipated, 0),
      votingWins: agentMetrics.reduce((sum, a) => sum + a.performanceMetrics.votesWon, 0)
    };

    const taskQueueMetrics = {
      pending: this.taskQueue.pendingQueue.length,
      active: this.activeTasks.size,
      completed: this.taskQueue.completedQueue.length,
      failed: this.taskQueue.failedQueue.length,
      total: this.taskQueue.tasks.size
    };

    return {
      agents: agentMetrics,
      aggregate: aggregateMetrics,
      taskQueue: taskQueueMetrics,
      conflicts: this.conflictHistory.length
    };
  }

  // Task Distribution
  distributeTasks() {
    const maxTasks = this.settings.maxParallelTasks;
    let assigned = 0;

    while (assigned < maxTasks) {
      const nextTask = this.taskQueue.nextTask();
      if (!nextTask) break;

      const availableAgents = this.getAvailableAgents(nextTask.requiredCapabilities);
      if (availableAgents.length === 0) continue;

      const bestAgent = availableAgents[0];
      this.assignTask(nextTask.id, bestAgent.id);
      assigned++;
    }

    return { assigned, remaining: this.taskQueue.pendingQueue.length };
  }

  // Health Check
  healthCheck() {
    const agentHealth = Array.from(this.agents.values()).map(agent => ({
      id: agent.id,
      state: agent.state,
      healthy: agent.state !== 'error' && agent.getAvailability() > 0.5
    }));

    const queueHealth = {
      pendingBacklog: this.taskQueue.pendingQueue.length,
      stuckTasks: this.taskQueue.pendingQueue.filter(taskId => {
        const task = this.taskQueue.getTask(taskId);
        return task && task.createdAt < new Date(Date.now() - this.settings.taskTimeout);
      }).length
    };

    const overall = {
      agents: agentHealth.every(a => a.healthy),
      queue: queueHealth.stuckTasks < 5,
      healthy: agentHealth.every(a => a.healthy) && queueHealth.stuckTasks < 5
    };

    return { agentHealth, queueHealth, overall };
  }
}

// Built-in Swarm Agents Factory
export function createSwarmAgents(coordinator) {
  const agents = [
    {
      id: 'planner-agent',
      type: AgentType.PLANNER,
      role: AgentRole.COORDINATOR,
      capabilities: ['planning', 'strategy', 'goal_setting']
    },
    {
      id: 'research-agent',
      type: AgentType.RESEARCHER,
      role: AgentRole.SPECIALIST,
      capabilities: ['research', 'analysis', 'information_gathering']
    },
    {
      id: 'code-agent',
      type: AgentType.CODE,
      role: AgentRole.EXECUTOR,
      capabilities: ['coding', 'debugging', 'refactoring']
    },
    {
      id: 'security-agent',
      type: AgentType.SECURITY,
      role: AgentRole.SPECIALIST,
      capabilities: ['security', 'validation', 'compliance']
    },
    {
      id: 'validator-agent',
      type: AgentType.VALIDATOR,
      role: AgentRole.MONITOR,
      capabilities: ['validation', 'testing', 'verification']
    },
    {
      id: 'executor-agent',
      type: AgentType.EXECUTOR,
      role: AgentRole.EXECUTOR,
      capabilities: ['execution', 'automation', 'deployment']
    },
    {
      id: 'reviewer-agent',
      type: AgentType.REVIEWER,
      role: AgentRole.ADVISOR,
      capabilities: ['review', 'critique', 'improvement']
    }
  ];

  agents.forEach(agent => {
    coordinator.registerAgent(agent.id, agent.type, agent.role, agent.capabilities);
  });

  return agents;
}

// Singleton instance
const swarmIntelligence = new SwarmCoordinator();
export default swarmIntelligence;
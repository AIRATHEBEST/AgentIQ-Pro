/**
 * HumanInTheLoopSystem.js
 * 
 * Human-in-the-loop controls with:
 * - Approval checkpoints
 * - Editable intermediate steps
 * - "Pause and ask" mode
 * - Human override capability
 * 
 * FEATURE #14: Human-in-the-Loop Controls
 */

class HumanInTheLoopSystem {
  constructor() {
    this.pauseRequests = [];
    this.approvals = {};
    this.humanFeedback = [];
    this.listeners = {};
  }

  on(event, cb) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(cb);
    return () => { this.listeners[event] = this.listeners[event].filter(x => x !== cb); };
  }

  emit(event, data) {
    if (this.listeners[event]) this.listeners[event].forEach(cb => cb(data));
  }

  /**
   * Request approval for an action
   */
  async requestApproval(action, context = {}) {
    const approval = {
      id: `approval-${Date.now()}`,
      action,
      context,
      status: 'pending',
      requestedAt: Date.now(),
      responseAt: null,
      response: null,
      reasoning: null,
    };

    this.approvals[approval.id] = approval;
    this.emit('approval_requested', approval);

    // Wait for human response
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        approval.status = 'timeout';
        reject(new Error('Approval timeout'));
      }, 300000); // 5 minute timeout

      const checkApproval = setInterval(() => {
        if (this.approvals[approval.id]?.status !== 'pending') {
          clearTimeout(timeout);
          clearInterval(checkApproval);

          const result = this.approvals[approval.id];
          if (result.status === 'approved') {
            resolve(result);
          } else if (result.status === 'modified') {
            resolve(result); // Return modified action
          } else {
            reject(new Error(`Approval ${result.status}`));
          }
        }
      }, 1000);
    });
  }

  /**
   * Human approves an action
   */
  approveAction(approvalId, reasoning = '') {
    const approval = this.approvals[approvalId];
    if (approval) {
      approval.status = 'approved';
      approval.responseAt = Date.now();
      approval.reasoning = reasoning;
      this.emit('action_approved', approval);
      return true;
    }
    return false;
  }

  /**
   * Human rejects an action
   */
  rejectAction(approvalId, reasoning = '') {
    const approval = this.approvals[approvalId];
    if (approval) {
      approval.status = 'rejected';
      approval.responseAt = Date.now();
      approval.reasoning = reasoning;
      this.emit('action_rejected', approval);
      return true;
    }
    return false;
  }

  /**
   * Human modifies and approves an action
   */
  modifyAndApprove(approvalId, modifiedAction, reasoning = '') {
    const approval = this.approvals[approvalId];
    if (approval) {
      approval.status = 'modified';
      approval.response = modifiedAction;
      approval.responseAt = Date.now();
      approval.reasoning = reasoning;
      this.emit('action_modified', approval);
      return true;
    }
    return false;
  }

  /**
   * Pause execution and ask human
   */
  async pauseAndAsk(message, options = {}) {
    const pauseRequest = {
      id: `pause-${Date.now()}`,
      message,
      options, // options for UI presentation (e.g., buttons, suggestions)
      timestamp: Date.now(),
      status: 'waiting',
      response: null,
    };

    this.pauseRequests.push(pauseRequest);
    this.emit('pause_requested', pauseRequest);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pauseRequest.status = 'timeout';
        reject(new Error('Pause timeout'));
      }, 300000);

      const checkResponse = setInterval(() => {
        const req = this.pauseRequests.find(p => p.id === pauseRequest.id);
        if (req?.status === 'answered') {
          clearTimeout(timeout);
          clearInterval(checkResponse);
          resolve(req.response);
        }
      }, 500);
    });
  }

  /**
   * Human responds to pause
   */
  respondToPause(pauseId, response) {
    const pauseRequest = this.pauseRequests.find(p => p.id === pauseId);
    if (pauseRequest) {
      pauseRequest.status = 'answered';
      pauseRequest.response = response;
      pauseRequest.respondedAt = Date.now();
      this.emit('pause_answered', pauseRequest);
      return true;
    }
    return false;
  }

  /**
   * Edit intermediate step output
   */
  editStepOutput(stepId, originalOutput, editedOutput, reasoning = '') {
    const feedback = {
      id: `edit-${Date.now()}`,
      stepId,
      originalOutput,
      editedOutput,
      reasoning,
      timestamp: Date.now(),
    };

    this.humanFeedback.push(feedback);
    this.emit('step_edited', feedback);

    return editedOutput;
  }

  /**
   * Human override for autonomous execution
   */
  overrideAutonomous(executionId, action) {
    const override = {
      id: `override-${Date.now()}`,
      executionId,
      action, // 'pause', 'cancel', 'skip_step', 'restart'
      timestamp: Date.now(),
    };

    this.emit('override_issued', override);
    return override;
  }

  /**
   * Set approval checkpoints in workflow
   */
  addApprovalCheckpoint(workflowId, stepIndices = []) {
    return {
      workflowId,
      checkpointSteps: stepIndices,
      required: true,
      created: Date.now(),
    };
  }

  /**
   * Enable "pause and ask" mode for entire execution
   */
  enablePauseAndAskMode(executionId, frequency = 'each_step') {
    this.emit('pause_ask_mode_enabled', {
      executionId,
      frequency, // 'each_step', 'each_tool_call', 'on_error'
      timestamp: Date.now(),
    });
  }

  /**
   * Disable "pause and ask" mode
   */
  disablePauseAndAskMode(executionId) {
    this.emit('pause_ask_mode_disabled', {
      executionId,
      timestamp: Date.now(),
    });
  }

  /**
   * Get pending approvals
   */
  getPendingApprovals() {
    return Object.values(this.approvals).filter(a => a.status === 'pending');
  }

  /**
   * Get pending pause requests
   */
  getPendingPauseRequests() {
    return this.pauseRequests.filter(p => p.status === 'waiting');
  }

  /**
   * Get approval history
   */
  getApprovalHistory(limit = 20) {
    return Object.values(this.approvals)
      .sort((a, b) => b.requestedAt - a.requestedAt)
      .slice(0, limit);
  }

  /**
   * Get human feedback summary
   */
  getFeedbackSummary() {
    return {
      totalEdits: this.humanFeedback.length,
      feedbackByStep: this.groupFeedbackByStep(),
      averageFeedbackTime: this.getAverageFeedbackTime(),
    };
  }

  /**
   * Group feedback by step
   */
  groupFeedbackByStep() {
    const grouped = {};
    for (const feedback of this.humanFeedback) {
      if (!grouped[feedback.stepId]) grouped[feedback.stepId] = [];
      grouped[feedback.stepId].push(feedback);
    }
    return grouped;
  }

  /**
   * Get average time for human feedback
   */
  getAverageFeedbackTime() {
    if (this.humanFeedback.length === 0) return 0;
    return this.humanFeedback
      .filter(f => f.timestamp)
      .reduce((sum, f) => sum + (f.timestamp - (f.requestedAt || 0)), 0) / this.humanFeedback.length;
  }

  /**
   * Clear completed approvals
   */
  clearCompletedApprovals() {
    const before = Object.keys(this.approvals).length;
    for (const id in this.approvals) {
      if (this.approvals[id].status !== 'pending') {
        delete this.approvals[id];
      }
    }
    return before - Object.keys(this.approvals).length;
  }
}

export default HumanInTheLoopSystem;

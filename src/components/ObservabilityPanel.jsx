/**
 * ObservabilityPanel.jsx
 * 
 * User-facing observability UI showing:
 * - Step-by-step agent reasoning timeline
 * - Tool usage visualization
 * - Decision tree display
 * - Failure explanations
 * - Execution timeline
 * 
 * TOP PRIORITY FEATURE #2
 */

import React, { useState, useEffect } from 'react';

const ObservabilityPanel = ({ execution, isLive = false, theme = 'dark' }) => {
  const [expandedSteps, setExpandedSteps] = useState(new Set());
  const [selectedPhase, setSelectedPhase] = useState(null);
  const [showTimeline, setShowTimeline] = useState(true);

  const toggleStepExpanded = (stepIndex) => {
    const next = new Set(expandedSteps);
    next.has(stepIndex) ? next.delete(stepIndex) : next.add(stepIndex);
    setExpandedSteps(next);
  };

  if (!execution) {
    return (
      <div className={`observability-panel ${theme}`}>
        <div className="observability-empty">
          <div className="empty-icon">🔍</div>
          <p>No execution data available</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`observability-panel ${theme} ${isLive ? 'live' : ''}`}>
      {/* Header */}
      <div className="observability-header">
        <div className="header-title">
          <span className="title-icon">🧠</span>
          <span className="title-text">Agent Reasoning</span>
          <span className={`status-badge ${execution.status}`}>{execution.status}</span>
        </div>
        <div className="header-controls">
          <button
            className={`timeline-toggle ${showTimeline ? 'active' : ''}`}
            onClick={() => setShowTimeline(!showTimeline)}
            title="Toggle timeline view"
          >
            ⏱️
          </button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="observability-summary">
        <div className="stat">
          <span className="stat-label">Duration</span>
          <span className="stat-value">{execution.duration ? `${(execution.duration / 1000).toFixed(1)}s` : '-'}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Steps</span>
          <span className="stat-value">{execution.steps?.length || 0}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Tools Used</span>
          <span className="stat-value">{execution.toolExecutions?.length || 0}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Success Rate</span>
          <span className="stat-value">
            {execution.steps?.length > 0
              ? `${Math.round((execution.steps.filter(s => s.status === 'completed').length / execution.steps.length) * 100)}%`
              : '-'}
          </span>
        </div>
      </div>

      {/* Main Content */}
      <div className="observability-content">
        {/* Decision Timeline */}
        {showTimeline && execution.steps && (
          <div className="decision-timeline">
            <h3 className="section-title">📍 Execution Timeline</h3>
            <div className="timeline-container">
              {execution.steps.map((step, idx) => (
                <DecisionNode
                  key={idx}
                  step={step}
                  index={idx}
                  isExpanded={expandedSteps.has(idx)}
                  onToggle={() => toggleStepExpanded(idx)}
                  isLast={idx === execution.steps.length - 1}
                />
              ))}
            </div>
          </div>
        )}

        {/* Tool Usage Visualization */}
        {execution.toolExecutions && execution.toolExecutions.length > 0 && (
          <div className="tool-usage-section">
            <h3 className="section-title">🛠️ Tool Usage</h3>
            <div className="tool-usage-grid">
              {execution.toolExecutions.map((tool, idx) => (
                <ToolCard key={idx} tool={tool} index={idx} />
              ))}
            </div>
          </div>
        )}

        {/* Decision Tree */}
        {execution.decisions && execution.decisions.length > 0 && (
          <div className="decision-tree-section">
            <h3 className="section-title">🌳 Decision Tree</h3>
            <div className="decision-tree">
              {execution.decisions.map((decision, idx) => (
                <DecisionTreeNode key={idx} decision={decision} />
              ))}
            </div>
          </div>
        )}

        {/* Error/Failure Information */}
        {execution.error && (
          <div className="failure-section">
            <h3 className="section-title">❌ Failure Analysis</h3>
            <div className="failure-details">
              <div className="failure-message">{execution.error}</div>
              {execution.failureContext && (
                <div className="failure-context">
                  <p>
                    <strong>Context:</strong> {execution.failureContext}
                  </p>
                </div>
              )}
              {execution.suggestedActions && (
                <div className="suggested-actions">
                  <p>
                    <strong>Suggested Actions:</strong>
                  </p>
                  <ul>
                    {execution.suggestedActions.map((action, idx) => (
                      <li key={idx}>{action}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Reasoning Log */}
        {execution.reasoning && (
          <div className="reasoning-log-section">
            <h3 className="section-title">💭 Reasoning Log</h3>
            <div className="reasoning-log">
              {execution.reasoning.map((entry, idx) => (
                <div key={idx} className="reasoning-entry">
                  <span className="reasoning-time">{new Date(entry.timestamp).toLocaleTimeString()}</span>
                  <span className="reasoning-text">{entry.thought}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="observability-footer">
        <span className="footer-time">{new Date(execution.startTime).toLocaleTimeString()}</span>
        {isLive && <span className="live-indicator">● Live</span>}
      </div>
    </div>
  );
};

/**
 * Individual decision/step node in the timeline
 */
const DecisionNode = ({ step, index, isExpanded, onToggle, isLast }) => {
  const statusIcon = {
    completed: '✓',
    failed: '✗',
    running: '⟳',
    pending: '○',
  }[step.status] || '?';

  const statusColor = {
    completed: '#4ade80',
    failed: '#f87171',
    running: '#60a5fa',
    pending: '#d1d5db',
  }[step.status] || '#d1d5db';

  return (
    <div className={`timeline-node ${step.status}`}>
      <div className="node-connector" style={{ borderColor: statusColor }}>
        <div className="node-dot" style={{ backgroundColor: statusColor }}>
          {statusIcon}
        </div>
        {!isLast && <div className="node-line" />}
      </div>

      <div className="node-content">
        <div className="node-header" onClick={onToggle} style={{ cursor: 'pointer' }}>
          <span className="node-title">
            {index + 1}. {step.name || `Step ${index + 1}`}
          </span>
          <span className={`node-toggle ${isExpanded ? 'expanded' : ''}`}>▼</span>
        </div>

        <div className="node-meta">
          <span className="meta-duration">⏱️ {step.duration ? `${step.duration}ms` : '-'}</span>
          {step.attempt > 1 && <span className="meta-retry">🔄 Attempt {step.attempt}</span>}
        </div>

        {isExpanded && (
          <div className="node-details">
            {step.description && <p className="detail-description">{step.description}</p>}

            {step.reasoning && (
              <div className="detail-reasoning">
                <strong>Reasoning:</strong>
                <p>{step.reasoning}</p>
              </div>
            )}

            {step.input && (
              <div className="detail-input">
                <strong>Input:</strong>
                <pre>{JSON.stringify(step.input, null, 2)}</pre>
              </div>
            )}

            {step.result && (
              <div className="detail-result">
                <strong>Result:</strong>
                <pre>{JSON.stringify(step.result, null, 2).substring(0, 500)}</pre>
              </div>
            )}

            {step.error && (
              <div className="detail-error">
                <strong>Error:</strong>
                <p>{step.error}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * Tool card in the tool usage visualization
 */
const ToolCard = ({ tool, index }) => {
  const successIcon = tool.result?.success ? '✓' : '✗';
  const successColor = tool.result?.success ? '#4ade80' : '#f87171';

  return (
    <div className="tool-card">
      <div className="tool-header">
        <span className="tool-icon">🔧</span>
        <span className="tool-name">{tool.tool}</span>
        <span className="tool-status" style={{ color: successColor }}>
          {successIcon}
        </span>
      </div>

      <div className="tool-details">
        {tool.reasoning && <p className="tool-reasoning">{tool.reasoning}</p>}

        <div className="tool-meta">
          {tool.status && <span className="tool-meta-item">{tool.status}</span>}
          {tool.result?.duration && <span className="tool-meta-item">⏱️ {tool.result.duration}ms</span>}
        </div>

        {tool.result?.error && (
          <div className="tool-error">
            <strong>Error:</strong> {tool.result.error}
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * Decision tree node
 */
const DecisionTreeNode = ({ decision }) => {
  return (
    <div className="decision-tree-node">
      <div className="decision-question">{decision.question}</div>
      <div className="decision-branches">
        {decision.branches?.map((branch, idx) => (
          <div key={idx} className={`decision-branch ${branch.taken ? 'taken' : ''}`}>
            <span className="branch-condition">{branch.condition}</span>
            <span className="branch-outcome">{branch.outcome}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ObservabilityPanel;

/**
 * Companion component: Observability Styles
 * Add this to your App.css
 */
const OBSERVABILITY_STYLES = `
/* ============ OBSERVABILITY PANEL ============ */

.observability-panel {
  background: #1a1a2e;
  color: #e0e0e0;
  border: 1px solid #404060;
  border-radius: 12px;
  padding: 20px;
  margin: 20px 0;
  font-family: 'Monaco', 'Courier New', monospace;
  max-height: 800px;
  overflow-y: auto;
}

.observability-panel.dark {
  background: #0f0f1e;
  color: #d4d4d4;
  border-color: #333355;
}

.observability-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  opacity: 0.6;
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 16px;
}

/* Header */
.observability-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 2px solid #404060;
  padding-bottom: 16px;
  margin-bottom: 16px;
}

.header-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: bold;
}

.title-icon {
  font-size: 20px;
}

.status-badge {
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: bold;
  text-transform: uppercase;
}

.status-badge.completed {
  background: #4ade8033;
  color: #4ade80;
}

.status-badge.failed {
  background: #f8717133;
  color: #f87171;
}

.status-badge.running {
  background: #60a5fa33;
  color: #60a5fa;
}

/* Summary Stats */
.observability-summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
  gap: 12px;
  margin-bottom: 20px;
  padding: 12px;
  background: #1f1f3a;
  border-radius: 8px;
}

.stat {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.stat-label {
  font-size: 12px;
  opacity: 0.7;
  text-transform: uppercase;
}

.stat-value {
  font-size: 16px;
  font-weight: bold;
  color: #60a5fa;
}

/* Timeline */
.timeline-container {
  display: flex;
  flex-direction: column;
  gap: 20px;
  margin: 20px 0;
  padding: 0 20px;
  position: relative;
}

.timeline-node {
  display: flex;
  gap: 20px;
}

.node-connector {
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
}

.node-dot {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  color: white;
  z-index: 2;
  background: #60a5fa;
}

.node-line {
  width: 2px;
  flex: 1;
  background: #404060;
  margin-top: 8px;
}

.node-content {
  flex: 1;
  background: #1f1f3a;
  border-left: 2px solid #404060;
  padding: 12px;
  border-radius: 6px;
}

.node-header {
  font-weight: bold;
  font-size: 14px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: #e0e0e0;
}

.node-title {
  flex: 1;
}

.node-toggle {
  transition: transform 0.2s;
  opacity: 0.6;
}

.node-toggle.expanded {
  transform: rotate(180deg);
}

.node-meta {
  display: flex;
  gap: 12px;
  margin-top: 8px;
  font-size: 12px;
  opacity: 0.7;
}

.node-details {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #404060;
  font-size: 13px;
}

.detail-description {
  margin: 8px 0;
  opacity: 0.8;
}

.detail-reasoning {
  margin: 12px 0;
  padding: 8px;
  background: #0a0a14;
  border-left: 3px solid #60a5fa;
  border-radius: 4px;
}

.detail-input,
.detail-result {
  margin: 12px 0;
}

.detail-input pre,
.detail-result pre {
  background: #0a0a14;
  padding: 8px;
  border-radius: 4px;
  overflow-x: auto;
  font-size: 11px;
  max-height: 150px;
}

.detail-error {
  margin: 12px 0;
  padding: 8px;
  background: #f8717133;
  border-left: 3px solid #f87171;
  border-radius: 4px;
  color: #f87171;
}

/* Tool Usage */
.tool-usage-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 12px;
  margin: 20px 0;
}

.tool-card {
  background: #1f1f3a;
  border: 1px solid #404060;
  border-radius: 8px;
  padding: 12px;
}

.tool-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: bold;
  margin-bottom: 8px;
}

.tool-name {
  flex: 1;
  font-size: 13px;
}

.tool-status {
  font-weight: bold;
}

.tool-details {
  font-size: 12px;
}

.tool-reasoning {
  margin: 8px 0;
  opacity: 0.8;
}

.tool-meta {
  display: flex;
  gap: 8px;
  margin: 8px 0;
  opacity: 0.7;
}

.tool-error {
  margin-top: 8px;
  padding: 6px;
  background: #f8717133;
  border-radius: 4px;
  color: #f87171;
  font-size: 11px;
}

/* Section Titles */
.section-title {
  font-size: 14px;
  font-weight: bold;
  margin: 20px 0 12px 0;
  display: flex;
  align-items: center;
  gap: 8px;
  color: #60a5fa;
}

/* Decision Tree */
.decision-tree {
  margin: 20px 0;
}

.decision-tree-node {
  background: #1f1f3a;
  border-left: 3px solid #60a5fa;
  padding: 12px;
  margin-bottom: 12px;
  border-radius: 6px;
}

.decision-question {
  font-weight: bold;
  margin-bottom: 8px;
  color: #60a5fa;
}

.decision-branches {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-left: 12px;
}

.decision-branch {
  display: flex;
  gap: 12px;
  font-size: 12px;
  opacity: 0.7;
  padding: 6px;
  background: #0a0a14;
  border-radius: 4px;
}

.decision-branch.taken {
  opacity: 1;
  background: #4ade8033;
  border-left: 2px solid #4ade80;
}

.branch-condition {
  flex: 1;
  font-weight: 500;
}

.branch-outcome {
  color: #60a5fa;
}

/* Failure Section */
.failure-section {
  margin-top: 20px;
  padding: 12px;
  background: #f8717133;
  border-left: 3px solid #f87171;
  border-radius: 6px;
}

.failure-details {
  font-size: 13px;
}

.failure-message {
  font-weight: bold;
  color: #f87171;
  margin-bottom: 8px;
}

.failure-context,
.suggested-actions {
  margin: 8px 0;
  padding: 6px;
  background: #0a0a14;
  border-radius: 4px;
}

.suggested-actions ul {
  margin: 6px 0 0 20px;
  padding: 0;
}

.suggested-actions li {
  margin: 4px 0;
  color: #a0a0ff;
}

/* Reasoning Log */
.reasoning-log {
  background: #1f1f3a;
  border-radius: 6px;
  padding: 12px;
  max-height: 250px;
  overflow-y: auto;
}

.reasoning-entry {
  display: flex;
  gap: 12px;
  margin-bottom: 8px;
  font-size: 12px;
  padding: 6px;
  background: #0a0a14;
  border-radius: 4px;
}

.reasoning-time {
  color: #60a5fa;
  font-weight: bold;
  min-width: 50px;
}

.reasoning-text {
  flex: 1;
  opacity: 0.8;
}

/* Footer */
.observability-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 20px;
  padding-top: 12px;
  border-top: 1px solid #404060;
  font-size: 12px;
  opacity: 0.6;
}

.live-indicator {
  color: #f87171;
  font-weight: bold;
  animation: pulse 1s infinite;
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

/* Scrollbar */
.observability-panel::-webkit-scrollbar {
  width: 6px;
}

.observability-panel::-webkit-scrollbar-track {
  background: transparent;
}

.observability-panel::-webkit-scrollbar-thumb {
  background: #404060;
  border-radius: 3px;
}

.observability-panel::-webkit-scrollbar-thumb:hover {
  background: #505080;
}
`;

export { OBSERVABILITY_STYLES };

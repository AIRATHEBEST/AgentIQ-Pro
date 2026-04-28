import React, { useState, useEffect } from 'react';
import { multiAgentSystem } from './MultiAgentSystem';

const MultiAgentSystemComponent = () => {
  const [status, setStatus] = useState({});
  const [isRunning, setIsRunning] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [pipelineResult, setPipelineResult] = useState(null);

  // Update status periodically
  useEffect(() => {
    const interval = setInterval(() => {
      setStatus(multiAgentSystem.getStatus());
    }, 2000);
    
    return () => clearInterval(interval);
  }, []);

  // Initial status load
  useEffect(() => {
    setStatus(multiAgentSystem.getStatus());
  }, []);

  const runTestTask = async () => {
    setIsRunning(true);
    setTestResult(null);
    
    try {
      const task = {
        name: 'Test Analysis',
        type: 'analysis',
        description: 'Analyze the benefits of multi-agent systems in AI applications'
      };
      
      const result = await multiAgentSystem.executeTask(task);
      setTestResult(result);
    } catch (error) {
      setTestResult({ success: false, error: error.message });
    } finally {
      setIsRunning(false);
      setStatus(multiAgentSystem.getStatus());
    }
  };

  const runCodeReviewPipeline = async () => {
    setIsRunning(true);
    setPipelineResult(null);
    
    try {
      // Sample code for testing
      const sampleCode = `function fibonacci(n) {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}`;
      
      const pipeline = {
        name: 'code-review',
        stages: [
          {
            name: 'analyze-code',
            type: 'analysis',
            description: 'Analyze the following JavaScript code for structure and quality',
            context: sampleCode,
            critical: true
          },
          {
            name: 'identify-issues',
            type: 'review',
            description: 'Identify potential bugs, security issues, and code smells',
            context: sampleCode,
            critical: false
          }
        ]
      };
      
      const result = await multiAgentSystem.executePipeline(pipeline);
      setPipelineResult(result);
    } catch (error) {
      setPipelineResult({ success: false, error: error.message });
    } finally {
      setIsRunning(false);
      setStatus(multiAgentSystem.getStatus());
    }
  };

  const clearMemory = () => {
    multiAgentSystem.clearMemory();
    setStatus(multiAgentSystem.getStatus());
  };

  return (
    <div className="multi-agent-system-component">
      <style jsx>{`
        .multi-agent-system-component {
          background: #1a1a2e;
          border-radius: 8px;
          padding: 16px;
          margin-top: 12px;
          color: #eee;
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        }
        
        .status-section {
          background: #2d2d44;
          border-radius: 6px;
          padding: 12px;
          margin-bottom: 16px;
        }
        
        .status-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
          gap: 8px;
          margin-top: 8px;
        }
        
        .status-item {
          background: #3d3d5c;
          border-radius: 4px;
          padding: 8px;
          text-align: center;
        }
        
        .status-value {
          font-size: 1.2em;
          font-weight: bold;
          color: #4ecca3;
        }
        
        .controls {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          margin-bottom: 16px;
        }
        
        .btn {
          background: #4ecca3;
          color: #000;
          border: none;
          border-radius: 4px;
          padding: 8px 12px;
          cursor: pointer;
          font-weight: bold;
          transition: background 0.2s;
        }
        
        .btn:hover {
          background: #3da58a;
        }
        
        .btn:disabled {
          background: #666;
          cursor: not-allowed;
        }
        
        .btn-secondary {
          background: #3d3d5c;
        }
        
        .btn-secondary:hover {
          background: #555;
        }
        
        .results-section {
          background: #2d2d44;
          border-radius: 6px;
          padding: 12px;
          margin-top: 16px;
        }
        
        .result-title {
          font-weight: bold;
          margin-bottom: 8px;
          color: #4ecca3;
        }
        
        .result-content {
          background: #1f1f2e;
          border-radius: 4px;
          padding: 12px;
          max-height: 200px;
          overflow-y: auto;
          white-space: pre-wrap;
          font-family: monospace;
          font-size: 0.9em;
        }
        
        .success {
          color: #4ecca3;
        }
        
        .error {
          color: #f95959;
        }
        
        .agent-list {
          margin-top: 12px;
        }
        
        .agent-item {
          display: flex;
          justify-content: space-between;
          padding: 6px 0;
          border-bottom: 1px solid #3d3d5c;
        }
        
        .agent-status {
          padding: 2px 8px;
          border-radius: 4px;
          font-size: 0.8em;
        }
        
        .status-idle {
          background: #4ecca3;
          color: #000;
        }
        
        .status-working {
          background: #f9d342;
          color: #000;
        }
        
        .status-error {
          background: #f95959;
          color: #fff;
        }
      `}</style>
      
      <h3>Multi-Agent System Control Panel</h3>
      
      {/* Status Section */}
      <div className="status-section">
        <h4>System Status</h4>
        <div className="status-grid">
          <div className="status-item">
            <div>Total Agents</div>
            <div className="status-value">{status.totalAgents || 0}</div>
          </div>
          <div className="status-item">
            <div>Active Agents</div>
            <div className="status-value">{status.activeAgents || 0}</div>
          </div>
          <div className="status-item">
            <div>Idle Agents</div>
            <div className="status-value">{status.idleAgents || 0}</div>
          </div>
          <div className="status-item">
            <div>Memory Entries</div>
            <div className="status-value">{status.sharedMemorySize || 0}</div>
          </div>
        </div>
      </div>
      
      {/* Agent List */}
      <div className="agent-list">
        <h4>Agent Pool</h4>
        {status.agents && status.agents.map((agent) => (
          <div key={agent.id} className="agent-item">
            <span>{agent.id} ({agent.role})</span>
            <span className={`agent-status status-${agent.status}`}>
              {agent.status}
            </span>
          </div>
        ))}
      </div>
      
      {/* Controls */}
      <div className="controls">
        <button 
          className="btn" 
          onClick={runTestTask} 
          disabled={isRunning}
        >
          {isRunning ? 'Running...' : 'Run Test Task'}
        </button>
        <button 
          className="btn" 
          onClick={runCodeReviewPipeline} 
          disabled={isRunning}
        >
          {isRunning ? 'Running...' : 'Run Code Review'}
        </button>
        <button 
          className="btn btn-secondary" 
          onClick={clearMemory}
        >
          Clear Memory
        </button>
      </div>
      
      {/* Results */}
      {(testResult || pipelineResult) && (
        <div className="results-section">
          <h4 className="result-title">Execution Results</h4>
          <div className="result-content">
            {testResult && (
              <div>
                <div className={testResult.success ? 'success' : 'error'}>
                  Test Task: {testResult.success ? 'Success' : 'Failed'}
                </div>
                {testResult.output && (
                  <div>Output: {testResult.output.substring(0, 200)}...</div>
                )}
                {testResult.error && (
                  <div>Error: {testResult.error}</div>
                )}
              </div>
            )}
            {pipelineResult && (
              <div>
                <div className={pipelineResult.success ? 'success' : 'error'}>
                  Pipeline: {pipelineResult.success ? 'Success' : 'Failed'}
                </div>
                {pipelineResult.results && (
                  <div>
                    {pipelineResult.results.map((stage, i) => (
                      <div key={i}>
                        Stage {i+1}: {stage.stage} - {stage.result.success ? '✓' : '✗'}
                      </div>
                    ))}
                  </div>
                )}
                {pipelineResult.error && (
                  <div>Error: {pipelineResult.error}</div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default MultiAgentSystemComponent;
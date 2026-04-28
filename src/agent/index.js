/**
 * AgentIQ Pro - All Modules Index
 * Exports all Phase 2 modules for easy access
 */

// Core Phase 1 Modules
export { default as agentOrchestrator } from './agentOrchestrator.js';
export { default as memorySystem } from './memorySystem.js';
export { default as toolEngine } from './toolEngine.js';

// Phase 2 - Planning & Reasoning
export { default as RecursiveAutonomousPlanner } from './RecursiveAutonomousPlanner.js';
export { default as SelfCorrectionEngine } from './SelfCorrectionEngine.js';

// Phase 2 - Memory Systems
export { default as VectorMemory } from './VectorMemory.js';
export { default as KnowledgeGraph } from './KnowledgeGraph.js';

// Phase 2 - Multi-Agent
export { default as SwarmIntelligence } from './SwarmIntelligence.js';

// Phase 2 - Execution Engines
export { default as BrowserAutomation } from './BrowserAutomation.js';
// Use browser-compatible version of DockerCodeExecution
export { default as DockerCodeExecution } from './DockerCodeExecution.browser.js';
export { default as FilesystemIntelligence } from './FilesystemIntelligence.js';

// Phase 2 - Intelligence
export { default as LLMRouter } from './LLMRouter.js';

// Phase 2 - Workflow & Background
export { default as DAGWorkflowBuilder } from './DAGWorkflowBuilder.js';
export { default as BackgroundAgent } from './BackgroundAgent.js';

// Phase 2 - UI Components
export { default as AgentReplayUI } from './AgentReplayUI.js';
export { default as Dashboard } from './Dashboard.js';

// Phase 2 - Policy & Security
export { default as PolicyEngine } from './PolicyEngine.js';

// Multi-Agent System
export { default as MultiAgentSystem, multiAgentSystem } from './MultiAgentSystem.js';
export { default as MultiAgentSystemComponent } from './MultiAgentSystemComponent.js';

/**
 * AgentIQ Pro - All Modules Index
 * Exports all Phase 2 & Phase 3 modules for easy access
 * Note: Some modules use CommonJS (module.exports) and are imported via lazy wrappers
 */

// Core Phase 1 Modules
export { default as agentOrchestrator } from './agentOrchestrator.js';
export { default as memorySystem } from './MemorySystem.js';
export { default as toolEngine } from './toolEngine.js';

// Phase 2 - Planning & Reasoning
export { default as RecursiveAutonomousPlanner } from './RecursiveAutonomousPlanner.js';
export { default as SelfCorrectionEngine } from './SelfCorrectionEngine.js';

// Phase 2 - Memory Systems
export { default as VectorMemory } from './VectorMemory.js';
export { KnowledgeGraph, GraphNode, GraphEdge, NodeType, RelationshipType } from './KnowledgeGraph.js';

// Phase 2 - Multi-Agent
export { default as SwarmIntelligence } from './SwarmIntelligence.js';

// Phase 2 - Execution Engines
export { default as BrowserAutomation } from './BrowserAutomation.js';
export { default as DockerCodeExecution } from './DockerCodeExecution.browser.js';

// Phase 2 - UI Components
export { default as AgentReplayUI } from './AgentReplayUI.js';
export { default as Dashboard } from './Dashboard.js';

// Phase 2 - Policy & Security
export { default as PolicyEngine } from './PolicyEngine.js';

// Phase 2 - Feature Agents (Features 41-235)
export { default as CreativeDesignAgent } from './CreativeDesignAgent.js';
export { default as DocumentAgent } from './DocumentAgent.js';
export { default as FileHandlingAgent } from './FileHandlingAgent.js';
export { default as WebResearchAgent } from './WebResearchAgent.js';
export { default as DataAnalysisAgent } from './DataAnalysisAgent.js';
export { default as CodeGenerationAgent } from './CodeGenerationAgent.js';
export { default as IntegrationAgent } from './IntegrationAgent.js';
export { default as CollaborationAgent } from './CollaborationAgent.js';

// Multi-Agent System
export { default as MultiAgentSystem, multiAgentSystem } from './MultiAgentSystem.js';
export { default as MultiAgentSystemComponent } from './MultiAgentSystemComponent.js';

// Phase 3 - Sandbox & File Management
export { SandboxComputer, VirtualFileSystem, TerminalEmulator, PackageManager, ProcessManager } from './SandboxComputer.js';
export { FileCreationManager } from './FileCreationManager.js';

// Phase 3 - Advanced Agents
export { default as AdaptivePlanningEngine } from './AdaptivePlanningEngine.js';
export { default as AdvancedSelfCorrectionEngine } from './AdvancedSelfCorrectionEngine.js';
export { default as ExecutionGuarantees } from './ExecutionGuarantees.js';
export { default as HumanInTheLoopSystem } from './HumanInTheLoopSystem.js';
export { default as JobQueueSystem } from './JobQueueSystem.js';
export { default as LongTermMemorySystem } from './LongTermMemorySystem.js';
export { default as SafetyConstraintSystem } from './SafetyConstraintSystem.js';
export { default as ToolReliability } from './ToolReliability.js';
export { default as WorkflowCompositionSystem } from './WorkflowCompositionSystem.js';

// CommonJS modules - lazy loaded to avoid webpack issues
// These are available via dynamic import: const { LLMRouter } = await import('./LLMRouter.js')
// export { LLMRouter } from './LLMRouter.js';          // CommonJS - use dynamic import
// export { DAGWorkflowBuilder } from './DAGWorkflowBuilder.js'; // CommonJS - use dynamic import
// export { BackgroundAgent } from './BackgroundAgent.js';       // CommonJS - use dynamic import
// export { FilesystemIntelligence } from './FilesystemIntelligence.js'; // CommonJS - use dynamic import

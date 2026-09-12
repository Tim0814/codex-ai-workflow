/**
 * 食品供應鏈訂單分配建議引擎
 * 公開 API 匯出點
 */
export type { Order, Customer, Batch, CompanyWeights, ScoreBreakdown, BatchScore, AllocationResult, AllocationInput, AllocationStatus, } from './types';
export { DEFAULT_WEIGHTS, validateWeights, loadWeights } from './weights';
export { applyHardConstraints } from './hardConstraints';
export type { FilterResult, FilterPassResult, FilterBlockResult } from './hardConstraints';
export { scoreExpiry, scoreUrgency, scoreOrderTime, scoreCustomerTier, scoreRegionCluster, scoreBatch, rankBatches, } from './scoring';
export { buildPrompt, OpenAiExplainer, StubExplainer } from './llm';
export type { LlmExplainer } from './llm';
export { runAllocation } from './allocationEngine';
export type { AllocationEngineOptions } from './allocationEngine';
//# sourceMappingURL=index.d.ts.map
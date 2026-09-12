/**
 * 食品供應鏈訂單分配建議引擎
 * 公開 API 匯出點
 */

// 型別
export type {
  Order,
  Customer,
  Batch,
  CompanyWeights,
  ScoreBreakdown,
  BatchScore,
  AllocationResult,
  AllocationInput,
  AllocationStatus,
} from './types';

// 權重工具
export { DEFAULT_WEIGHTS, validateWeights, loadWeights } from './weights';

// 硬性規則
export { applyHardConstraints } from './hardConstraints';
export type { FilterResult, FilterPassResult, FilterBlockResult } from './hardConstraints';

// 評分邏輯
export {
  scoreExpiry,
  scoreUrgency,
  scoreOrderTime,
  scoreCustomerTier,
  scoreRegionCluster,
  scoreBatch,
  rankBatches,
} from './scoring';

// LLM 解釋層
export { buildPrompt, OpenAiExplainer, StubExplainer } from './llm';
export type { LlmExplainer } from './llm';

// 主引擎
export { runAllocation } from './allocationEngine';
export type { AllocationEngineOptions } from './allocationEngine';

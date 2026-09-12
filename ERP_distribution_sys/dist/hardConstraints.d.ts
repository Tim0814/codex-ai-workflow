/**
 * 硬性規則過濾器（Hard Constraints）
 *
 * 在進入評分之前執行，以下情況直接淘汰候選批次：
 * 1. batch.availableQty < order.requestedQty（庫存不足）
 * 2. batch.expiryDate < today（已過期）
 * 3. 即時扣減後剩餘量不足（超賣防護）
 *
 * 這些規則與評分邏輯完全分離，不影響分數計算。
 */
import { Batch, Order } from './types';
export type FilterPassResult = {
    passed: true;
    candidates: Batch[];
};
export type FilterBlockResult = {
    passed: false;
    /** 人工可讀的阻斷原因，直接放入 AllocationResult.blockedReason */
    reason: string;
};
export type FilterResult = FilterPassResult | FilterBlockResult;
/**
 * 針對單筆訂單，從所有批次中篩出符合硬性規則的候選批次
 *
 * @param order   要評估的訂單
 * @param batches 所有可用批次（availableQty 應已反映即時庫存）
 * @param today   基準日期（預設 new Date()；測試時可注入固定日期）
 * @returns FilterPassResult（有候選）或 FilterBlockResult（需人工處理）
 */
export declare function applyHardConstraints(order: Order, batches: Batch[], today?: Date): FilterResult;
//# sourceMappingURL=hardConstraints.d.ts.map
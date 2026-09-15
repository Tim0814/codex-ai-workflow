/**
 * 分配引擎主體（AllocationEngine）
 *
 * 流程：
 * 1. 驗證權重設定
 * 2. 依訂單總分排序（讓高分訂單優先搶批次）
 * 3. 對每筆訂單：
 *    a. 硬性規則過濾
 *    b. 加權評分 & 排序候選批次
 *    c. 選出最高分批次，即時扣減 availableQty（防超賣）
 *    d. 燈號分流（green / yellow / red）
 *    e. 組裝輸出，呼叫 LLM 解釋層
 */
import { AllocationInput, AllocationResult } from "./types";
import { LlmExplainer } from "./llm";
export interface AllocationEngineOptions {
    /** LLM 解釋器實作，預設使用 StubExplainer（不呼叫真實 API） */
    explainer?: LlmExplainer;
    /** 基準日期，預設 new Date()；測試時可注入固定日期 */
    today?: Date;
    /**
     * 從 DB 查回的「已存在未取消分配」batchId 集合。
     * 引擎用此判斷跨執行期的重複分配（red 條件之一）。
     * 預設空集合（離線 / 測試情境）。
     */
    existingAllocatedBatchIds?: Set<string>;
}
/**
 * 執行完整的訂單分配流程
 *
 * @param input   訂單、客戶、批次與權重設定
 * @param options 可選設定（LLM 解釋器、基準日期、DB 中已存在分配的 batchId 集合）
 * @returns 每筆訂單的分配結果（順序與 input.orders 一致）
 *
 * @throws {Error} 權重設定不合法時
 * @throws {Error} 訂單中的 customerId 找不到對應客戶資料時
 */
export declare function runAllocation(input: AllocationInput, options?: AllocationEngineOptions): Promise<AllocationResult[]>;
//# sourceMappingURL=allocationEngine.d.ts.map
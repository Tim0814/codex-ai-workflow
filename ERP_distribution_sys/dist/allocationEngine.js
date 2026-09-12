"use strict";
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
 *    d. 組裝輸出，呼叫 LLM 解釋層
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.runAllocation = runAllocation;
const weights_1 = require("./weights");
const hardConstraints_1 = require("./hardConstraints");
const scoring_1 = require("./scoring");
const llm_1 = require("./llm");
// ─── 主引擎函式 ────────────────────────────────────────────────────────────────
/**
 * 執行完整的訂單分配流程
 *
 * @param input   訂單、客戶、批次與權重設定
 * @param options 可選設定（LLM 解釋器、基準日期）
 * @returns 每筆訂單的分配結果（順序與 input.orders 一致）
 *
 * @throws {Error} 權重設定不合法時
 * @throws {Error} 訂單中的 customerId 找不到對應客戶資料時
 */
async function runAllocation(input, options = {}) {
    const { orders, customers, batches, weights } = input;
    const today = options.today ?? new Date();
    const explainer = options.explainer ?? new llm_1.StubExplainer();
    // 步驟 1：驗證權重（不合法直接拋錯，不進行後續計算）
    (0, weights_1.validateWeights)(weights);
    // 步驟 2：建立批次的即時庫存快照（shallow copy，避免修改原始輸入）
    //         之後的扣減只對這份 workingBatches 進行
    const workingBatches = batches.map((b) => ({ ...b }));
    // 步驟 3：收集所有訂單的客戶區域，提供給 regionCluster 評分使用
    const pendingOrderRegions = new Set(orders.flatMap((order) => {
        const customer = customers.get(order.customerId);
        return customer ? [customer.region] : [];
    }));
    // 步驟 4：依訂單優先權預排序（高 tierScore 客戶的訂單先搶批次）
    //         此排序只決定「搶批次的順序」，不影響最終 AllocationResult 的輸出順序
    const orderedByPriority = [...orders].sort((a, b) => {
        const tierA = customers.get(a.customerId)?.tierScore ?? 0;
        const tierB = customers.get(b.customerId)?.tierScore ?? 0;
        if (tierB !== tierA)
            return tierB - tierA; // 等級高的先搶
        return a.createdAt.getTime() - b.createdAt.getTime(); // 同等級：先下單先搶
    });
    // 步驟 5：逐筆處理訂單，收集結果（key = orderId）
    const resultMap = new Map();
    for (const order of orderedByPriority) {
        const customer = customers.get(order.customerId);
        if (!customer) {
            throw new Error(`分配引擎：找不到訂單 ${order.orderId} 對應的客戶資料（customerId: ${order.customerId}）`);
        }
        // 5a. 硬性規則過濾
        const filterResult = (0, hardConstraints_1.applyHardConstraints)(order, workingBatches, today);
        if (!filterResult.passed) {
            // 被阻斷：組裝 blocked 結果
            const blockedResult = {
                orderId: order.orderId,
                status: 'blocked',
                recommendedBatchId: null,
                scores: zeroScores(),
                totalScore: 0,
                explanation: '',
                blockedReason: filterResult.reason,
            };
            blockedResult.explanation = await explainer.explain((0, llm_1.buildPrompt)(blockedResult));
            resultMap.set(order.orderId, blockedResult);
            continue;
        }
        // 5b. 加權評分 & 排序候選批次
        const ranked = (0, scoring_1.rankBatches)(filterResult.candidates, order, customer, weights, today, pendingOrderRegions);
        // 5c. 選最高分批次，即時扣減庫存（防超賣）
        const best = ranked[0];
        const chosenBatch = workingBatches.find((b) => b.batchId === best.batchId);
        chosenBatch.availableQty -= order.requestedQty;
        // 判斷是 recommended 還是 partial
        // partial 的情境：批次扣減後剩餘量已見底，其他訂單可能被降級
        // 這裡的 partial 語意：此訂單被滿足了，但批次已無法再供應其他訂單
        // （若需要支援「一筆訂單只被部分滿足」的語意，可在此擴充）
        const status = chosenBatch.availableQty < 0
            ? 'partial' // 不應發生（硬規則已擋），保守起見保留
            : 'recommended';
        const result = {
            orderId: order.orderId,
            status,
            recommendedBatchId: best.batchId,
            scores: best.scores,
            totalScore: best.totalScore,
            explanation: '',
            blockedReason: null,
        };
        result.explanation = await explainer.explain((0, llm_1.buildPrompt)(result));
        resultMap.set(order.orderId, result);
    }
    // 步驟 6：依原始 orders 順序輸出（保證輸出順序與輸入一致）
    return orders.map((order) => resultMap.get(order.orderId));
}
// ─── 輔助函式 ──────────────────────────────────────────────────────────────────
function zeroScores() {
    return {
        expiry: 0,
        urgency: 0,
        orderTime: 0,
        customerTier: 0,
        regionCluster: 0,
    };
}
//# sourceMappingURL=allocationEngine.js.map
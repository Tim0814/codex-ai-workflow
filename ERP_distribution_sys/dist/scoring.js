"use strict";
/**
 * 加權評分邏輯（Weighted Scoring Engine）
 *
 * 針對每個通過硬性規則的候選批次，計算五個分項分數（0~100）並加權求總分。
 * 此模組是純函式，無副作用，不修改任何傳入的物件。
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.scoreExpiry = scoreExpiry;
exports.scoreUrgency = scoreUrgency;
exports.scoreOrderTime = scoreOrderTime;
exports.scoreCustomerTier = scoreCustomerTier;
exports.scoreRegionCluster = scoreRegionCluster;
exports.scoreBatch = scoreBatch;
exports.rankBatches = rankBatches;
// ─── 評分常數 ──────────────────────────────────────────────────────────────────
/**
 * 效期分數衰減因子
 * daysUntilExpiry * EXPIRY_DECAY_FACTOR 決定扣分幅度
 * 預設：30 天後 score ≈ 0，3 天內 score ≈ 90
 */
const EXPIRY_DECAY_FACTOR = 100 / 30; // ≈ 3.33 分/天
/**
 * 交期急迫性參考天數：超過這個天數的訂單緊急度趨近 0
 */
const URGENCY_MAX_DAYS = 30;
/**
 * 下單時間參考天數：超過這個天數的訂單 "老舊度" 趨近 100
 * （越早下單分數越高，30 天前下的單得滿分）
 */
const ORDER_TIME_MAX_DAYS = 30;
// ─── 分項計算函式（皆回傳 0~100）──────────────────────────────────────────────
/**
 * 效期分數：效期越近分數越高（FEFO 邏輯）
 * score = max(0, 100 - daysUntilExpiry * factor)
 */
function scoreExpiry(batch, today) {
    const msPerDay = 86400000;
    const daysUntilExpiry = (batch.expiryDate.getTime() - today.getTime()) / msPerDay;
    return Math.max(0, 100 - daysUntilExpiry * EXPIRY_DECAY_FACTOR);
}
/**
 * 交期急迫性分數：距離要求交期越近分數越高
 * daysUntilDue <= 0  → 100（已逾期，最緊急）
 * daysUntilDue >= 30 → 0
 */
function scoreUrgency(order, today) {
    const msPerDay = 86400000;
    const daysUntilDue = (order.requestedDate.getTime() - today.getTime()) / msPerDay;
    if (daysUntilDue <= 0)
        return 100;
    return Math.max(0, 100 - (daysUntilDue / URGENCY_MAX_DAYS) * 100);
}
/**
 * 下單先後分數：越早下單分數越高
 * 下單時間距今越久 → 分數越高（最多 100）
 */
function scoreOrderTime(order, today) {
    const msPerDay = 86400000;
    const daysAgo = (today.getTime() - order.createdAt.getTime()) / msPerDay;
    return Math.min(100, (daysAgo / ORDER_TIME_MAX_DAYS) * 100);
}
/**
 * 客戶等級分數：直接取 customer.tierScore（已是 0~100）
 */
function scoreCustomerTier(customer) {
    return Math.max(0, Math.min(100, customer.tierScore));
}
/**
 * 區域集群分數
 * 規則：
 * - 批次倉庫區域與客戶所屬區域相同 → 100 分
 * - 不同區域 → 0 分（可依需求擴充為距離衰減）
 *
 * 加分邏輯擴充點：若同倉庫區域另有待處理訂單（pendingOrderRegions），
 * 代表可合併出貨，也給予滿分。
 */
function scoreRegionCluster(batch, customer, pendingOrderRegions = new Set()) {
    if (batch.warehouseRegion === customer.region)
        return 100;
    if (pendingOrderRegions.has(batch.warehouseRegion))
        return 100;
    return 0;
}
// ─── 單批次完整評分 ────────────────────────────────────────────────────────────
/**
 * 計算單一批次對某訂單的完整分項分數與加權總分
 *
 * @param batch     候選批次
 * @param order     目標訂單
 * @param customer  訂單對應的客戶
 * @param weights   公司加權設定
 * @param today     基準日期（可注入，方便測試）
 * @param pendingOrderRegions 同時待處理的其他訂單的客戶區域集合（用於 regionCluster 加分）
 */
function scoreBatch(batch, order, customer, weights, today = new Date(), pendingOrderRegions = new Set()) {
    const scores = {
        expiry: scoreExpiry(batch, today),
        urgency: scoreUrgency(order, today),
        orderTime: scoreOrderTime(order, today),
        customerTier: scoreCustomerTier(customer),
        regionCluster: scoreRegionCluster(batch, customer, pendingOrderRegions),
    };
    const totalScore = scores.expiry * weights.expiry +
        scores.urgency * weights.urgency +
        scores.orderTime * weights.orderTime +
        scores.customerTier * weights.customerTier +
        scores.regionCluster * weights.regionCluster;
    return {
        batchId: batch.batchId,
        scores,
        totalScore,
    };
}
// ─── 多批次排序 ────────────────────────────────────────────────────────────────
/**
 * 對所有候選批次進行評分並依總分由高到低排序
 * 回傳的陣列不修改傳入的 batches 陣列
 */
function rankBatches(candidates, order, customer, weights, today = new Date(), pendingOrderRegions = new Set()) {
    return candidates
        .map((batch) => scoreBatch(batch, order, customer, weights, today, pendingOrderRegions))
        .sort((a, b) => b.totalScore - a.totalScore);
}
//# sourceMappingURL=scoring.js.map
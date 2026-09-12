/**
 * 加權評分邏輯（Weighted Scoring Engine）
 *
 * 針對每個通過硬性規則的候選批次，計算五個分項分數（0~100）並加權求總分。
 * 此模組是純函式，無副作用，不修改任何傳入的物件。
 */
import { Batch, BatchScore, CompanyWeights, Customer, Order } from './types';
/**
 * 效期分數：效期越近分數越高（FEFO 邏輯）
 * score = max(0, 100 - daysUntilExpiry * factor)
 */
export declare function scoreExpiry(batch: Batch, today: Date): number;
/**
 * 交期急迫性分數：距離要求交期越近分數越高
 * daysUntilDue <= 0  → 100（已逾期，最緊急）
 * daysUntilDue >= 30 → 0
 */
export declare function scoreUrgency(order: Order, today: Date): number;
/**
 * 下單先後分數：越早下單分數越高
 * 下單時間距今越久 → 分數越高（最多 100）
 */
export declare function scoreOrderTime(order: Order, today: Date): number;
/**
 * 客戶等級分數：直接取 customer.tierScore（已是 0~100）
 */
export declare function scoreCustomerTier(customer: Customer): number;
/**
 * 區域集群分數
 * 規則：
 * - 批次倉庫區域與客戶所屬區域相同 → 100 分
 * - 不同區域 → 0 分（可依需求擴充為距離衰減）
 *
 * 加分邏輯擴充點：若同倉庫區域另有待處理訂單（pendingOrderRegions），
 * 代表可合併出貨，也給予滿分。
 */
export declare function scoreRegionCluster(batch: Batch, customer: Customer, pendingOrderRegions?: Set<string>): number;
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
export declare function scoreBatch(batch: Batch, order: Order, customer: Customer, weights: CompanyWeights, today?: Date, pendingOrderRegions?: Set<string>): BatchScore;
/**
 * 對所有候選批次進行評分並依總分由高到低排序
 * 回傳的陣列不修改傳入的 batches 陣列
 */
export declare function rankBatches(candidates: Batch[], order: Order, customer: Customer, weights: CompanyWeights, today?: Date, pendingOrderRegions?: Set<string>): BatchScore[];
//# sourceMappingURL=scoring.d.ts.map
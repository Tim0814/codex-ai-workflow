/**
 * CompanyWeights 驗證與預設值
 *
 * 權重必須由外部設定（設定檔 / DB）載入，此模組只提供：
 * 1. 食品業合理預設值
 * 2. 總和驗證函式
 * 3. 從 JSON 物件載入並驗證的工廠函式
 */
import { CompanyWeights } from './types';
/**
 * 預設值設計原則：
 * - 食品業最重視 FEFO（先過期先出），expiry 給最高權重 0.35
 * - 交期急迫性次之 0.25（客戶滿意度）
 * - 客戶等級 0.20（維護重要客戶關係）
 * - 下單時間 0.12（先進先出的公平性）
 * - 區域集群 0.08（降低物流成本，但不是主要考量）
 */
export declare const DEFAULT_WEIGHTS: Readonly<CompanyWeights>;
/**
 * 驗證 CompanyWeights 是否合法
 *
 * 規則：
 * 1. 所有欄位必須存在且為數字
 * 2. 每個欄位必須在 [0, 1] 範圍內
 * 3. 五個欄位總和必須等於 1（容許 ±0.001 浮點誤差）
 *
 * @throws {Error} 驗證失敗時拋出帶有明確說明的錯誤
 */
export declare function validateWeights(weights: CompanyWeights): void;
/**
 * 從原始物件（設定檔 JSON、DB 查詢結果等）載入並驗證權重
 *
 * @param raw 任意 object，函式內部會做完整驗證
 * @returns 驗證通過的 CompanyWeights
 * @throws {Error} 驗證失敗時
 */
export declare function loadWeights(raw: unknown): CompanyWeights;
//# sourceMappingURL=weights.d.ts.map
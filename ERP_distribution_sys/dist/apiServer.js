"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const allocationEngine_1 = require("./allocationEngine");
const llmGemini_1 = require("./llmGemini");
const mockData_json_1 = __importDefault(require("./mockData.json"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 4000;
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// 靜態/動態傳入轉換 helper
function parseDates(obj, dateKeys) {
    const result = { ...obj };
    for (const key of dateKeys) {
        if (result[key]) {
            result[key] = new Date(result[key]);
        }
    }
    return result;
}
/**
 * 查詢 Supabase 中所有未取消的分配紀錄，回傳已佔用的 batch_id 集合。
 * 用於燈號分流的 RED-3 重複分配檢查。
 *
 * 使用動態 import 避免在 @supabase/supabase-js 未安裝時造成啟動錯誤；
 * 若環境變數未設定或套件不存在，記錄警告並回傳空集合（降級處理）。
 */
async function fetchExistingAllocatedBatchIds() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey)
        return new Set();
    let createClient;
    try {
        // 動態載入，套件不存在時不影響其他功能
        const mod = await Promise.resolve(`${'@supabase/supabase-js'}`).then(s => __importStar(require(s)));
        createClient = mod.createClient;
    }
    catch {
        console.warn('[燈號分流] @supabase/supabase-js 未安裝，跳過重複分配檢查');
        return new Set();
    }
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data, error } = await supabase
        .from('allocation_recommendations')
        .select('batch_id')
        .neq('status', 'cancelled');
    if (error) {
        console.warn('[燈號分流] 查詢現有分配紀錄失敗，跳過重複分配檢查：', error.message);
        return new Set();
    }
    const ids = new Set();
    for (const row of (data ?? [])) {
        if (row.batch_id)
            ids.add(row.batch_id);
    }
    return ids;
}
app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'Allocation Engine API' });
});
app.post('/api/allocate', async (req, res) => {
    try {
        const inputBody = req.body && Object.keys(req.body).length > 0 ? req.body : mockData_json_1.default;
        // 處理 Date 轉型與 Map 結構
        const rawOrders = inputBody.orders || mockData_json_1.default.orders;
        const rawCustomers = inputBody.customers || mockData_json_1.default.customers;
        const rawBatches = inputBody.batches || mockData_json_1.default.batches;
        const weights = inputBody.weights || mockData_json_1.default.weights;
        const orders = rawOrders.map((o) => parseDates(o, ['requestedDate', 'createdAt']));
        const customersMap = new Map();
        if (Array.isArray(rawCustomers)) {
            for (const c of rawCustomers) {
                customersMap.set(c.customerId, c);
            }
        }
        else {
            for (const [key, val] of Object.entries(rawCustomers)) {
                customersMap.set(key, val);
            }
        }
        const batches = rawBatches.map((b) => parseDates(b, ['expiryDate']));
        // 在執行引擎之前查詢現有分配，確保 RED-3 重複分配檢查有最新資料
        const existingAllocatedBatchIds = await fetchExistingAllocatedBatchIds();
        const allocationInput = {
            orders,
            customers: customersMap,
            batches,
            weights,
        };
        const explainer = new llmGemini_1.GeminiExplainer({ apiKey: process.env.GEMINI_API_KEY });
        const results = await (0, allocationEngine_1.runAllocation)(allocationInput, { explainer, existingAllocatedBatchIds });
        return res.json({
            success: true,
            timestamp: new Date().toISOString(),
            results,
        });
    }
    catch (error) {
        console.error('[AllocationEngine Server Error]:', error);
        return res.status(500).json({
            success: false,
            error: error.message || '分配引擎計算發生未知錯誤',
        });
    }
});
app.listen(PORT, () => {
    console.log(`🚀 ERP Allocation Engine Express API running on http://localhost:${PORT}`);
});
//# sourceMappingURL=apiServer.js.map
"use strict";
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
        const allocationInput = {
            orders,
            customers: customersMap,
            batches,
            weights,
        };
        const explainer = new llmGemini_1.GeminiExplainer();
        const results = await (0, allocationEngine_1.runAllocation)(allocationInput, { explainer });
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
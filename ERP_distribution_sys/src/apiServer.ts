import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { runAllocation } from './allocationEngine';
import { GeminiExplainer } from './llmGemini';
import { AllocationInput, Customer, Order, Batch } from './types';
import mockData from './mockData.json';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// 靜態/動態傳入轉換 helper
function parseDates<T extends { [key: string]: any }>(obj: T, dateKeys: string[]): T {
  const result = { ...obj } as any;
  for (const key of dateKeys) {
    if (result[key]) {
      result[key] = new Date(result[key]);
    }
  }
  return result as T;
}

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'Allocation Engine API' });
});

app.post('/api/allocate', async (req: Request, res: Response) => {
  try {
    const inputBody = req.body && Object.keys(req.body).length > 0 ? req.body : mockData;

    // 處理 Date 轉型與 Map 結構
    const rawOrders = inputBody.orders || mockData.orders;
    const rawCustomers = inputBody.customers || mockData.customers;
    const rawBatches = inputBody.batches || mockData.batches;
    const weights = inputBody.weights || mockData.weights;

    const orders: Order[] = rawOrders.map((o: any) =>
      parseDates(o, ['requestedDate', 'createdAt']),
    );

    const customersMap = new Map<string, Customer>();
    if (Array.isArray(rawCustomers)) {
      for (const c of rawCustomers) {
        customersMap.set(c.customerId, c);
      }
    } else {
      for (const [key, val] of Object.entries(rawCustomers)) {
        customersMap.set(key, val as Customer);
      }
    }

    const batches: Batch[] = rawBatches.map((b: any) => parseDates(b, ['expiryDate']));

    const allocationInput: AllocationInput = {
      orders,
      customers: customersMap,
      batches,
      weights,
    };

    const explainer = new GeminiExplainer({ apiKey: process.env.GEMINI_API_KEY });
    const results = await runAllocation(allocationInput, { explainer });

    return res.json({
      success: true,
      timestamp: new Date().toISOString(),
      results,
    });
  } catch (error: any) {
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

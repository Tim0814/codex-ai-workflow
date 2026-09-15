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

/**
 * 查詢 Supabase 中所有未取消的分配紀錄，回傳已佔用的 batch_id 集合。
 * 用於燈號分流的 RED-3 重複分配檢查。
 *
 * 使用動態 import 避免在 @supabase/supabase-js 未安裝時造成啟動錯誤；
 * 若環境變數未設定或套件不存在，記錄警告並回傳空集合（降級處理）。
 */
async function fetchExistingAllocatedBatchIds(): Promise<Set<string>> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return new Set<string>();

  let createClient: (url: string, key: string) => any;
  try {
    // 動態載入，套件不存在時不影響其他功能
    const mod = await import('@supabase/supabase-js' as any);
    createClient = mod.createClient;
  } catch {
    console.warn('[燈號分流] @supabase/supabase-js 未安裝，跳過重複分配檢查');
    return new Set<string>();
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data, error } = await supabase
    .from('allocation_recommendations')
    .select('batch_id')
    .neq('status', 'cancelled');

  if (error) {
    console.warn('[燈號分流] 查詢現有分配紀錄失敗，跳過重複分配檢查：', error.message);
    return new Set<string>();
  }

  const ids = new Set<string>();
  for (const row of (data ?? []) as Array<{ batch_id: string | null }>) {
    if (row.batch_id) ids.add(row.batch_id);
  }
  return ids;
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

    // 在執行引擎之前查詢現有分配，確保 RED-3 重複分配檢查有最新資料
    const existingAllocatedBatchIds = await fetchExistingAllocatedBatchIds();

    const allocationInput: AllocationInput = {
      orders,
      customers: customersMap,
      batches,
      weights,
    };

    const explainer = new GeminiExplainer({ apiKey: process.env.GEMINI_API_KEY });
    const results = await runAllocation(allocationInput, { explainer, existingAllocatedBatchIds });

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

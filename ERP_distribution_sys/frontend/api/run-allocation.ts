import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { runAllocation } from '../lib/allocationEngine';
import type { AllocationInput, Order, Customer, Batch, CompanyWeights, AllocationResult } from '../lib/types';
import mockData from '../lib/mockData.json';
import { DEFAULT_WEIGHTS } from '../lib/weights';

function calculateConfidence(status: string, totalScore: number): string {
  if (status === 'blocked') return 'manual';
  if (totalScore >= 80) return 'auto_recommend';
  if (totalScore >= 60) return 'review';
  return 'low_confidence';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = req.body ?? {};
    const inputData =
      body && typeof body === 'object' && body.orders && body.batches
        ? body
        : mockData;

    // 反序列化：把 JSON 字串日期轉回 Date 物件
    const orders: Order[] = inputData.orders.map((o: any) => ({
      ...o,
      requestedDate: new Date(o.requestedDate),
      createdAt: new Date(o.createdAt),
    }));

    const batches: Batch[] = inputData.batches.map((b: any) => ({
      ...b,
      expiryDate: new Date(b.expiryDate),
    }));

    const customersMap = new Map<string, Customer>(
      (inputData.customers ?? []).map((c: any) => [c.customerId, c as Customer])
    );

    const weights: CompanyWeights = inputData.weights ?? DEFAULT_WEIGHTS;

    const input: AllocationInput = { orders, customers: customersMap, batches, weights };
    const results: AllocationResult[] = await runAllocation(input);

    const now = new Date().toISOString();
    const processed = results.map((item) => ({
      id: `rec-${item.orderId}-${Date.now()}`,
      order_id: item.orderId,
      batch_id: item.recommendedBatchId,
      status: item.status,
      confidence: calculateConfidence(item.status, item.totalScore),
      total_score: item.totalScore,
      scores_json: item.scores,
      explanation: item.explanation ?? '',
      blocked_reason: item.blockedReason ?? null,
      review_action: null,
      override_reason: null,
      reviewed_at: null,
      created_at: now,
    }));

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY;
    if (supabaseUrl && supabaseKey) {
      const supabase = createClient(supabaseUrl, supabaseKey);
      for (const rec of processed) {
        await supabase.from('allocation_recommendations').upsert(rec);
      }
    }

    return res.status(200).json({ success: true, count: processed.length, data: processed });
  } catch (error) {
    console.error('Run allocation error:', error);
    return res.status(500).json({ error: 'Internal server error', details: error instanceof Error ? error.message : String(error) });
  }
}

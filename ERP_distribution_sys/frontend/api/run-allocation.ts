import type { VercelRequest, VercelResponse } from '@vercel/node';
import { randomUUID } from 'crypto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { runAllocation } from '../lib/allocationEngine.js';
import type { AllocationInput, Order, Customer, Batch, CompanyWeights, AllocationResult } from '../lib/types.js';
import mockData from '../lib/mockData.json' with { type: 'json' };
import { DEFAULT_WEIGHTS } from '../lib/weights.js';

// ─── 輔助函式 ──────────────────────────────────────────────────────────────────

function calculateConfidence(status: string, totalScore: number): string {
  if (status === 'blocked') return 'manual';
  if (totalScore >= 80) return 'auto_recommend';
  if (totalScore >= 60) return 'review';
  return 'low_confidence';
}

/**
 * 從 Supabase 查詢目前資料庫中所有「未取消」的分配紀錄，
 * 回傳已被佔用的 batch_id 集合。
 *
 * 查詢條件：status NOT IN ('cancelled')
 * 若查詢失敗，記錄警告並回傳空集合（降級處理，不阻斷主流程）。
 */
async function fetchExistingAllocatedBatchIds(supabase: SupabaseClient): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('allocation_recommendations')
    .select('batch_id')
    .neq('status', 'cancelled');

  if (error) {
    console.warn('[燈號分流] 查詢現有分配紀錄失敗，跳過重複分配檢查：', error.message);
    return new Set<string>();
  }

  const ids = new Set<string>();
  for (const row of data ?? []) {
    if (row.batch_id) ids.add(row.batch_id as string);
  }
  return ids;
}

// ─── Vercel Serverless Handler ─────────────────────────────────────────────────

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

    // 建立 Supabase client（若環境變數存在）；查詢現有未取消的分配 batchId 集合
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY;
    let supabase: SupabaseClient | null = null;
    let existingAllocatedBatchIds = new Set<string>();

    if (supabaseUrl && supabaseKey) {
      supabase = createClient(supabaseUrl, supabaseKey);
      // 在執行分配引擎之前先查詢，確保燈號判斷能偵測跨執行期的重複分配
      existingAllocatedBatchIds = await fetchExistingAllocatedBatchIds(supabase);
    }

    const input: AllocationInput = { orders, customers: customersMap, batches, weights };

    // 將現有分配集合傳入引擎，引擎內部同步進行燈號分流
    const results: AllocationResult[] = await runAllocation(input, {
      existingAllocatedBatchIds,
    });

    const now = new Date().toISOString();
    const processed = results.map((item) => ({
      id: randomUUID(),
      order_id: item.orderId,
      batch_id: item.recommendedBatchId,
      status: item.status,
      confidence: calculateConfidence(item.status, item.totalScore),
      total_score: item.totalScore,
      scores_json: item.scores,
      explanation: item.explanation ?? '',
      blocked_reason: item.blockedReason ?? null,
      // 燈號欄位
      signal_color: item.signalColor,
      signal_reason: item.signalReason,
      review_action: null,
      override_reason: null,
      reviewed_at: null,
      created_at: now,
    }));

    if (supabase) {
      for (const rec of processed) {
        // 寫入前檢查：同一 batch_id 是否已有衝突的分配紀錄
        //
        // ⚠️  注意：這裡故意用白名單（.or(...)）而非排除法（.neq('review_action','rejected')）。
        // 原因：SQL 的 NULL 比較規則是「NULL <> 任何值」結果不為 TRUE，
        // 所以 .neq('review_action','rejected') 底層轉成 WHERE review_action <> 'rejected'，
        // 會把 review_action IS NULL 的紀錄一併排除，造成「尚未審核」的佔用紀錄被漏掉。
        // 改用白名單明確列出算佔用的三種狀態（null / approved / overridden），
        // 唯一不算佔用的 rejected 自然就被排除，不會有 NULL 漏網的問題。
        if (rec.batch_id) {
          const { data: conflicts, error: checkError } = await supabase
            .from('allocation_recommendations')
            .select('id, order_id, status, review_action')
            .eq('batch_id', rec.batch_id)
            .in('status', ['recommended', 'partial'])
            .or('review_action.is.null,review_action.eq.approved,review_action.eq.overridden')
            .limit(1);

          if (checkError) {
            console.warn('衝突檢查查詢失敗，略過檢查繼續寫入：', checkError.message);
          } else if (conflicts && conflicts.length > 0) {
            const c = conflicts[0];
            return res.status(409).json({
              error: '分配衝突',
              message: `批次 ${rec.batch_id} 已存在未結案的分配紀錄（紀錄 ID：${c.id}，訂單：${c.order_id}，狀態：${c.status}，審核動作：${c.review_action ?? '尚未審核'}），無法重複分配。`,
            });
          }
        }

        const { error } = await supabase.from('allocation_recommendations').insert(rec);
        if (error) {
          console.error('Supabase insert error:', error);
          throw new Error(`Failed to insert recommendation: ${error.message}`);
        }
      }
    }

    return res.status(200).json({ success: true, count: processed.length, data: processed });
  } catch (error) {
    console.error('Run allocation error:', error);
    return res.status(500).json({ error: 'Internal server error', details: error instanceof Error ? error.message : String(error) });
  }
}

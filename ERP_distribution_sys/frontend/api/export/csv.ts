import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return res.status(503).json({ error: 'Supabase not configured' });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data, error } = await supabase.from('allocation_recommendations').select('*');
    if (error) throw error;

    const records = data ?? [];
    const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;

    const header = [
      'ID', 'Order ID', 'Batch ID', 'Status', 'Confidence', 'Total Score',
      'Expiry Score', 'Urgency Score', 'Order Time Score', 'Tier Score', 'Region Score',
      'Review Action', 'Override Reason', 'Explanation', 'Blocked Reason', 'Reviewed At',
    ].map(escape).join(',');

    const rows = records.map((r) => {
      const s = r.scores_json ?? {};
      return [
        r.id, r.order_id, r.batch_id ?? '', r.status, r.confidence, r.total_score,
        s.expiry ?? 0, s.urgency ?? 0, s.orderTime ?? 0, s.customerTier ?? 0, s.regionCluster ?? 0,
        r.review_action ?? 'Pending', r.override_reason ?? '', r.explanation ?? '',
        r.blocked_reason ?? '', r.reviewed_at ?? '',
      ].map(escape).join(',');
    });

    const csv = [header, ...rows].join('\r\n');
    const filename = `allocation_report_${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8-sig');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.status(200).send('\uFEFF' + csv); // BOM for Excel UTF-8
  } catch (error) {
    console.error('CSV export error:', error);
    return res.status(500).json({ error: 'Internal server error', details: error instanceof Error ? error.message : String(error) });
  }
}

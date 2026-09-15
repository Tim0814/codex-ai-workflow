import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { recId } = req.query;
  if (!recId || typeof recId !== 'string') {
    return res.status(400).json({ error: 'Invalid recommendation ID' });
  }

  const { action, override_reason } = req.body ?? {};
  const validActions = ['approved', 'overridden', 'rejected'];
  if (!action || !validActions.includes(action)) {
    return res.status(400).json({ error: `Invalid action. Must be one of: ${validActions.join(', ')}` });
  }
  if (action === 'overridden' && (typeof override_reason !== 'string' || !override_reason.trim())) {
    return res.status(400).json({ error: '覆寫 (overridden) 時必須填寫覆寫原因 (override_reason)' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return res.status(503).json({ error: 'Supabase not configured' });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data, error } = await supabase
      .from('allocation_recommendations')
      .update({
        review_action: action,
        override_reason: override_reason ?? null,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', recId)
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: `找不到指定的分配紀錄: ${recId}` });

    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('Review error:', error);
    return res.status(500).json({ error: 'Internal server error', details: error instanceof Error ? error.message : String(error) });
  }
}

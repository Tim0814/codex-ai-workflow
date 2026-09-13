import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const mode = (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) ? 'Supabase' : 'In-Memory';
  return res.status(200).json({
    status: 'ok',
    service: 'Orchestrator Backend',
    storage_mode: mode,
    engine_url: 'direct-import',
  });
}

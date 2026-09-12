-- -----------------------------------------------------------------------------
-- 食品供應鏈 ERP 分配輔助系統 - Supabase PostgreSQL Schema
-- 包含分配建議表與公司權重表
-- -----------------------------------------------------------------------------

-- 1. 建立分配建議表 (allocation_recommendations)
CREATE TABLE IF NOT EXISTS allocation_recommendations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id TEXT NOT NULL,
    batch_id TEXT,
    status TEXT NOT NULL,         -- 'recommended' | 'blocked' | 'partial'
    confidence TEXT NOT NULL,     -- 'auto_recommend' | 'review' | 'low_confidence' | 'manual'
    total_score FLOAT,
    scores_json JSONB,
    explanation TEXT,
    blocked_reason TEXT,
    review_action TEXT,           -- 'approved' | 'overridden' | 'rejected' | null
    override_reason TEXT,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 建立公司評分權重表 (company_weights)
CREATE TABLE IF NOT EXISTS company_weights (
    id SERIAL PRIMARY KEY,
    expiry FLOAT NOT NULL DEFAULT 0.35,
    urgency FLOAT NOT NULL DEFAULT 0.25,
    order_time FLOAT NOT NULL DEFAULT 0.12,
    customer_tier FLOAT NOT NULL DEFAULT 0.20,
    region_cluster FLOAT NOT NULL DEFAULT 0.08,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 插入預設權重設定（若尚未存在）
INSERT INTO company_weights (id, expiry, urgency, order_time, customer_tier, region_cluster)
VALUES (1, 0.35, 0.25, 0.12, 0.20, 0.08)
ON CONFLICT (id) DO NOTHING;

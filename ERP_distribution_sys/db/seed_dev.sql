-- =============================================================================
-- 開發用測試資料 (DEV SEED)
-- ⚠️  此檔案僅供開發測試使用，可隨時清空重灌，請勿在正式環境執行。
-- 清空方式：TRUNCATE allocation_recommendations; DELETE FROM company_weights WHERE id > 1;
-- =============================================================================

-- -----------------------------------------------------------------------------
-- company_weights：5 筆不同策略的權重設定
-- id=1 為 schema 預設值，從 id=2 開始插入測試用設定
-- -----------------------------------------------------------------------------
INSERT INTO company_weights (id, expiry, urgency, order_time, customer_tier, region_cluster, updated_at) VALUES
-- 偏重效期（FEFO 優先策略）
(2, 0.50, 0.20, 0.10, 0.15, 0.05, NOW() - INTERVAL '10 days'),
-- 偏重客戶等級（VIP 優先策略）
(3, 0.20, 0.20, 0.10, 0.40, 0.10, NOW() - INTERVAL '7 days'),
-- 偏重交期急迫（緊急出貨策略）
(4, 0.20, 0.45, 0.15, 0.15, 0.05, NOW() - INTERVAL '5 days'),
-- 均衡策略
(5, 0.25, 0.25, 0.20, 0.20, 0.10, NOW() - INTERVAL '3 days'),
-- 偏重區域集群（物流成本最佳化）
(6, 0.20, 0.20, 0.10, 0.15, 0.35, NOW() - INTERVAL '1 day')
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- allocation_recommendations：10 筆涵蓋各種 status / confidence / review_action 組合
-- -----------------------------------------------------------------------------
INSERT INTO allocation_recommendations
  (id, order_id, batch_id, status, confidence, total_score, scores_json, explanation, blocked_reason, review_action, override_reason, reviewed_at, created_at)
VALUES

-- 1. auto_recommend + approved（✅ 佔用中，會觸發衝突）
(
  'a0000001-0000-0000-0000-000000000001',
  'O001', 'B001', 'recommended', 'auto_recommend', 91.5,
  '{"expiry":95,"urgency":88,"orderTime":85,"customerTier":100,"regionCluster":100}',
  '批次 B001 效期僅剩 4 天，客戶 C001 為 VIP 等級，優先建議分配。',
  NULL, 'approved', NULL, NOW() - INTERVAL '2 days', NOW() - INTERVAL '3 days'
),

-- 2. auto_recommend + review_action = null（尚未審核，會觸發衝突檢查）
(
  'a0000001-0000-0000-0000-000000000002',
  'O002', 'B002', 'recommended', 'auto_recommend', 85.0,
  '{"expiry":80,"urgency":90,"orderTime":70,"customerTier":80,"regionCluster":100}',
  '批次 B002 交期緊迫，建議優先分配給訂單 O002。',
  NULL, NULL, NULL, NULL, NOW() - INTERVAL '2 days'
),

-- 3. review + review_action = null（低分待審，會觸發衝突檢查）
(
  'a0000001-0000-0000-0000-000000000003',
  'O003', 'B003', 'recommended', 'review', 65.0,
  '{"expiry":60,"urgency":70,"orderTime":55,"customerTier":60,"regionCluster":100}',
  '批次 B003 分數中等，建議人工確認後再分配。',
  NULL, NULL, NULL, NULL, NOW() - INTERVAL '1 day'
),

-- 4. review + overridden（✅ 佔用中，會觸發衝突）
(
  'a0000001-0000-0000-0000-000000000004',
  'O004', 'B004', 'recommended', 'review', 62.0,
  '{"expiry":55,"urgency":65,"orderTime":60,"customerTier":70,"regionCluster":60}',
  '批次 B004 分數偏低，已由人工覆寫指定分配。',
  NULL, 'overridden', '業務主管指定使用此批次', NOW() - INTERVAL '1 day', NOW() - INTERVAL '2 days'
),

-- 5. low_confidence + rejected（已駁回，不衝突）
(
  'a0000001-0000-0000-0000-000000000005',
  'O005', 'B005', 'recommended', 'low_confidence', 45.0,
  '{"expiry":40,"urgency":50,"orderTime":30,"customerTier":60,"regionCluster":40}',
  '批次 B005 分數過低，建議人工重新評估。',
  NULL, 'rejected', NULL, NOW() - INTERVAL '12 hours', NOW() - INTERVAL '1 day'
),

-- 6. blocked（無可用批次，不涉及 batch_id 衝突）
(
  'a0000001-0000-0000-0000-000000000006',
  'O006', NULL, 'blocked', 'manual', 0.0,
  NULL,
  NULL,
  '所有候選批次均已過期或庫存不足，無法自動分配，請人工處理。',
  NULL, NULL, NULL, NOW() - INTERVAL '1 day'
),

-- 7. partial + review_action = null（部分分配，會觸發衝突檢查）
(
  'a0000001-0000-0000-0000-000000000007',
  'O007', 'B006', 'partial', 'review', 72.0,
  '{"expiry":70,"urgency":75,"orderTime":65,"customerTier":80,"regionCluster":70}',
  '批次 B006 庫存僅能滿足部分需求，已部分分配，剩餘數量待補。',
  NULL, NULL, NULL, NULL, NOW() - INTERVAL '6 hours'
),

-- 8. partial + approved（✅ 佔用中，會觸發衝突）
(
  'a0000001-0000-0000-0000-000000000008',
  'O008', 'B007', 'partial', 'review', 68.0,
  '{"expiry":65,"urgency":72,"orderTime":60,"customerTier":75,"regionCluster":65}',
  '批次 B007 部分分配已審核確認，批貨仍處於佔用狀態。',
  NULL, 'approved', NULL, NOW() - INTERVAL '3 hours', NOW() - INTERVAL '5 hours'
),

-- 9. auto_recommend + review_action = null，使用與第 2 筆不同的 batch（B008）
(
  'a0000001-0000-0000-0000-000000000009',
  'O009', 'B008', 'recommended', 'auto_recommend', 88.5,
  '{"expiry":90,"urgency":85,"orderTime":80,"customerTier":100,"regionCluster":80}',
  '批次 B008 效期近且客戶等級高，系統自動建議分配。',
  NULL, NULL, NULL, NULL, NOW() - INTERVAL '30 minutes'
),

-- 10. low_confidence + review_action = null（分數低但尚未處理，會觸發衝突檢查）
(
  'a0000001-0000-0000-0000-000000000010',
  'O010', 'B009', 'recommended', 'low_confidence', 42.0,
  '{"expiry":35,"urgency":45,"orderTime":40,"customerTier":50,"regionCluster":40}',
  '批次 B009 各項分數偏低，建議重新確認訂單需求後再分配。',
  NULL, NULL, NULL, NULL, NOW() - INTERVAL '10 minutes'
);

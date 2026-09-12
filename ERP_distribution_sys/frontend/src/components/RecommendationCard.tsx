import React from 'react';
import { Recommendation, ReviewAction } from '../types';
import { CheckCircle2, Edit3, XCircle, AlertTriangle, ShieldCheck } from 'lucide-react';

interface RecommendationCardProps {
  rec: Recommendation;
  onApprove: (id: string) => void;
  onOverride: (rec: Recommendation) => void;
  onReject: (id: string) => void;
}

export const RecommendationCard: React.FC<RecommendationCardProps> = ({
  rec,
  onApprove,
  onOverride,
  onReject,
}) => {
  const getStatusTheme = () => {
    if (rec.status === 'blocked' || rec.total_score < 60) {
      return { cardClass: 'status-red', badgeClass: 'badge-red', label: '阻斷 / 人工處理' };
    }
    if (rec.total_score >= 80) {
      return { cardClass: 'status-green', badgeClass: 'badge-green', label: '可直接確認' };
    }
    return { cardClass: 'status-orange', badgeClass: 'badge-orange', label: '建議複核' };
  };

  const theme = getStatusTheme();
  const scores = rec.scores_json || { expiry: 0, urgency: 0, orderTime: 0, customerTier: 0, regionCluster: 0 };

  return (
    <div className={`card ${theme.cardClass}`}>
      <div>
        <div className="card-header">
          <div>
            <div className="order-id">{rec.order_id}</div>
            <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
              總分: <strong style={{ color: '#ffffff', fontSize: '0.9rem' }}>{rec.total_score.toFixed(1)}</strong>
            </span>
          </div>
          <span className={`badge ${theme.badgeClass}`}>{theme.label}</span>
        </div>

        <div className="batch-info">
          {rec.status === 'blocked' ? (
            <div style={{ color: '#ef4444', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <AlertTriangle size={16} /> <strong>阻斷原因：</strong> {rec.blocked_reason || '無可分配批次'}
            </div>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                建議批次：<span>{rec.batch_id}</span>
              </div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                狀態: <strong style={{ color: rec.status === 'partial' ? '#f59e0b' : '#10b981' }}>{rec.status}</strong>
              </div>
            </div>
          )}
        </div>

        {/* 五維度分數細節 */}
        <div className="score-breakdown-grid">
          <div className="score-pill">
            <span className="score-pill-label">效期</span>
            <span className="score-pill-val">{scores.expiry?.toFixed(0) ?? 0}</span>
          </div>
          <div className="score-pill">
            <span className="score-pill-label">急迫性</span>
            <span className="score-pill-val">{scores.urgency?.toFixed(0) ?? 0}</span>
          </div>
          <div className="score-pill">
            <span className="score-pill-label">下單先後</span>
            <span className="score-pill-val">{scores.orderTime?.toFixed(0) ?? 0}</span>
          </div>
          <div className="score-pill">
            <span className="score-pill-label">客戶等級</span>
            <span className="score-pill-val">{scores.customerTier?.toFixed(0) ?? 0}</span>
          </div>
          <div className="score-pill">
            <span className="score-pill-label">區域集群</span>
            <span className="score-pill-val">{scores.regionCluster?.toFixed(0) ?? 0}</span>
          </div>
        </div>

        {/* AI 解釋文字 */}
        <div className="ai-explanation">
          💡 <strong>AI 說明：</strong> {rec.explanation || '系統評估完成'}
        </div>

        {/* 已審核狀態顯示 */}
        {rec.review_action && (
          <div style={{ marginBottom: '1rem' }}>
            {rec.review_action === 'approved' && (
              <span className="review-badge" style={{ background: 'rgba(16, 185, 129, 0.2)', color: '#10b981' }}>
                <ShieldCheck size={12} style={{ display: 'inline', marginRight: 4 }} /> 已核准確認
              </span>
            )}
            {rec.review_action === 'overridden' && (
              <div className="review-badge" style={{ background: 'rgba(245, 158, 11, 0.2)', color: '#f59e0b', width: '100%' }}>
                ✏️ 已覆寫：{rec.override_reason}
              </div>
            )}
            {rec.review_action === 'rejected' && (
              <span className="review-badge" style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444' }}>
                ❌ 已退回單據
              </span>
            )}
          </div>
        )}
      </div>

      {/* 操作按鈕 */}
      <div className="card-actions">
        <button className="btn btn-sm btn-approve" onClick={() => onApprove(rec.id)}>
          <CheckCircle2 size={14} /> 核准
        </button>
        <button className="btn btn-sm btn-override" onClick={() => onOverride(rec)}>
          <Edit3 size={14} /> 覆寫
        </button>
        <button className="btn btn-sm btn-reject" onClick={() => onReject(rec.id)}>
          <XCircle size={14} /> 退回
        </button>
      </div>
    </div>
  );
};

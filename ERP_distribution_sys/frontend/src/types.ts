export type AllocationStatus = 'recommended' | 'blocked' | 'partial';
export type ConfidenceLevel = 'auto_recommend' | 'review' | 'low_confidence' | 'manual';
export type ReviewAction = 'approved' | 'overridden' | 'rejected';

export interface ScoreBreakdown {
  expiry: number;
  urgency: number;
  orderTime: number;
  customerTier: number;
  regionCluster: number;
}

export interface Recommendation {
  id: string;
  order_id: string;
  batch_id: string | null;
  status: AllocationStatus;
  confidence: ConfidenceLevel;
  total_score: number;
  scores_json: ScoreBreakdown;
  explanation: string;
  blocked_reason: string | null;
  review_action: ReviewAction | null;
  override_reason: string | null;
  reviewed_at: string | null;
  created_at: string;
}

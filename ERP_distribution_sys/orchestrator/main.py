import os
import io
import csv
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
from fastapi import FastAPI, HTTPException, Query, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
import httpx
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(
    title="ERP Distribution System Orchestrator API",
    description="協調處理引擎、Supabase 儲存與審核工作流",
    version="1.0.0"
)

# 允許跨域請求 (CORS)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 引擎 HTTP API URL
ENGINE_API_URL = os.getenv("ENGINE_API_URL", "http://localhost:4000/api/allocate")

# Supabase 設定 (選填，未設定時自動切換至 In-Memory 模式)
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")

# 記憶體資料儲存庫 (In-Memory Store)
in_memory_recommendations: List[Dict[str, Any]] = []

# Supabase Client 初始化 (若有金鑰)
supabase_client = None
if SUPABASE_URL and SUPABASE_KEY:
    try:
        from supabase import create_client
        supabase_client = create_client(SUPABASE_URL, SUPABASE_KEY)
        print("✅ Supabase 客戶端連線成功")
    except Exception as e:
        print(f"⚠️ Supabase 初始化失敗，自動切換至 In-Memory 模式: {e}")

# ─── Pydantic Models ─────────────────────────────────────────────────────────

class ReviewRequest(BaseModel):
    action: str = Field(..., description="'approved' | 'overridden' | 'rejected'")
    override_reason: Optional[str] = Field(None, description="覆寫原因 (當 action=='overridden' 時必填)")

# ─── 輔助函式 ─────────────────────────────────────────────────────────────────

def calculate_confidence(status: str, total_score: float) -> str:
    """計算信心評級與處理分層"""
    if status == "blocked":
        return "manual"
    if total_score >= 80:
        return "auto_recommend"
    elif total_score >= 60:
        return "review"
    else:
        return "low_confidence"

# ─── API 端點 ─────────────────────────────────────────────────────────────────

@app.get("/api/health")
def health_check():
    mode = "Supabase" if supabase_client else "In-Memory"
    return {
        "status": "ok",
        "service": "Orchestrator Backend",
        "storage_mode": mode,
        "engine_url": ENGINE_API_URL
    }

@app.post("/api/run-allocation")
async def run_allocation_orchestrator(payload: Optional[Dict[str, Any]] = Body(None)):
    """
    觸發 Allocation Engine 進行計算，並將結果存至 Supabase / 記憶體
    """
    global in_memory_recommendations
    
    # 呼叫 Express TS 引擎
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(ENGINE_API_URL, json=payload or {})
            if resp.status_code != 200:
                raise HTTPException(status_code=500, detail=f"Engine API Error: {resp.text}")
            engine_data = resp.json()
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"無法連線至 Allocation Engine API (http://localhost:4000): {str(e)}")

    raw_results = engine_data.get("results", [])
    processed_records = []

    for item in raw_results:
        order_id = item.get("orderId")
        status = item.get("status")
        total_score = item.get("totalScore", 0.0)
        confidence = calculate_confidence(status, total_score)
        
        record = {
            "id": item.get("id") or f"rec-{order_id}-{int(datetime.now(timezone.utc).timestamp()*1000)}",
            "order_id": order_id,
            "batch_id": item.get("recommendedBatchId"),
            "status": status,
            "confidence": confidence,
            "total_score": total_score,
            "scores_json": item.get("scores", {}),
            "explanation": item.get("explanation", ""),
            "blocked_reason": item.get("blockedReason"),
            "review_action": None,
            "override_reason": None,
            "reviewed_at": None,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        processed_records.append(record)

    # 儲存至 Supabase 或 記憶體
    if supabase_client:
        try:
            for rec in processed_records:
                supabase_client.table("allocation_recommendations").upsert(rec).execute()
        except Exception as err:
            print(f"Supabase 寫入錯誤: {err}，寫入記憶體備用")
            in_memory_recommendations = processed_records
    else:
        in_memory_recommendations = processed_records

    return {
        "success": True,
        "count": len(processed_records),
        "data": processed_records
    }

@app.get("/api/recommendations")
def get_recommendations():
    """取得所有分配建議"""
    if supabase_client:
        try:
            res = supabase_client.table("allocation_recommendations").select("*").order("created_at", desc=True).execute()
            return {"success": True, "data": res.data}
        except Exception as e:
            print(f"Supabase 讀取異常: {e}")

    return {"success": True, "data": in_memory_recommendations}

@app.post("/api/review/{rec_id}")
def review_recommendation(rec_id: str, review: ReviewRequest):
    """
    對分配建議進行人工審核 (核准 ✅ / 覆寫 ✏️ / 退回 ❌)
    """
    if review.action == "overridden" and not (review.override_reason and review.override_reason.strip()):
        raise HTTPException(status_code=400, detail="覆寫 (overridden) 時必須填寫覆寫原因 (override_reason)")

    now_iso = datetime.now(timezone.utc).isoformat()
    updated_record = None

    if supabase_client:
        try:
            res = supabase_client.table("allocation_recommendations").update({
                "review_action": review.action,
                "override_reason": review.override_reason,
                "reviewed_at": now_iso
            }).eq("id", rec_id).execute()
            if res.data:
                updated_record = res.data[0]
        except Exception as e:
            print(f"Supabase 更新錯誤: {e}")

    # 若 Supabase 無資料或使用 In-memory
    if not updated_record:
        for rec in in_memory_recommendations:
            if rec["id"] == rec_id or rec["order_id"] == rec_id:
                rec["review_action"] = review.action
                rec["override_reason"] = review.override_reason
                rec["reviewed_at"] = now_iso
                updated_record = rec
                break

    if not updated_record:
        raise HTTPException(status_code=404, detail=f"找不到指定的分配紀錄: {rec_id}")

    return {"success": True, "data": updated_record}

@app.get("/api/export/csv")
def export_csv():
    """匯出分配建議結果為 CSV 檔案"""
    records = []
    if supabase_client:
        try:
            res = supabase_client.table("allocation_recommendations").select("*").execute()
            records = res.data
        except Exception as e:
            print(f"Supabase 讀取錯誤: {e}")

    if not records:
        records = in_memory_recommendations

    output = io.StringIO()
    writer = csv.writer(output)

    # 寫入 CSV 標頭
    writer.writerow([
        "ID", "Order ID", "Batch ID", "Status", "Confidence", "Total Score",
        "Expiry Score", "Urgency Score", "Order Time Score", "Tier Score", "Region Score",
        "Review Action", "Override Reason", "Explanation", "Blocked Reason", "Reviewed At"
    ])

    for r in records:
        scores = r.get("scores_json") or {}
        writer.writerow([
            r.get("id"),
            r.get("order_id"),
            r.get("batch_id") or "",
            r.get("status"),
            r.get("confidence"),
            r.get("total_score"),
            scores.get("expiry", 0),
            scores.get("urgency", 0),
            scores.get("orderTime", 0),
            scores.get("customerTier", 0),
            scores.get("regionCluster", 0),
            r.get("review_action") or "Pending",
            r.get("override_reason") or "",
            r.get("explanation") or "",
            r.get("blocked_reason") or "",
            r.get("reviewed_at") or ""
        ])

    output.seek(0)
    filename = f"allocation_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
    return StreamingResponse(
        io.BytesIO(output.getvalue().encode("utf-8-sig")),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

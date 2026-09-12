# 食品供應鏈訂單分配建議引擎

Rules-based Allocation Engine，供食品製造業 ERP 系統使用。

## 核心設計原則

- **分配結果由規則引擎決定**，不依賴 AI/LLM 猜測
- **LLM 只做解釋**：接收已算好的數字，輸出白話文說明
- **硬性規則與評分邏輯完全分離**：過期/缺貨不參與評分
- **權重外部可設定**：透過 `weights.config.json` 或資料庫維護，不寫死

---

## 專案結構

```
src/
├── types.ts              # 所有型別定義（Order, Customer, Batch, CompanyWeights…）
├── weights.ts            # 預設權重 + 驗證函式 + 載入函式
├── hardConstraints.ts    # 硬性規則過濾器（效期/庫存/超賣檢查）
├── scoring.ts            # 五個分項評分 + 加權總分 + 批次排序
├── llm.ts                # LlmExplainer 介面 + OpenAiExplainer + StubExplainer
├── allocationEngine.ts   # 主引擎：整合上述所有模組
├── index.ts              # 公開 API 匯出
└── __tests__/
    └── allocation.test.ts  # 單元測試（6 個情境）

weights.config.json       # 公司權重設定範本
.env.example              # 環境變數範本
```

---

## 安裝與執行

```bash
npm install
npm run build
npm run test:run
```

---

## 使用方式

```typescript
import { runAllocation, loadWeights, StubExplainer } from './src';
import weightsJson from './weights.config.json';

const weights = loadWeights(weightsJson);

const results = await runAllocation(
  {
    orders: [...],
    customers: new Map([...]),
    batches: [...],
    weights,
  },
  {
    explainer: new StubExplainer(), // 換成 new OpenAiExplainer() 呼叫真實 API
    today: new Date(),
  }
);

console.log(JSON.stringify(results, null, 2));
```

### 輸出格式（每筆訂單）

```json
{
  "orderId": "O001",
  "status": "recommended",
  "recommendedBatchId": "B001",
  "scores": {
    "expiry": 90.0,
    "urgency": 83.3,
    "orderTime": 16.7,
    "customerTier": 80.0,
    "regionCluster": 100.0
  },
  "totalScore": 87.5,
  "explanation": "此批次效期僅剩3天且客戶為VIP等級，優先建議分配給訂單 #O001。",
  "blockedReason": null
}
```

---

## 分配流程

```
輸入訂單
   │
   ├─► [驗證權重設定] ──不合法──► 拋出錯誤，停止執行
   │
   ├─► 依客戶等級 + 下單時間排序訂單優先權
   │
   └─► 逐筆處理訂單：
         │
         ├─► [硬性規則過濾]
         │     ├─ 已過期 → 淘汰
         │     ├─ 庫存不足 → 淘汰
         │     └─ 即時扣減後不足 → 淘汰
         │
         ├─ 無候選批次 → status: blocked，人工處理
         │
         ├─► [加權評分排序]（5 個分項，各 0~100）
         │     ├─ expiry（FEFO）
         │     ├─ urgency（交期急迫）
         │     ├─ orderTime（先進先出）
         │     ├─ customerTier（客戶等級）
         │     └─ regionCluster（區域集群）
         │
         ├─► 選最高分批次，即時扣減 availableQty
         │
         └─► [LLM 解釋層] → 自然語言說明（不影響分配結果）
```

---

## 評分說明

| 分項 | 邏輯 | 說明 |
|------|------|------|
| `expiry` | `max(0, 100 - daysUntilExpiry × 3.33)` | FEFO：效期越近分越高 |
| `urgency` | `max(0, 100 - daysUntilDue / 30 × 100)` | 交期越近越緊急 |
| `orderTime` | `min(100, daysAgo / 30 × 100)` | 越早下單分越高 |
| `customerTier` | 直接取 `customer.tierScore` | 0~100 |
| `regionCluster` | 同區域 → 100，不同 → 0 | 可擴充為距離衰減 |

加權總分：`totalScore = Σ(score[key] × weight[key])`

---

## 替換 LLM Provider

實作 `LlmExplainer` 介面即可：

```typescript
import { LlmExplainer } from './src/llm';

class BedrockExplainer implements LlmExplainer {
  async explain(prompt: string): Promise<string> {
    // 呼叫 AWS Bedrock...
    return '解釋文字';
  }
}

// 使用：
const results = await runAllocation(input, { explainer: new BedrockExplainer() });
```

---

## 修改權重設定

編輯 `weights.config.json`（五個欄位總和必須 = 1）：

```json
{
  "expiry": 0.35,
  "urgency": 0.25,
  "orderTime": 0.12,
  "customerTier": 0.20,
  "regionCluster": 0.08
}
```

程式啟動時用 `loadWeights()` 載入，自動驗證總和：

```typescript
import { loadWeights } from './src/weights';
const weights = loadWeights(JSON.parse(fs.readFileSync('weights.config.json', 'utf-8')));
```

"use strict";
/**
 * LLM 解釋層
 *
 * 設計原則：
 * - LLM 只接收「已算好的數字結果」作為輸入
 * - LLM 不決定分配結果，只負責把已算好的結論翻譯成白話文
 * - 透過 LlmExplainer 介面隔離 provider，方便替換 OpenAI / Azure / Bedrock 等
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.StubExplainer = exports.OpenAiExplainer = void 0;
exports.buildPrompt = buildPrompt;
// ─── Prompt 組裝 ───────────────────────────────────────────────────────────────
/**
 * 將規則引擎的計算結果組成 prompt
 * LLM 只看到數字與結論，不會接觸到原始批次或訂單資料
 */
function buildPrompt(result) {
    if (result.status === 'blocked') {
        return (`你是食品供應鏈 ERP 系統的助理。請用繁體中文，以一句清楚簡短的話，` +
            `說明以下訂單無法自動分配的原因，並提示需要人工處理。\n\n` +
            `訂單編號：${result.orderId}\n` +
            `阻斷原因：${result.blockedReason}\n\n` +
            `請直接輸出說明文字，不要加任何前綴或標題。`);
    }
    const { scores, totalScore, orderId, recommendedBatchId, status } = result;
    const scoreLines = formatScores(scores);
    const statusLabel = status === 'partial' ? '部分分配' : '建議分配';
    return (`你是食品供應鏈 ERP 系統的助理。請用繁體中文，以一句清楚簡短的話，` +
        `解釋以下訂單分配結果的主要原因（不要重複列出所有數字，` +
        `只需點出最關鍵的 1~2 個因素）。\n\n` +
        `訂單編號：${orderId}\n` +
        `分配狀態：${statusLabel}\n` +
        `建議批次：${recommendedBatchId}\n` +
        `加權總分：${totalScore.toFixed(2)}\n` +
        `各分項分數（0~100）：\n${scoreLines}\n\n` +
        `請直接輸出說明文字，不要加任何前綴或標題。`);
}
function formatScores(scores) {
    return [
        `  - 效期分數（expiry）：${scores.expiry.toFixed(1)}`,
        `  - 交期急迫性（urgency）：${scores.urgency.toFixed(1)}`,
        `  - 下單先後（orderTime）：${scores.orderTime.toFixed(1)}`,
        `  - 客戶等級（customerTier）：${scores.customerTier.toFixed(1)}`,
        `  - 區域集群（regionCluster）：${scores.regionCluster.toFixed(1)}`,
    ].join('\n');
}
/**
 * 呼叫 OpenAI Chat Completions API 的預設實作
 * 使用 fetch（Node 18+ 原生支援），無需額外安裝 openai SDK
 *
 * 環境變數：
 *   OPENAI_API_KEY  必填
 *   OPENAI_MODEL    選填，預設 "gpt-4o-mini"
 *   OPENAI_API_URL  選填，預設官方端點（可指向 Azure 或自架 proxy）
 */
class OpenAiExplainer {
    constructor(options) {
        this.apiKey = options?.apiKey ?? process.env['OPENAI_API_KEY'] ?? '';
        this.model = options?.model ?? process.env['OPENAI_MODEL'] ?? 'gpt-4o-mini';
        this.apiUrl =
            options?.apiUrl ??
                process.env['OPENAI_API_URL'] ??
                'https://api.openai.com/v1/chat/completions';
        if (!this.apiKey) {
            throw new Error('OpenAiExplainer：缺少 API Key，請設定環境變數 OPENAI_API_KEY 或在建構子傳入 apiKey');
        }
    }
    async explain(prompt) {
        const response = await fetch(this.apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify({
                model: this.model,
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 150,
                temperature: 0.3, // 降低隨機性，讓解釋更穩定
            }),
        });
        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`OpenAI API 錯誤 ${response.status}：${errText}`);
        }
        const data = (await response.json());
        const content = data.choices[0]?.message?.content?.trim();
        if (!content) {
            throw new Error('OpenAI API 回傳空白內容');
        }
        return content;
    }
}
exports.OpenAiExplainer = OpenAiExplainer;
// ─── 測試用 Stub ───────────────────────────────────────────────────────────────
/**
 * 不呼叫任何外部 API 的 stub 實作
 * 用於測試與開發環境，直接回傳 prompt 摘要作為假解釋
 */
class StubExplainer {
    async explain(prompt) {
        // 從 prompt 中擷取關鍵資訊，組成假解釋
        const orderMatch = prompt.match(/訂單編號：(\S+)/);
        const batchMatch = prompt.match(/建議批次：(\S+)/);
        const scoreMatch = prompt.match(/加權總分：([\d.]+)/);
        const blockedMatch = prompt.match(/阻斷原因：(.+)/);
        if (blockedMatch) {
            return `[Stub] 訂單 ${orderMatch?.[1] ?? '?'} 因「${blockedMatch[1]}」無法自動分配，請人工處理。`;
        }
        return (`[Stub] 訂單 ${orderMatch?.[1] ?? '?'} 建議分配批次 ` +
            `${batchMatch?.[1] ?? '?'}，加權總分 ${scoreMatch?.[1] ?? '?'}。`);
    }
}
exports.StubExplainer = StubExplainer;
//# sourceMappingURL=llm.js.map
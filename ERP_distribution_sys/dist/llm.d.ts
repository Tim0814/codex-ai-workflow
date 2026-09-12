/**
 * LLM 解釋層
 *
 * 設計原則：
 * - LLM 只接收「已算好的數字結果」作為輸入
 * - LLM 不決定分配結果，只負責把已算好的結論翻譯成白話文
 * - 透過 LlmExplainer 介面隔離 provider，方便替換 OpenAI / Azure / Bedrock 等
 */
import { AllocationResult } from './types';
/**
 * LLM Provider 介面
 * 實作此介面即可接入任意 LLM 服務（OpenAI、Azure OpenAI、AWS Bedrock 等）
 */
export interface LlmExplainer {
    /**
     * 根據分配結果產生自然語言解釋
     * @param prompt 已組裝好的 prompt 字串（由 buildPrompt 產生）
     * @returns 自然語言解釋文字
     */
    explain(prompt: string): Promise<string>;
}
/**
 * 將規則引擎的計算結果組成 prompt
 * LLM 只看到數字與結論，不會接觸到原始批次或訂單資料
 */
export declare function buildPrompt(result: AllocationResult): string;
/**
 * 呼叫 OpenAI Chat Completions API 的預設實作
 * 使用 fetch（Node 18+ 原生支援），無需額外安裝 openai SDK
 *
 * 環境變數：
 *   OPENAI_API_KEY  必填
 *   OPENAI_MODEL    選填，預設 "gpt-4o-mini"
 *   OPENAI_API_URL  選填，預設官方端點（可指向 Azure 或自架 proxy）
 */
export declare class OpenAiExplainer implements LlmExplainer {
    private readonly apiKey;
    private readonly model;
    private readonly apiUrl;
    constructor(options?: {
        apiKey?: string;
        model?: string;
        apiUrl?: string;
    });
    explain(prompt: string): Promise<string>;
}
/**
 * 不呼叫任何外部 API 的 stub 實作
 * 用於測試與開發環境，直接回傳 prompt 摘要作為假解釋
 */
export declare class StubExplainer implements LlmExplainer {
    explain(prompt: string): Promise<string>;
}
//# sourceMappingURL=llm.d.ts.map
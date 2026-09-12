import { LlmExplainer } from './llm';
/**
 * 呼叫 Google Gemini REST API (gemini-1.5-flash) 的實作
 * 若未設定 API Key，將自動優雅降級為 StubExplainer，保證 PoC 開箱即用
 */
export declare class GeminiExplainer implements LlmExplainer {
    private readonly apiKey;
    private readonly model;
    private readonly fallbackStub;
    constructor(options?: {
        apiKey?: string;
        model?: string;
    });
    explain(prompt: string): Promise<string>;
}
//# sourceMappingURL=llmGemini.d.ts.map
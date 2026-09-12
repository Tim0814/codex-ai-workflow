"use strict";
/**
 * 食品供應鏈訂單分配建議引擎
 * 公開 API 匯出點
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.runAllocation = exports.StubExplainer = exports.OpenAiExplainer = exports.buildPrompt = exports.rankBatches = exports.scoreBatch = exports.scoreRegionCluster = exports.scoreCustomerTier = exports.scoreOrderTime = exports.scoreUrgency = exports.scoreExpiry = exports.applyHardConstraints = exports.loadWeights = exports.validateWeights = exports.DEFAULT_WEIGHTS = void 0;
// 權重工具
var weights_1 = require("./weights");
Object.defineProperty(exports, "DEFAULT_WEIGHTS", { enumerable: true, get: function () { return weights_1.DEFAULT_WEIGHTS; } });
Object.defineProperty(exports, "validateWeights", { enumerable: true, get: function () { return weights_1.validateWeights; } });
Object.defineProperty(exports, "loadWeights", { enumerable: true, get: function () { return weights_1.loadWeights; } });
// 硬性規則
var hardConstraints_1 = require("./hardConstraints");
Object.defineProperty(exports, "applyHardConstraints", { enumerable: true, get: function () { return hardConstraints_1.applyHardConstraints; } });
// 評分邏輯
var scoring_1 = require("./scoring");
Object.defineProperty(exports, "scoreExpiry", { enumerable: true, get: function () { return scoring_1.scoreExpiry; } });
Object.defineProperty(exports, "scoreUrgency", { enumerable: true, get: function () { return scoring_1.scoreUrgency; } });
Object.defineProperty(exports, "scoreOrderTime", { enumerable: true, get: function () { return scoring_1.scoreOrderTime; } });
Object.defineProperty(exports, "scoreCustomerTier", { enumerable: true, get: function () { return scoring_1.scoreCustomerTier; } });
Object.defineProperty(exports, "scoreRegionCluster", { enumerable: true, get: function () { return scoring_1.scoreRegionCluster; } });
Object.defineProperty(exports, "scoreBatch", { enumerable: true, get: function () { return scoring_1.scoreBatch; } });
Object.defineProperty(exports, "rankBatches", { enumerable: true, get: function () { return scoring_1.rankBatches; } });
// LLM 解釋層
var llm_1 = require("./llm");
Object.defineProperty(exports, "buildPrompt", { enumerable: true, get: function () { return llm_1.buildPrompt; } });
Object.defineProperty(exports, "OpenAiExplainer", { enumerable: true, get: function () { return llm_1.OpenAiExplainer; } });
Object.defineProperty(exports, "StubExplainer", { enumerable: true, get: function () { return llm_1.StubExplainer; } });
// 主引擎
var allocationEngine_1 = require("./allocationEngine");
Object.defineProperty(exports, "runAllocation", { enumerable: true, get: function () { return allocationEngine_1.runAllocation; } });
//# sourceMappingURL=index.js.map
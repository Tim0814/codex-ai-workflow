/**
 * 單元測試：訂單分配建議引擎
 *
 * 測試情境：
 * T1 — 庫存充足、單一候選批次 → 正常 recommended
 * T2 — 庫存不足 → 訂單 blocked
 * T3 — 批次已過期 → 被硬性規則過濾，訂單 blocked
 * T4 — 多筆訂單搶同一批次 → 依總分排序分配，不超賣
 * T5 — 權重總和不為 1 → 拋出錯誤
 * T6 — 修改權重設定 → 同一組資料產生不同排序結果
 */

import { runAllocation } from '../allocationEngine';
import { validateWeights } from '../weights';
import { rankBatches } from '../scoring';
import {
  Batch,
  Customer,
  Order,
  CompanyWeights,
  AllocationInput,
} from '../types';
import { StubExplainer } from '../llm';

// ─── 測試固定基準日期 ──────────────────────────────────────────────────────────
const TODAY = new Date('2024-06-15T00:00:00.000Z');

// ─── 共用輔助工廠 ──────────────────────────────────────────────────────────────

function makeOrder(overrides: Partial<Order> & Pick<Order, 'orderId'>): Order {
  return {
    customerId: 'C001',
    requestedQty: 100,
    requestedDate: new Date('2024-06-20T00:00:00.000Z'), // 5 天後交期
    createdAt: new Date('2024-06-10T00:00:00.000Z'),     // 5 天前下單
    ...overrides,
  };
}

function makeCustomer(overrides?: Partial<Customer>): Customer {
  return {
    customerId: 'C001',
    tierScore: 80,
    region: 'North',
    ...overrides,
  };
}

function makeBatch(overrides: Partial<Batch> & Pick<Batch, 'batchId'>): Batch {
  return {
    productId: 'P001',
    availableQty: 500,
    expiryDate: new Date('2024-06-25T00:00:00.000Z'), // 10 天後過期
    warehouseRegion: 'North',
    ...overrides,
  };
}

/** 預設合法權重（總和 = 1） */
const DEFAULT_WEIGHTS: CompanyWeights = {
  expiry: 0.35,
  urgency: 0.25,
  orderTime: 0.12,
  customerTier: 0.20,
  regionCluster: 0.08,
};

const stubExplainer = new StubExplainer();
const engineOptions = { today: TODAY, explainer: stubExplainer };

// ─────────────────────────────────────────────────────────────────────────────
// T1：庫存充足、單一候選批次 → 正常 recommended
// ─────────────────────────────────────────────────────────────────────────────
describe('T1：庫存充足、單一候選批次', () => {
  it('應回傳 status = recommended，且 recommendedBatchId 正確', async () => {
    const order = makeOrder({ orderId: 'O001' });
    const customer = makeCustomer();
    const batch = makeBatch({ batchId: 'B001', availableQty: 200 });

    const input: AllocationInput = {
      orders: [order],
      customers: new Map([['C001', customer]]),
      batches: [batch],
      weights: DEFAULT_WEIGHTS,
    };

    const results = await runAllocation(input, engineOptions);

    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe('recommended');
    expect(results[0]!.recommendedBatchId).toBe('B001');
    expect(results[0]!.blockedReason).toBeNull();
    expect(results[0]!.totalScore).toBeGreaterThan(0);
    expect(results[0]!.explanation).toBeTruthy();
  });

  it('應回傳五個分項分數皆在 0~100 之間', async () => {
    const order = makeOrder({ orderId: 'O001' });
    const customer = makeCustomer();
    const batch = makeBatch({ batchId: 'B001', availableQty: 200 });

    const input: AllocationInput = {
      orders: [order],
      customers: new Map([['C001', customer]]),
      batches: [batch],
      weights: DEFAULT_WEIGHTS,
    };

    const results = await runAllocation(input, engineOptions);
    const scores = results[0]!.scores;

    for (const key of ['expiry', 'urgency', 'orderTime', 'customerTier', 'regionCluster'] as const) {
      expect(scores[key]).toBeGreaterThanOrEqual(0);
      expect(scores[key]).toBeLessThanOrEqual(100);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T2：庫存不足 → 訂單 blocked
// ─────────────────────────────────────────────────────────────────────────────
describe('T2：庫存不足', () => {
  it('availableQty < requestedQty 時，應回傳 status = blocked', async () => {
    const order = makeOrder({ orderId: 'O002', requestedQty: 300 });
    const customer = makeCustomer();
    const batch = makeBatch({ batchId: 'B002', availableQty: 100 }); // 庫存不足

    const input: AllocationInput = {
      orders: [order],
      customers: new Map([['C001', customer]]),
      batches: [batch],
      weights: DEFAULT_WEIGHTS,
    };

    const results = await runAllocation(input, engineOptions);

    expect(results[0]!.status).toBe('blocked');
    expect(results[0]!.recommendedBatchId).toBeNull();
    expect(results[0]!.blockedReason).toContain('庫存不足');
    expect(results[0]!.totalScore).toBe(0);
  });

  it('沒有任何批次時，應回傳 blocked 且原因說明無可用批次', async () => {
    const order = makeOrder({ orderId: 'O003' });
    const customer = makeCustomer();

    const input: AllocationInput = {
      orders: [order],
      customers: new Map([['C001', customer]]),
      batches: [],
      weights: DEFAULT_WEIGHTS,
    };

    const results = await runAllocation(input, engineOptions);

    expect(results[0]!.status).toBe('blocked');
    expect(results[0]!.blockedReason).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T3：批次已過期 → 被硬性規則過濾，訂單 blocked
// ─────────────────────────────────────────────────────────────────────────────
describe('T3：批次已過期', () => {
  it('expiryDate < today 的批次應被過濾掉，訂單回傳 blocked', async () => {
    const order = makeOrder({ orderId: 'O004' });
    const customer = makeCustomer();
    // 效期 2024-06-01，早於基準日 2024-06-15
    const expiredBatch = makeBatch({
      batchId: 'B003',
      availableQty: 999,
      expiryDate: new Date('2024-06-01T00:00:00.000Z'),
    });

    const input: AllocationInput = {
      orders: [order],
      customers: new Map([['C001', customer]]),
      batches: [expiredBatch],
      weights: DEFAULT_WEIGHTS,
    };

    const results = await runAllocation(input, engineOptions);

    expect(results[0]!.status).toBe('blocked');
    expect(results[0]!.blockedReason).toContain('過期');
  });

  it('過期批次與庫存不足批次混合時，應列出所有阻斷原因', async () => {
    const order = makeOrder({ orderId: 'O005', requestedQty: 500 });
    const customer = makeCustomer();

    const input: AllocationInput = {
      orders: [order],
      customers: new Map([['C001', customer]]),
      batches: [
        makeBatch({ batchId: 'B_EXP', availableQty: 999, expiryDate: new Date('2024-05-01T00:00:00.000Z') }),
        makeBatch({ batchId: 'B_LOW', availableQty: 10 }), // 庫存不足
      ],
      weights: DEFAULT_WEIGHTS,
    };

    const results = await runAllocation(input, engineOptions);

    expect(results[0]!.status).toBe('blocked');
    // 應同時提到過期與庫存不足
    expect(results[0]!.blockedReason).toContain('過期');
    expect(results[0]!.blockedReason).toContain('庫存不足');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T4：多筆訂單搶同一批次 → 依總分排序分配，且不超賣
// ─────────────────────────────────────────────────────────────────────────────
describe('T4：多筆訂單搶同一批次，依總分排序且不超賣', () => {
  it('批次數量只夠滿足一筆訂單時，高分訂單 recommended，低分訂單 blocked', async () => {
    /**
     * 設計：
     * - 批次 B001 availableQty = 150（只夠分給一筆 requestedQty=100 的訂單後剩 50，不夠第二筆）
     * - 訂單 O_HIGH：客戶 tierScore=95（高分）
     * - 訂單 O_LOW：客戶 tierScore=10（低分）
     * 預期：O_HIGH 拿到 B001，O_LOW 被 blocked（庫存被扣後不足）
     */
    const batchQty = 150;
    const orderQty = 100; // 兩筆各要 100，批次只夠一筆

    const customerHigh = makeCustomer({ customerId: 'C_HIGH', tierScore: 95, region: 'North' });
    const customerLow = makeCustomer({ customerId: 'C_LOW', tierScore: 10, region: 'North' });

    const orderHigh = makeOrder({ orderId: 'O_HIGH', customerId: 'C_HIGH', requestedQty: orderQty });
    const orderLow = makeOrder({ orderId: 'O_LOW', customerId: 'C_LOW', requestedQty: orderQty });

    const batch = makeBatch({ batchId: 'B001', availableQty: batchQty });

    const input: AllocationInput = {
      orders: [orderHigh, orderLow],
      customers: new Map([
        ['C_HIGH', customerHigh],
        ['C_LOW', customerLow],
      ]),
      batches: [batch],
      weights: DEFAULT_WEIGHTS,
    };

    const results = await runAllocation(input, engineOptions);

    const highResult = results.find((r) => r.orderId === 'O_HIGH')!;
    const lowResult = results.find((r) => r.orderId === 'O_LOW')!;

    // 高分訂單拿到批次
    expect(highResult.status).toBe('recommended');
    expect(highResult.recommendedBatchId).toBe('B001');

    // 低分訂單被 blocked（批次剩餘 50 < 100）
    expect(lowResult.status).toBe('blocked');
    expect(lowResult.recommendedBatchId).toBeNull();
  });

  it('批次數量足夠兩筆訂單時，兩筆都應 recommended', async () => {
    const customerA = makeCustomer({ customerId: 'C_A', tierScore: 80, region: 'North' });
    const customerB = makeCustomer({ customerId: 'C_B', tierScore: 60, region: 'North' });

    const orderA = makeOrder({ orderId: 'O_A', customerId: 'C_A', requestedQty: 100 });
    const orderB = makeOrder({ orderId: 'O_B', customerId: 'C_B', requestedQty: 100 });

    const batch = makeBatch({ batchId: 'B_BIG', availableQty: 500 }); // 足夠兩筆

    const input: AllocationInput = {
      orders: [orderA, orderB],
      customers: new Map([['C_A', customerA], ['C_B', customerB]]),
      batches: [batch],
      weights: DEFAULT_WEIGHTS,
    };

    const results = await runAllocation(input, engineOptions);

    expect(results.every((r) => r.status === 'recommended')).toBe(true);
    expect(results.every((r) => r.recommendedBatchId === 'B_BIG')).toBe(true);
  });

  it('批次 availableQty 應在分配後正確扣減（不超賣）', async () => {
    /**
     * 以直接操作 batches 陣列驗證：
     * runAllocation 使用 shallow copy，原始陣列不變，
     * 但分配結果本身可驗證正確性（第二筆被 blocked）
     */
    const customerA = makeCustomer({ customerId: 'CA', tierScore: 90, region: 'North' });
    const customerB = makeCustomer({ customerId: 'CB', tierScore: 85, region: 'North' });
    const customerC = makeCustomer({ customerId: 'CC', tierScore: 70, region: 'North' });

    const orders = [
      makeOrder({ orderId: 'OA', customerId: 'CA', requestedQty: 100 }),
      makeOrder({ orderId: 'OB', customerId: 'CB', requestedQty: 100 }),
      makeOrder({ orderId: 'OC', customerId: 'CC', requestedQty: 100 }),
    ];
    const batch = makeBatch({ batchId: 'B_LIMIT', availableQty: 250 }); // 只夠 2 筆

    const input: AllocationInput = {
      orders,
      customers: new Map([['CA', customerA], ['CB', customerB], ['CC', customerC]]),
      batches: [batch],
      weights: DEFAULT_WEIGHTS,
    };

    const results = await runAllocation(input, engineOptions);
    const blocked = results.filter((r) => r.status === 'blocked');
    const recommended = results.filter((r) => r.status === 'recommended');

    // 250 / 100 = 2 筆可分配，1 筆 blocked
    expect(recommended).toHaveLength(2);
    expect(blocked).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T5：權重總和不為 1 → 拋出錯誤
// ─────────────────────────────────────────────────────────────────────────────
describe('T5：權重驗證', () => {
  it('五個權重總和不等於 1 時應拋出錯誤', () => {
    const invalidWeights: CompanyWeights = {
      expiry: 0.40,  // 總和 = 1.05
      urgency: 0.25,
      orderTime: 0.15,
      customerTier: 0.15,
      regionCluster: 0.10,
    };

    expect(() => validateWeights(invalidWeights)).toThrow(/總和.*1/);
  });

  it('任一欄位超出 [0, 1] 範圍應拋出錯誤', () => {
    const invalidWeights: CompanyWeights = {
      expiry: 1.5, // 超出範圍
      urgency: -0.5,
      orderTime: 0,
      customerTier: 0,
      regionCluster: 0,
    };

    expect(() => validateWeights(invalidWeights)).toThrow(/\[0, 1\]/);
  });

  it('合法權重應不拋出錯誤', () => {
    expect(() => validateWeights(DEFAULT_WEIGHTS)).not.toThrow();
  });

  it('runAllocation 中傳入不合法權重應直接拋出，不產生任何分配結果', async () => {
    const order = makeOrder({ orderId: 'O_ERR' });
    const customer = makeCustomer();
    const batch = makeBatch({ batchId: 'B_ERR' });

    const badWeights: CompanyWeights = {
      expiry: 0.5,
      urgency: 0.5,
      orderTime: 0.1,
      customerTier: 0.1,
      regionCluster: 0.1,
    }; // 總和 = 1.3

    const input: AllocationInput = {
      orders: [order],
      customers: new Map([['C001', customer]]),
      batches: [batch],
      weights: badWeights,
    };

    await expect(runAllocation(input, engineOptions)).rejects.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T6：修改權重設定 → 同一組資料產生不同排序結果
// ─────────────────────────────────────────────────────────────────────────────
describe('T6：修改權重後排序結果改變', () => {
  /**
   * 設計兩個批次：
   * - B_NEAR_EXPIRY：效期極近（3 天後），但倉庫區域與客戶不同（regionCluster=0）
   * - B_FAR_EXPIRY： 效期較遠（20 天後），但倉庫區域與客戶相同（regionCluster=100）
   *
   * 權重 A（expiry 重）→ B_NEAR_EXPIRY 勝出
   * 權重 B（regionCluster 重）→ B_FAR_EXPIRY 勝出
   */
  const order = makeOrder({ orderId: 'O_WEIGHT_TEST', requestedQty: 50 });
  const customer = makeCustomer({ customerId: 'C001', tierScore: 50, region: 'North' });

  const batchNearExpiry = makeBatch({
    batchId: 'B_NEAR',
    availableQty: 200,
    expiryDate: new Date('2024-06-18T00:00:00.000Z'), // 3 天後
    warehouseRegion: 'South',                         // 不同區域
  });
  const batchFarExpiry = makeBatch({
    batchId: 'B_FAR',
    availableQty: 200,
    expiryDate: new Date('2024-07-05T00:00:00.000Z'), // 20 天後
    warehouseRegion: 'North',                          // 相同區域
  });

  it('expiry 權重高時，效期近的批次排名應較高', () => {
    const weightsExpiryHeavy: CompanyWeights = {
      expiry: 0.70,       // 強調效期
      urgency: 0.10,
      orderTime: 0.05,
      customerTier: 0.10,
      regionCluster: 0.05,
    };

    const ranked = rankBatches(
      [batchNearExpiry, batchFarExpiry],
      order,
      customer,
      weightsExpiryHeavy,
      TODAY,
    );

    expect(ranked[0]!.batchId).toBe('B_NEAR');
  });

  it('regionCluster 權重高時，同區域的批次排名應較高', () => {
    const weightsRegionHeavy: CompanyWeights = {
      expiry: 0.10,
      urgency: 0.10,
      orderTime: 0.05,
      customerTier: 0.10,
      regionCluster: 0.65, // 強調區域集群
    };

    const ranked = rankBatches(
      [batchNearExpiry, batchFarExpiry],
      order,
      customer,
      weightsRegionHeavy,
      TODAY,
    );

    expect(ranked[0]!.batchId).toBe('B_FAR');
  });

  it('改變權重設定後，runAllocation 回傳的最高分批次應不同', async () => {
    const weightsExpiryHeavy: CompanyWeights = {
      expiry: 0.70,
      urgency: 0.10,
      orderTime: 0.05,
      customerTier: 0.10,
      regionCluster: 0.05,
    };
    const weightsRegionHeavy: CompanyWeights = {
      expiry: 0.10,
      urgency: 0.10,
      orderTime: 0.05,
      customerTier: 0.10,
      regionCluster: 0.65,
    };

    const makeInput = (weights: CompanyWeights): AllocationInput => ({
      orders: [order],
      customers: new Map([['C001', customer]]),
      batches: [batchNearExpiry, batchFarExpiry],
      weights,
    });

    const [resultA, resultB] = await Promise.all([
      runAllocation(makeInput(weightsExpiryHeavy), engineOptions),
      runAllocation(makeInput(weightsRegionHeavy), engineOptions),
    ]);

    expect(resultA[0]!.recommendedBatchId).toBe('B_NEAR');
    expect(resultB[0]!.recommendedBatchId).toBe('B_FAR');
    // 兩次結果必須不同
    expect(resultA[0]!.recommendedBatchId).not.toBe(resultB[0]!.recommendedBatchId);
  });
});

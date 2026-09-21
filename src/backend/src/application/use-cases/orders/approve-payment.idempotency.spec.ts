import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { ApprovePaymentUseCase } from './order-lifecycle.use-cases.js';
import { PaymentStatus } from '../../../domain/payments/payment-status.js';
import { OrderStatus } from '../../../domain/orders/order-status.js';

describe('ApprovePaymentUseCase idempotency', () => {
  const paymentId = 'pay-1';
  const orderId = 'ord-1';
  const adminId = 'admin-1';

  let commerce: {
    getIdempotencyRecord: ReturnType<typeof vi.fn>;
    saveIdempotencyRecord: ReturnType<typeof vi.fn>;
    getPaymentById: ReturnType<typeof vi.fn>;
    listPaymentProofs: ReturnType<typeof vi.fn>;
    updatePaymentStatus: ReturnType<typeof vi.fn>;
    getOrderById: ReturnType<typeof vi.fn>;
    updateOrderStatus: ReturnType<typeof vi.fn>;
    writeAudit: ReturnType<typeof vi.fn>;
  };
  let useCase: ApprovePaymentUseCase;

  beforeEach(() => {
    commerce = {
      getIdempotencyRecord: vi.fn().mockResolvedValue(null),
      saveIdempotencyRecord: vi.fn().mockResolvedValue(undefined),
      getPaymentById: vi.fn().mockResolvedValue({
        id: paymentId,
        orderId,
        status: PaymentStatus.UNDER_REVIEW,
      }),
      listPaymentProofs: vi.fn().mockResolvedValue([{ id: 'proof-1' }]),
      updatePaymentStatus: vi.fn().mockImplementation(async (_id, status) => ({
        id: paymentId,
        orderId,
        status,
      })),
      getOrderById: vi.fn().mockResolvedValue({
        id: orderId,
        status: OrderStatus.PAYMENT_UNDER_REVIEW,
      }),
      updateOrderStatus: vi.fn().mockResolvedValue({}),
      writeAudit: vi.fn().mockResolvedValue(undefined),
    };

    useCase = new ApprovePaymentUseCase(
      commerce as never,
      { get: () => 24 } as unknown as ConfigService,
    );
  });

  it('stores idempotency record after approve', async () => {
    const result = await useCase.execute({
      paymentId,
      adminId,
      idempotencyKey: 'idem-abc',
    });

    expect(result.alreadyVerified).toBe(false);
    expect(commerce.saveIdempotencyRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'idem-abc',
        scope: `admin:payment-approve:${paymentId}`,
        statusCode: 200,
      }),
    );
  });

  it('replays stored idempotency response without mutating again', async () => {
    commerce.getIdempotencyRecord.mockResolvedValue({
      statusCode: 200,
      responseBody: {
        payment: { id: paymentId, status: PaymentStatus.VERIFIED },
        alreadyVerified: false,
        idempotentReplay: true,
      },
    });

    const result = await useCase.execute({
      paymentId,
      adminId,
      idempotencyKey: 'idem-abc',
    });

    expect(result.idempotentReplay).toBe(true);
    expect(commerce.getPaymentById).not.toHaveBeenCalled();
    expect(commerce.updatePaymentStatus).not.toHaveBeenCalled();
  });

  it('rejects approve when no proofs exist', async () => {
    commerce.listPaymentProofs.mockResolvedValue([]);
    await expect(
      useCase.execute({ paymentId, adminId, idempotencyKey: 'x' }),
    ).rejects.toMatchObject({ code: 'PAYMENT_PROOF_REQUIRED' });
  });
});

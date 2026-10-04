import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GetFileUrlUseCase } from '../../application/use-cases/storage/get-file-url.use-case.js';
import {
  COMMERCE_REPOSITORY,
  type CommerceRepository,
} from '../../domain/repositories/commerce.repository.js';

@Injectable()
export class OrderDetailLoader {
  private readonly logger = new Logger(OrderDetailLoader.name);

  constructor(
    private readonly getFileUrl: GetFileUrlUseCase,
    private readonly config: ConfigService,
    @Inject(COMMERCE_REPOSITORY) private readonly commerce: CommerceRepository,
  ) {}

  proofBucket() {
    return (
      this.config.get<string>('supabase.paymentProofsBucket') ??
      'payment-proofs'
    );
  }

  async withProofUrls<T extends { storagePath: string; mime?: string | null }>(
    proofs: T[],
  ) {
    return Promise.all(
      proofs.map(async (proof) => {
        const mime = String(proof.mime ?? '');
        const isImage = mime.startsWith('image/');
        try {
          const url = await this.getFileUrl.execute(
            this.proofBucket(),
            proof.storagePath,
            true,
            60 * 60,
          );
          return { ...proof, url, isImage };
        } catch {
          return { ...proof, url: null, isImage };
        }
      }),
    );
  }

  /**
   * One failed join (missing table after a partial migration, a bad proof
   * file, a timeline row the enum cannot read) must not 500 the whole order.
   * The admin sheet and the customer tracker still need the header.
   */
  async safely<T>(label: string, run: () => Promise<T>, fallback: T) {
    try {
      return await run();
    } catch (error) {
      this.logger.error(
        `Order detail: ${label} failed — ${
          error instanceof Error ? error.message : String(error)
        }`,
        error instanceof Error ? error.stack : undefined,
      );
      return fallback;
    }
  }

  async loadOrderRelations(
    orderId: string,
    options: { customerOnly?: boolean } = {},
  ) {
    const items = await this.safely(
      'items',
      () => this.commerce.listOrderItems(orderId),
      [],
    );
    const payment = await this.safely(
      'payment',
      () => this.commerce.getPaymentByOrderId(orderId),
      null,
    );
    const proofs = payment
      ? await this.safely(
          'proofs',
          async () =>
            this.withProofUrls(await this.commerce.listPaymentProofs(payment.id)),
          [],
        )
      : [];
    const [shipments, refunds, timeline, addresses] = await Promise.all([
      this.safely('shipments', () => this.commerce.listShipments(orderId), []),
      this.safely('refunds', () => this.commerce.listRefunds(orderId), []),
      this.safely(
        'timeline',
        () => this.commerce.listOrderTimeline(orderId, options),
        [],
      ),
      this.safely(
        'addresses',
        () => this.commerce.listOrderAddresses(orderId),
        [],
      ),
    ]);
    return { items, payment, proofs, shipments, refunds, timeline, addresses };
  }
}

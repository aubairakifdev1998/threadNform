import { Module } from '@nestjs/common';
import { CheckoutUseCase } from '../../application/use-cases/checkout/checkout.use-case.js';
import { PurgeCustomerUseCase } from '../../application/use-cases/customers/purge-customer.use-case.js';
import {
  ApprovePaymentUseCase,
  CancelOrderUseCase,
  RejectPaymentUseCase,
  TransitionOrderStatusUseCase,
} from '../../application/use-cases/orders/order-lifecycle.use-cases.js';
import { SubmitPaymentProofUseCase } from '../../application/use-cases/payments/submit-payment-proof.use-case.js';
import { SupabaseModule } from '../../infrastructure/supabase/supabase.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { AdminAuthGuard } from '../common/guards/admin-auth.guard.js';
import { PermissionsGuard } from '../common/guards/permissions.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { CatalogExtrasController } from './catalog-extras.controller.js';
import { CommerceController } from './commerce.controller.js';
import { SiteContentController } from './site-content.controller.js';

@Module({
  imports: [SupabaseModule, AuthModule, StorageModule],
  controllers: [
    CommerceController,
    CatalogExtrasController,
    SiteContentController,
  ],
  providers: [
    CheckoutUseCase,
    SubmitPaymentProofUseCase,
    ApprovePaymentUseCase,
    RejectPaymentUseCase,
    CancelOrderUseCase,
    TransitionOrderStatusUseCase,
    PurgeCustomerUseCase,
    AdminAuthGuard,
    PermissionsGuard,
    RolesGuard,
  ],
})
export class CommerceModule {}

import { Module } from '@nestjs/common';
import { ClaimFailureLimiter } from './claim-limiter';
import { ShareClaimService } from './share-claim.service';
import { ShareExpiryJob } from './share-expiry';
import { ShareLifecycleService } from './share-lifecycle.service';
import { SharingController } from './sharing.controller';
import { SharingService } from './sharing.service';

@Module({
  controllers: [SharingController],
  providers: [
    SharingService,
    ShareClaimService,
    ClaimFailureLimiter,
    ShareLifecycleService,
    ShareExpiryJob,
  ],
  // ShareLifecycleService : le contrôle d'accès des routes médecin (module `doctor`, L5-12).
  exports: [SharingService, ShareLifecycleService],
})
export class SharingModule {}

import { Module } from '@nestjs/common';
import { ClaimFailureLimiter } from './claim-limiter';
import { ShareClaimService } from './share-claim.service';
import { SharingController } from './sharing.controller';
import { SharingService } from './sharing.service';

@Module({
  controllers: [SharingController],
  providers: [SharingService, ShareClaimService, ClaimFailureLimiter],
  exports: [SharingService],
})
export class SharingModule {}

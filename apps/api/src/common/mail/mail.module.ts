import { Global, Module } from '@nestjs/common';
import { MailService } from './mail.service';

/** Global : tout module (auth, partage, notifications…) peut injecter MailService sans l'importer. */
@Global()
@Module({
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}

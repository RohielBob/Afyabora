import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { EmergencyController, PublicEmergencyController } from './emergency.controller';
import { EmergencyService } from './emergency.service';

@Module({
  imports: [NotificationsModule], // notification d'ouverture de la carte (file d'envoi)
  controllers: [EmergencyController, PublicEmergencyController],
  providers: [EmergencyService],
  exports: [EmergencyService],
})
export class EmergencyModule {}

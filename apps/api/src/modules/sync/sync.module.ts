import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { MeasurementsModule } from '../measurements/measurements.module';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';

// La synchronisation réutilise la logique métier des mesures et des événements (une seule source de règles).
@Module({
  imports: [MeasurementsModule, EventsModule],
  controllers: [SyncController],
  providers: [SyncService],
  exports: [SyncService],
})
export class SyncModule {}

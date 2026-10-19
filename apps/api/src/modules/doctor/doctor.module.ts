import { Module } from '@nestjs/common';
import { InsightsModule } from '../insights/insights.module';
import { ReportsModule } from '../reports/reports.module';
import { SharingModule } from '../sharing/sharing.module';
import { DoctorController } from './doctor.controller';
import { DoctorService } from './doctor.service';
import { DoctorRecordService } from './record.service';

@Module({
  imports: [
    InsightsModule, // qualité, statistiques et analyse : même calcul que l'application du patient
    SharingModule, // contrôle d'accès de chaque lecture du dossier (requireActiveAccess, L5-04)
    ReportsModule, // rapport PDF du patient (L6-02)
  ],
  controllers: [DoctorController],
  providers: [DoctorService, DoctorRecordService],
  exports: [DoctorService],
})
export class DoctorModule {}

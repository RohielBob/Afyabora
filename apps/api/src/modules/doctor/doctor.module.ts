import { Module } from '@nestjs/common';
import { InsightsModule } from '../insights/insights.module';
import { DoctorController } from './doctor.controller';
import { DoctorService } from './doctor.service';

@Module({
  imports: [InsightsModule], // qualité des données, même calcul que l'application du patient
  controllers: [DoctorController],
  providers: [DoctorService],
  exports: [DoctorService],
})
export class DoctorModule {}

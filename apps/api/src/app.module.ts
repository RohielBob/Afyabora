import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { validateEnv } from './config/env';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { MailModule } from './common/mail/mail.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { DoctorModule } from './modules/doctor/doctor.module';
import { EmergencyModule } from './modules/emergency/emergency.module';
import { EventsModule } from './modules/events/events.module';
import { HealthModule } from './modules/health/health.module';
import { ImportsModule } from './modules/imports/imports.module';
import { InsightsModule } from './modules/insights/insights.module';
import { MeasurementsModule } from './modules/measurements/measurements.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { PatientsModule } from './modules/patients/patients.module';
import { ReportsModule } from './modules/reports/reports.module';
import { SharingModule } from './modules/sharing/sharing.module';
import { SyncModule } from './modules/sync/sync.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    JwtModule.register({
      global: true,
      secret: process.env.JWT_ACCESS_SECRET,
      // HS256 explicite : JwtAuthGuard n'accepte que cet algorithme.
      signOptions: {
        algorithm: 'HS256',
        expiresIn: Number(process.env.ACCESS_TOKEN_TTL_SECONDS ?? 900),
      },
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]), // limites plus strictes par route sensible
    ScheduleModule.forRoot(),
    PrismaModule,
    MailModule,
    HealthModule,
    AuthModule,
    PatientsModule,
    DoctorModule,
    MeasurementsModule,
    EventsModule,
    SyncModule,
    ImportsModule,
    InsightsModule,
    SharingModule,
    AuditModule,
    ReportsModule,
    EmergencyModule,
    NotificationsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}

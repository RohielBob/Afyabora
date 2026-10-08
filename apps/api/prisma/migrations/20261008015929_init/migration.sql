-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('PATIENT', 'DOCTOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "DiabetesType" AS ENUM ('TYPE_1', 'TYPE_2', 'GESTATIONAL', 'OTHER');

-- CreateEnum
CREATE TYPE "GlucoseUnit" AS ENUM ('G_L', 'MG_DL', 'MMOL_L');

-- CreateEnum
CREATE TYPE "MeasurementContext" AS ENUM ('FASTING', 'BEFORE_MEAL', 'AFTER_MEAL', 'BEDTIME', 'NIGHT', 'OTHER');

-- CreateEnum
CREATE TYPE "MeasurementSource" AS ENUM ('MANUAL', 'IMPORT', 'DEVICE');

-- CreateEnum
CREATE TYPE "LifeEventType" AS ENUM ('MEAL', 'ACTIVITY', 'TREATMENT');

-- CreateEnum
CREATE TYPE "ShareStatus" AS ENUM ('PENDING', 'ACTIVE', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "DoctorVerificationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('PREVIEW', 'COMMITTED', 'REVERTED');

-- CreateEnum
CREATE TYPE "EmailTokenType" AS ENUM ('VERIFY_EMAIL', 'RESET_PASSWORD');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "emailVerifiedAt" TIMESTAMP(3),
    "failedLogins" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "consentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientProfile" (
    "userId" UUID NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "birthDate" DATE NOT NULL,
    "sex" TEXT NOT NULL,
    "diabetesType" "DiabetesType" NOT NULL,
    "diagnosisYear" INTEGER,
    "preferredUnit" "GlucoseUnit" NOT NULL DEFAULT 'G_L',
    "veryLowMgDl" INTEGER NOT NULL DEFAULT 54,
    "targetMinMgDl" INTEGER NOT NULL DEFAULT 70,
    "targetMaxMgDl" INTEGER NOT NULL DEFAULT 180,
    "veryHighMgDl" INTEGER NOT NULL DEFAULT 250,
    "thresholdsReviewedByClinician" BOOLEAN NOT NULL DEFAULT false,
    "emergencyContactName" TEXT,
    "emergencyContactPhone" TEXT,
    "emergencyContactRelation" TEXT,
    "timezoneOffsetMinutes" INTEGER NOT NULL DEFAULT 60,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatientProfile_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "DoctorProfile" (
    "userId" UUID NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "licenseNumber" TEXT NOT NULL,
    "institution" TEXT NOT NULL,
    "verificationStatus" "DoctorVerificationStatus" NOT NULL DEFAULT 'PENDING',
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DoctorProfile_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "familyId" UUID NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "rotatedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailToken" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" "EmailTokenType" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Measurement" (
    "id" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "valueMgDl" INTEGER NOT NULL,
    "originalValue" DOUBLE PRECISION NOT NULL,
    "originalUnit" "GlucoseUnit" NOT NULL,
    "measuredAt" TIMESTAMP(3) NOT NULL,
    "context" "MeasurementContext" NOT NULL DEFAULT 'OTHER',
    "source" "MeasurementSource" NOT NULL DEFAULT 'MANUAL',
    "importBatchId" UUID,
    "noteEncrypted" TEXT,
    "clientUpdatedAt" TIMESTAMP(3) NOT NULL,
    "editedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Measurement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LifeEvent" (
    "id" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "type" "LifeEventType" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "label" TEXT NOT NULL,
    "details" TEXT,
    "durationMinutes" INTEGER,
    "clientUpdatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "LifeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncOpLog" (
    "opId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "deviceId" UUID NOT NULL,
    "result" TEXT NOT NULL,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyncOpLog_pkey" PRIMARY KEY ("opId")
);

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "fileName" TEXT NOT NULL,
    "status" "ImportStatus" NOT NULL DEFAULT 'PREVIEW',
    "defaultUnit" "GlucoseUnit" NOT NULL,
    "parsedRows" JSONB NOT NULL,
    "validCount" INTEGER NOT NULL DEFAULT 0,
    "duplicateCount" INTEGER NOT NULL DEFAULT 0,
    "inconsistentCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "committedAt" TIMESTAMP(3),
    "revertedAt" TIMESTAMP(3),

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Insight" (
    "id" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "facts" JSONB NOT NULL,
    "evidenceMeasurementIds" TEXT[],
    "periodFrom" TIMESTAMP(3) NOT NULL,
    "periodTo" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Insight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShareSession" (
    "id" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "categories" TEXT[],
    "duration" TEXT NOT NULL,
    "status" "ShareStatus" NOT NULL DEFAULT 'PENDING',
    "claimedByDoctorId" UUID,
    "claimedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShareSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShareToken" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShareToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessLog" (
    "id" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "actorId" UUID,
    "sessionId" UUID,
    "action" TEXT NOT NULL,
    "ip" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmergencyCard" (
    "patientId" UUID NOT NULL,
    "fullName" TEXT,
    "diabetesType" TEXT,
    "declaredTreatment" TEXT,
    "allergies" TEXT,
    "bloodGroup" TEXT,
    "lastKnownGlucoseMgDl" INTEGER,
    "emergencyContactName" TEXT,
    "emergencyContactPhone" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "tokenHash" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmergencyCard_pkey" PRIMARY KEY ("patientId")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "patientId" UUID NOT NULL,
    "settings" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("patientId")
);

-- CreateTable
CREATE TABLE "Device" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "expoPushToken" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationOutbox" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "scheduledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "error" TEXT,

    CONSTRAINT "NotificationOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "EmailToken_tokenHash_key" ON "EmailToken"("tokenHash");

-- CreateIndex
CREATE INDEX "Measurement_patientId_measuredAt_idx" ON "Measurement"("patientId", "measuredAt");

-- CreateIndex
CREATE INDEX "Measurement_patientId_updatedAt_id_idx" ON "Measurement"("patientId", "updatedAt", "id");

-- CreateIndex
CREATE INDEX "LifeEvent_patientId_occurredAt_idx" ON "LifeEvent"("patientId", "occurredAt");

-- CreateIndex
CREATE INDEX "LifeEvent_patientId_updatedAt_id_idx" ON "LifeEvent"("patientId", "updatedAt", "id");

-- CreateIndex
CREATE INDEX "SyncOpLog_patientId_idx" ON "SyncOpLog"("patientId");

-- CreateIndex
CREATE INDEX "Insight_patientId_createdAt_idx" ON "Insight"("patientId", "createdAt");

-- CreateIndex
CREATE INDEX "ShareSession_patientId_status_idx" ON "ShareSession"("patientId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ShareToken_tokenHash_key" ON "ShareToken"("tokenHash");

-- CreateIndex
CREATE INDEX "ShareToken_sessionId_idx" ON "ShareToken"("sessionId");

-- CreateIndex
CREATE INDEX "AccessLog_patientId_at_idx" ON "AccessLog"("patientId", "at");

-- CreateIndex
CREATE UNIQUE INDEX "EmergencyCard_tokenHash_key" ON "EmergencyCard"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "Device_expoPushToken_key" ON "Device"("expoPushToken");

-- CreateIndex
CREATE INDEX "Device_userId_idx" ON "Device"("userId");

-- CreateIndex
CREATE INDEX "NotificationOutbox_status_scheduledAt_idx" ON "NotificationOutbox"("status", "scheduledAt");

-- AddForeignKey
ALTER TABLE "PatientProfile" ADD CONSTRAINT "PatientProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorProfile" ADD CONSTRAINT "DoctorProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailToken" ADD CONSTRAINT "EmailToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Measurement" ADD CONSTRAINT "Measurement_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "PatientProfile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Measurement" ADD CONSTRAINT "Measurement_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LifeEvent" ADD CONSTRAINT "LifeEvent_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "PatientProfile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncOpLog" ADD CONSTRAINT "SyncOpLog_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "PatientProfile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "PatientProfile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Insight" ADD CONSTRAINT "Insight_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "PatientProfile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareSession" ADD CONSTRAINT "ShareSession_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "PatientProfile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareSession" ADD CONSTRAINT "ShareSession_claimedByDoctorId_fkey" FOREIGN KEY ("claimedByDoctorId") REFERENCES "DoctorProfile"("userId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareToken" ADD CONSTRAINT "ShareToken_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ShareSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessLog" ADD CONSTRAINT "AccessLog_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "PatientProfile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmergencyCard" ADD CONSTRAINT "EmergencyCard_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "PatientProfile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "PatientProfile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

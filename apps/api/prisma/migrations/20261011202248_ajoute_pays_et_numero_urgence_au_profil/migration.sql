-- Pays et numéro d'urgence du patient (L9-03, contrat 0.4.0). AJOUTE deux colonnes FACULTATIVES à
-- PatientProfile : aucune donnée existante n'est modifiée ni effacée. Ni l'une ni l'autre n'est une donnée
-- de santé : l'assistant les affiche en cas d'urgence, avec le médecin et le proche déjà présents.
-- AlterTable
ALTER TABLE "PatientProfile" ADD COLUMN     "country" CHAR(2),
ADD COLUMN     "emergencyNumber" TEXT;

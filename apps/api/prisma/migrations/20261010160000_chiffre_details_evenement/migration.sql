-- Chiffrement du texte libre des événements (ex. traitement déclaré), comme la note d'une mesure.
-- La colonne est RENOMMÉE (pas supprimée puis recréée) ; les valeurs existantes, écrites EN CLAIR,
-- sont effacées : PostgreSQL ne connaît pas la clé de chiffrement (elle est dans la configuration de
-- l'API), il ne peut donc pas les chiffrer lui-même. Au 2026-10-10, seules des données de test locales
-- existent (aucune base réelle déployée).
ALTER TABLE "LifeEvent" RENAME COLUMN "details" TO "detailsEncrypted";
UPDATE "LifeEvent" SET "detailsEncrypted" = NULL;

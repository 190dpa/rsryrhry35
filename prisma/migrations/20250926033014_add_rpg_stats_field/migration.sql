-- AlterTable
ALTER TABLE "public"."RPG" ADD COLUMN     "stats" JSONB NOT NULL DEFAULT '{"strength": 1, "dexterity": 1, "intelligence": 1, "defense": 1}';

-- CreateEnum
CREATE TYPE "StatusOfToken" AS ENUM ('ACTIVE', 'USED');

-- AlterTable
ALTER TABLE "Tokens" ADD COLUMN     "replaced_by" TEXT,
ADD COLUMN     "status" "StatusOfToken" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "used_at" TIMESTAMP(3);

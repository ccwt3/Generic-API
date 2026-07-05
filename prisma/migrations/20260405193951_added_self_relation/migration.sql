/*
  Warnings:

  - A unique constraint covering the columns `[replaced_by]` on the table `Tokens` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "Tokens_user_id_idx";

-- CreateIndex
CREATE UNIQUE INDEX "Tokens_replaced_by_key" ON "Tokens"("replaced_by");

-- CreateIndex
CREATE INDEX "Tokens_user_id_status_idx" ON "Tokens"("user_id", "status");

-- AddForeignKey
ALTER TABLE "Tokens" ADD CONSTRAINT "Tokens_replaced_by_fkey" FOREIGN KEY ("replaced_by") REFERENCES "Tokens"("id") ON DELETE SET NULL ON UPDATE CASCADE;

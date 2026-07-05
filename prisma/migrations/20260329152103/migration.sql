-- CreateTable
CREATE TABLE "Tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,

    CONSTRAINT "Tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tokens_token_key" ON "Tokens"("token");

-- CreateIndex
CREATE INDEX "Tokens_user_id_idx" ON "Tokens"("user_id");

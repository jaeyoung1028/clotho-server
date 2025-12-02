-- CreateTable
CREATE TABLE "public"."TarotCard" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "image" TEXT NOT NULL,
    "meaningUp" TEXT NOT NULL,
    "meaningDown" TEXT NOT NULL,

    CONSTRAINT "TarotCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DrawResult" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userText" TEXT NOT NULL,
    "aiAnswer" TEXT NOT NULL,
    "cardId" INTEGER NOT NULL,

    CONSTRAINT "DrawResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TarotCard_name_key" ON "public"."TarotCard"("name");

-- AddForeignKey
ALTER TABLE "public"."DrawResult" ADD CONSTRAINT "DrawResult_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "public"."TarotCard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

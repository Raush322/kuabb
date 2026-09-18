/*
  Warnings:

  - A unique constraint covering the columns `[period_start]` on the table `digests` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "digests_period_start_key" ON "digests"("period_start");

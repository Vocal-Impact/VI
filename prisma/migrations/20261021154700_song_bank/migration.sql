-- CreateEnum
CREATE TYPE "SongFileKind" AS ENUM ('AUDIO', 'PDF', 'LINK');

-- AlterTable
ALTER TABLE "member" ADD COLUMN     "sectionLead" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "song_folder" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" UUID,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "song_folder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "song_file" (
    "id" UUID NOT NULL,
    "folderId" UUID NOT NULL,
    "kind" "SongFileKind" NOT NULL,
    "title" TEXT NOT NULL,
    "voicePart" "VoiceType",
    "storageKey" TEXT,
    "linkUrl" TEXT,
    "fileName" TEXT,
    "contentType" TEXT,
    "sizeBytes" INTEGER,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "song_file_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "song_folder_parentId_idx" ON "song_folder"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "song_file_storageKey_key" ON "song_file"("storageKey");

-- CreateIndex
CREATE INDEX "song_file_folderId_idx" ON "song_file"("folderId");

-- CreateIndex
CREATE INDEX "song_file_createdAt_idx" ON "song_file"("createdAt");

-- AddForeignKey
ALTER TABLE "song_folder" ADD CONSTRAINT "song_folder_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "song_folder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "song_folder" ADD CONSTRAINT "song_folder_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "song_file" ADD CONSTRAINT "song_file_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "song_folder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "song_file" ADD CONSTRAINT "song_file_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

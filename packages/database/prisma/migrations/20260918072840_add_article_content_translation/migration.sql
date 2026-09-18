-- AlterTable
ALTER TABLE "articles" ADD COLUMN     "original_content" TEXT,
ADD COLUMN     "translated_at" TIMESTAMPTZ(6),
ADD COLUMN     "translated_content" TEXT,
ADD COLUMN     "translated_title" TEXT,
ADD COLUMN     "translation_language" VARCHAR(12),
ADD COLUMN     "translation_provider" VARCHAR(32);

-- RenameIndex
ALTER INDEX "collection_items_collection_run_id_source_feed_id_article_id_ke" RENAME TO "collection_items_collection_run_id_source_feed_id_article_i_key";

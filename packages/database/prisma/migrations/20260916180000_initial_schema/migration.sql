-- Initial schema for Learning Intelligence + Banking.
-- Prepared from prisma/schema.prisma; not applied to a database yet.

CREATE SCHEMA IF NOT EXISTS "public";

CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'EDITOR', 'VIEWER');
CREATE TYPE "SourceType" AS ENUM ('ORGANIZATION', 'MEDIA', 'RESEARCH', 'CONSULTING', 'BANKING', 'ACADEMIC');
CREATE TYPE "FeedType" AS ENUM ('RSS', 'API', 'SITEMAP', 'WEB');
CREATE TYPE "Relevance" AS ENUM ('HIGH', 'MEDIUM', 'LOW', 'IRRELEVANT');
CREATE TYPE "ContentTypeCode" AS ENUM ('NEWS', 'RESEARCH', 'REPORT', 'TREND', 'CASE', 'PRODUCT', 'OPINION', 'ANALYSIS', 'EVENT', 'REGULATION', 'DATA');

CREATE TABLE "articles" (
  "id" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "original_title" TEXT,
  "url" TEXT NOT NULL,
  "canonical_url" TEXT NOT NULL,
  "author" TEXT,
  "published_at" TIMESTAMPTZ(6),
  "language" VARCHAR(12) NOT NULL,
  "excerpt" TEXT,
  "image_url" TEXT,
  "content_hash" CHAR(64) NOT NULL,
  "status" VARCHAR(24) NOT NULL DEFAULT 'NEW',
  "content_type_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "articles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "article_sources" (
  "id" UUID NOT NULL,
  "article_id" UUID NOT NULL,
  "source_id" UUID NOT NULL,
  "source_feed_id" UUID,
  "source_url" TEXT NOT NULL,
  "first_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "content_snapshot_ref" TEXT,
  "content_retention_until" TIMESTAMPTZ(6),
  CONSTRAINT "article_sources_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "article_topics" (
  "article_id" UUID NOT NULL,
  "topic_id" UUID NOT NULL,
  "confidence" DECIMAL(4,3) NOT NULL,
  "is_primary" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "article_topics_pkey" PRIMARY KEY ("article_id", "topic_id")
);

CREATE TABLE "article_tags" (
  "article_id" UUID NOT NULL,
  "tag_id" UUID NOT NULL,
  "confidence" DECIMAL(4,3) NOT NULL,
  CONSTRAINT "article_tags_pkey" PRIMARY KEY ("article_id", "tag_id")
);

CREATE TABLE "article_analysis" (
  "id" UUID NOT NULL,
  "article_id" UUID NOT NULL,
  "relevance" "Relevance" NOT NULL,
  "relevance_score" DECIMAL(5,2) NOT NULL,
  "relevance_reason" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "business_context" TEXT NOT NULL,
  "learning_implications" TEXT NOT NULL,
  "why_it_matters" TEXT NOT NULL,
  "key_signals" JSONB NOT NULL,
  "ai_model" VARCHAR(120) NOT NULL,
  "prompt_version" VARCHAR(64) NOT NULL,
  "analyzed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "article_analysis_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "topics" (
  "id" UUID NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "slug" VARCHAR(160) NOT NULL,
  "description" TEXT,
  "parent_id" UUID,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "topics_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "topics_sort_order_nonnegative" CHECK ("sort_order" >= 0)
);

CREATE TABLE "tags" (
  "id" UUID NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "slug" VARCHAR(160) NOT NULL,
  "description" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "content_types" (
  "id" UUID NOT NULL,
  "code" "ContentTypeCode" NOT NULL,
  "name" VARCHAR(80) NOT NULL,
  "description" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "content_types_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "content_types_sort_order_nonnegative" CHECK ("sort_order" >= 0)
);

CREATE TABLE "sources" (
  "id" UUID NOT NULL,
  "name" VARCHAR(200) NOT NULL,
  "slug" VARCHAR(200) NOT NULL,
  "url" TEXT NOT NULL,
  "country" VARCHAR(2),
  "language" VARCHAR(12),
  "source_type" "SourceType" NOT NULL,
  "priority" SMALLINT NOT NULL DEFAULT 0,
  "description" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "trust_score" DECIMAL(4,3),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "sources_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sources_priority_nonnegative" CHECK ("priority" >= 0),
  CONSTRAINT "sources_trust_score_range" CHECK ("trust_score" IS NULL OR "trust_score" BETWEEN 0 AND 1)
);

CREATE TABLE "source_feeds" (
  "id" UUID NOT NULL,
  "source_id" UUID NOT NULL,
  "feed_type" "FeedType" NOT NULL,
  "url" TEXT NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "last_checked_at" TIMESTAMPTZ(6),
  "last_success_at" TIMESTAMPTZ(6),
  "last_error" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "source_feeds_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "relevance_rules" (
  "id" UUID NOT NULL,
  "name" VARCHAR(200) NOT NULL,
  "rule_type" VARCHAR(40) NOT NULL,
  "rule_text" TEXT NOT NULL,
  "priority" SMALLINT NOT NULL DEFAULT 0,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "relevance_rules_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "relevance_rules_priority_nonnegative" CHECK ("priority" >= 0)
);

CREATE TABLE "ai_prompts" (
  "id" UUID NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "purpose" VARCHAR(100) NOT NULL,
  "prompt_text" TEXT NOT NULL,
  "version" VARCHAR(64) NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_prompts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "users" (
  "id" UUID NOT NULL,
  "email" VARCHAR(320) NOT NULL,
  "name" VARCHAR(200) NOT NULL,
  "role" "UserRole" NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "user_feedback" (
  "id" UUID NOT NULL,
  "article_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "feedback_type" VARCHAR(40) NOT NULL,
  "comment" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_feedback_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "collection_runs" (
  "id" UUID NOT NULL,
  "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finished_at" TIMESTAMPTZ(6),
  "status" VARCHAR(24) NOT NULL,
  "sources_checked" INTEGER NOT NULL DEFAULT 0,
  "articles_found" INTEGER NOT NULL DEFAULT 0,
  "articles_new" INTEGER NOT NULL DEFAULT 0,
  "articles_duplicate" INTEGER NOT NULL DEFAULT 0,
  "articles_relevant" INTEGER NOT NULL DEFAULT 0,
  "error_count" INTEGER NOT NULL DEFAULT 0,
  "error_log" TEXT,
  CONSTRAINT "collection_runs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "collection_runs_counts_nonnegative" CHECK (
    "sources_checked" >= 0 AND "articles_found" >= 0 AND "articles_new" >= 0
    AND "articles_duplicate" >= 0 AND "articles_relevant" >= 0 AND "error_count" >= 0
  )
);

CREATE TABLE "collection_items" (
  "id" UUID NOT NULL,
  "collection_run_id" UUID NOT NULL,
  "source_feed_id" UUID NOT NULL,
  "article_id" UUID,
  "status" VARCHAR(24) NOT NULL,
  "error" TEXT,
  CONSTRAINT "collection_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "digests" (
  "id" UUID NOT NULL,
  "title" VARCHAR(300) NOT NULL,
  "period_start" DATE NOT NULL,
  "period_end" DATE NOT NULL,
  "summary" TEXT,
  "status" VARCHAR(24) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "digests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "digests_period_order" CHECK ("period_end" >= "period_start")
);

CREATE TABLE "digest_articles" (
  "digest_id" UUID NOT NULL,
  "article_id" UUID NOT NULL,
  "position" INTEGER NOT NULL,
  "editor_note" TEXT,
  CONSTRAINT "digest_articles_pkey" PRIMARY KEY ("digest_id", "article_id"),
  CONSTRAINT "digest_articles_position_positive" CHECK ("position" > 0)
);

CREATE UNIQUE INDEX "articles_canonical_url_key" ON "articles"("canonical_url");
CREATE INDEX "articles_status_published_at_idx" ON "articles"("status", "published_at" DESC);
CREATE INDEX "articles_published_at_idx" ON "articles"("published_at" DESC);
CREATE INDEX "articles_language_idx" ON "articles"("language");
CREATE INDEX "articles_content_hash_idx" ON "articles"("content_hash");

CREATE UNIQUE INDEX "article_sources_article_id_source_id_source_url_key" ON "article_sources"("article_id", "source_id", "source_url");
CREATE INDEX "article_sources_source_id_first_seen_at_idx" ON "article_sources"("source_id", "first_seen_at" DESC);
CREATE INDEX "article_sources_source_feed_id_idx" ON "article_sources"("source_feed_id");

CREATE INDEX "article_topics_topic_id_article_id_idx" ON "article_topics"("topic_id", "article_id");
CREATE UNIQUE INDEX "article_topics_one_primary_per_article" ON "article_topics"("article_id") WHERE "is_primary" = true;
CREATE INDEX "article_tags_tag_id_article_id_idx" ON "article_tags"("tag_id", "article_id");
CREATE INDEX "article_analysis_article_id_analyzed_at_idx" ON "article_analysis"("article_id", "analyzed_at" DESC);
CREATE INDEX "article_analysis_relevance_relevance_score_idx" ON "article_analysis"("relevance", "relevance_score" DESC);
CREATE INDEX "article_analysis_prompt_version_idx" ON "article_analysis"("prompt_version");

CREATE UNIQUE INDEX "topics_slug_key" ON "topics"("slug");
CREATE INDEX "topics_parent_id_sort_order_idx" ON "topics"("parent_id", "sort_order");
CREATE INDEX "topics_is_active_sort_order_idx" ON "topics"("is_active", "sort_order");
CREATE UNIQUE INDEX "tags_slug_key" ON "tags"("slug");
CREATE INDEX "tags_is_active_name_idx" ON "tags"("is_active", "name");
CREATE UNIQUE INDEX "content_types_code_key" ON "content_types"("code");
CREATE UNIQUE INDEX "content_types_name_key" ON "content_types"("name");
CREATE INDEX "content_types_is_active_sort_order_idx" ON "content_types"("is_active", "sort_order");

CREATE UNIQUE INDEX "sources_slug_key" ON "sources"("slug");
CREATE INDEX "sources_is_active_priority_idx" ON "sources"("is_active", "priority" DESC);
CREATE INDEX "sources_source_type_idx" ON "sources"("source_type");
CREATE UNIQUE INDEX "source_feeds_source_id_url_key" ON "source_feeds"("source_id", "url");
CREATE UNIQUE INDEX "source_feeds_id_source_id_key" ON "source_feeds"("id", "source_id");
CREATE INDEX "source_feeds_is_active_feed_type_idx" ON "source_feeds"("is_active", "feed_type");
CREATE INDEX "source_feeds_source_id_idx" ON "source_feeds"("source_id");

CREATE UNIQUE INDEX "relevance_rules_name_key" ON "relevance_rules"("name");
CREATE INDEX "relevance_rules_is_active_priority_idx" ON "relevance_rules"("is_active", "priority" DESC);
CREATE UNIQUE INDEX "ai_prompts_name_version_key" ON "ai_prompts"("name", "version");
CREATE UNIQUE INDEX "ai_prompts_one_active_per_name_purpose" ON "ai_prompts"("name", "purpose") WHERE "is_active" = true;
CREATE UNIQUE INDEX "users_email_lower_key" ON "users"(lower("email"));
CREATE INDEX "users_role_is_active_idx" ON "users"("role", "is_active");
CREATE INDEX "user_feedback_article_id_created_at_idx" ON "user_feedback"("article_id", "created_at" DESC);
CREATE INDEX "user_feedback_feedback_type_created_at_idx" ON "user_feedback"("feedback_type", "created_at" DESC);
CREATE INDEX "user_feedback_user_id_idx" ON "user_feedback"("user_id");

CREATE INDEX "collection_runs_status_started_at_idx" ON "collection_runs"("status", "started_at" DESC);
CREATE INDEX "collection_runs_started_at_idx" ON "collection_runs"("started_at" DESC);
CREATE UNIQUE INDEX "collection_items_collection_run_id_source_feed_id_article_id_key" ON "collection_items"("collection_run_id", "source_feed_id", "article_id");
CREATE INDEX "collection_items_collection_run_id_idx" ON "collection_items"("collection_run_id");
CREATE INDEX "collection_items_source_feed_id_status_idx" ON "collection_items"("source_feed_id", "status");
CREATE INDEX "digests_status_period_start_idx" ON "digests"("status", "period_start" DESC);
CREATE UNIQUE INDEX "digest_articles_digest_id_position_key" ON "digest_articles"("digest_id", "position");
CREATE INDEX "digest_articles_article_id_idx" ON "digest_articles"("article_id");

ALTER TABLE "articles" ADD CONSTRAINT "articles_content_type_id_fkey" FOREIGN KEY ("content_type_id") REFERENCES "content_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "article_sources" ADD CONSTRAINT "article_sources_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "articles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "article_sources" ADD CONSTRAINT "article_sources_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "article_sources" ADD CONSTRAINT "article_sources_source_feed_id_source_id_fkey" FOREIGN KEY ("source_feed_id", "source_id") REFERENCES "source_feeds"("id", "source_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "article_topics" ADD CONSTRAINT "article_topics_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "articles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "article_topics" ADD CONSTRAINT "article_topics_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "topics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "article_tags" ADD CONSTRAINT "article_tags_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "articles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "article_tags" ADD CONSTRAINT "article_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "article_analysis" ADD CONSTRAINT "article_analysis_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "articles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "topics" ADD CONSTRAINT "topics_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "topics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "source_feeds" ADD CONSTRAINT "source_feeds_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "user_feedback" ADD CONSTRAINT "user_feedback_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "articles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "user_feedback" ADD CONSTRAINT "user_feedback_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "collection_items" ADD CONSTRAINT "collection_items_collection_run_id_fkey" FOREIGN KEY ("collection_run_id") REFERENCES "collection_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "collection_items" ADD CONSTRAINT "collection_items_source_feed_id_fkey" FOREIGN KEY ("source_feed_id") REFERENCES "source_feeds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "collection_items" ADD CONSTRAINT "collection_items_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "articles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "digest_articles" ADD CONSTRAINT "digest_articles_digest_id_fkey" FOREIGN KEY ("digest_id") REFERENCES "digests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "digest_articles" ADD CONSTRAINT "digest_articles_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "articles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

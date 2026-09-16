# Модель данных

## Общие правила

База данных — PostgreSQL. Идентификаторы — UUID. Даты хранятся как `timestamptz` в UTC. Поля `created_at` и `updated_at` имеют тип `timestamptz`; далее они сокращённо обозначаются как `timestamps`.

Перечисления: `user_role = ADMIN | EDITOR | VIEWER`; `source_type = RSS | API | SITEMAP | WEB`; `feed_type = RSS | API | SITEMAP | WEB`; `relevance = HIGH | MEDIUM | LOW | IRRELEVANT`; `content_type = NEWS | RESEARCH | REPORT | TREND | CASE | PRODUCT | OPINION | ANALYSIS | EVENT | REGULATION | DATA`.

Полный очищенный текст статьи не включён в постоянные поля `articles`. Для временного, разрешённого хранения вводится необязательное техническое поле `article_sources.content_snapshot_ref` — ссылка на защищённое временное хранилище, а также `content_retention_until`. Сам текст хранится вне основной БД только при разрешении источника и удаляется по политике retention. Для первого MVP допускается не сохранять текст вообще после анализа.

## Сущности

### 1. `articles`

Каноническая карточка уникального внешнего материала. Поля: `id uuid PK`; `title text`; `original_title text nullable`; `url text`; `canonical_url text`; `author text nullable`; `published_at timestamptz nullable`; `language varchar(12)`; `excerpt text nullable`; `image_url text nullable`; `content_hash char(64)`; `status varchar(24)`; `created_at timestamptz`; `updated_at timestamptz`.

Ограничения и индексы: unique (`canonical_url`); unique (`content_hash`) там, где хеш полного доступного содержимого сформирован надёжно; индекс (`status`, `published_at DESC`); индекс (`published_at DESC`); индекс (`language`). `url` — исходный URL, `canonical_url` — нормализованный URL для дедупликации.

### 2. `article_sources`

Показывает, откуда и через какой фид найден материал; позволяет одной статье иметь несколько точек обнаружения. Поля: `article_id uuid FK → articles.id`; `source_id uuid FK → sources.id`; `source_feed_id uuid FK → source_feeds.id nullable`; `source_url text`; `first_seen_at timestamptz`; `content_snapshot_ref text nullable`; `content_retention_until timestamptz nullable`.

Первичный ключ: составной (`article_id`, `source_id`, `source_url`). Индексы: (`source_id`, `first_seen_at DESC`), (`source_feed_id`). Временная ссылка на контент не является обязательной и не должна содержать сам текст.

### 3. `article_topics`

Связь статьи с темами и уверенность классификации. Поля: `article_id uuid FK`; `topic_id uuid FK`; `confidence numeric(4,3)`; `is_primary boolean`.

Первичный ключ: (`article_id`, `topic_id`). Индексы: (`topic_id`, `article_id`); частичный unique-индекс «не более одной строки с `is_primary = true` на статью».

### 4. `article_tags`

Связь статьи с гибкими тегами. Поля: `article_id uuid FK`; `tag_id uuid FK`; `confidence numeric(4,3)`.

Первичный ключ: (`article_id`, `tag_id`). Индекс: (`tag_id`, `article_id`).

### 5. `article_analysis`

Версионный результат AI-анализа. Поля: `id uuid PK`; `article_id uuid FK`; `relevance relevance`; `relevance_score numeric(5,2)`; `relevance_reason text`; `summary text`; `business_context text`; `learning_implications text`; `why_it_matters text`; `key_signals jsonb`; `ai_model varchar(120)`; `prompt_version varchar(64)`; `analyzed_at timestamptz`.

Индексы: (`article_id`, `analyzed_at DESC`), (`relevance`, `relevance_score DESC`), (`prompt_version`). MVP может иметь один активный анализ на статью; исторические записи сохраняются при повторном анализе. `key_signals` — ограниченный структурированный список, а не векторное представление.

### 6. `topics`

Управляемые редакцией основные разделы и поднаправления. Поля: `id uuid PK`; `name varchar(160)`; `slug varchar(160)`; `description text nullable`; `parent_id uuid FK → topics.id nullable`; `is_active boolean`; `sort_order integer`; `created_at`; `updated_at`.

Ограничения: unique (`slug`), check (`sort_order >= 0`). Индексы: (`parent_id`, `sort_order`), (`is_active`, `sort_order`).

### 7. `tags`

Гибкие метки для пересечений тем. Поля: `id uuid PK`; `name varchar(160)`; `slug varchar(160)`; `description text nullable`; `is_active boolean`; `created_at`; `updated_at`.

Ограничения: unique (`slug`). Индекс: (`is_active`, `name`).

### 8. `content_types`

Справочник редакционных типов материала. Поля: `id uuid PK`; `code content_type`; `name varchar(80)`; `description text nullable`; `is_active boolean`; `sort_order integer`; `created_at`; `updated_at`.

Ограничения: unique (`code`), unique (`name`). Индекс: (`is_active`, `sort_order`). Связь с `articles` добавляется через `articles.content_type_id uuid FK`, хотя тип определён отдельным справочником.

### 9. `sources`

Карточка организации или сайта-источника. Поля: `id uuid PK`; `name varchar(200)`; `slug varchar(200)`; `url text`; `country varchar(2) nullable`; `language varchar(12) nullable`; `source_type source_type`; `priority smallint`; `description text nullable`; `is_active boolean`; `trust_score numeric(4,3) nullable`; `created_at`; `updated_at`.

Ограничения: unique (`slug`), check (`priority >= 0`), check (`trust_score between 0 and 1`). Индексы: (`is_active`, `priority DESC`), (`source_type`).

### 10. `source_feeds`

Конкретный технический канал получения материалов. Поля: `id uuid PK`; `source_id uuid FK → sources.id`; `feed_type feed_type`; `url text`; `is_active boolean`; `last_checked_at timestamptz nullable`; `last_success_at timestamptz nullable`; `last_error text nullable`; `created_at`; `updated_at`.

Ограничения: unique (`source_id`, `url`). Индексы: (`is_active`, `feed_type`), (`source_id`). В MVP допустим к запуску только `feed_type = RSS`; другие значения существуют для будущих коннекторов.

### 11. `relevance_rules`

Редактируемые правила отбора и исключения. Поля: `id uuid PK`; `name varchar(200)`; `rule_type varchar(40)`; `rule_text text`; `priority smallint`; `is_active boolean`; `created_at`; `updated_at`.

Ограничения: unique (`name`), check (`priority >= 0`). Индекс: (`is_active`, `priority DESC`). Примеры `rule_type`: `INCLUDE`, `EXCLUDE`, `KEYWORD`, `EDITORIAL_GUIDANCE`.

### 12. `ai_prompts`

Версионируемые инструкции для AI-анализатора. Поля: `id uuid PK`; `name varchar(160)`; `purpose varchar(100)`; `prompt_text text`; `version varchar(64)`; `is_active boolean`; `created_at`.

Ограничение: unique (`name`, `version`). Частичный unique-индекс: один активный prompt для одной пары (`name`, `purpose`).

### 13. `users`

Пользователи закрытого журнала. Поля: `id uuid PK`; `email varchar(320)`; `name varchar(200)`; `role user_role`; `is_active boolean`; `created_at timestamptz`.

Ограничение: unique (`lower(email)`). Индексы: (`role`, `is_active`). Данные авторизации и сессий логически отделяются и уточняются при выборе провайдера аутентификации.

### 14. `user_feedback`

Обратная связь о качестве материала или классификации. Поля: `id uuid PK`; `article_id uuid FK → articles.id`; `user_id uuid FK → users.id`; `feedback_type varchar(40)`; `comment text nullable`; `created_at timestamptz`.

Индексы: (`article_id`, `created_at DESC`), (`feedback_type`, `created_at DESC`), (`user_id`). Допускается несколько feedback одного пользователя во времени; одинаковые активные оценки могут ограничиваться бизнес-правилом интерфейса.

### 15. `collection_runs`

Отчёт о попытке сбора. Поля: `id uuid PK`; `started_at timestamptz`; `finished_at timestamptz nullable`; `status varchar(24)`; `sources_checked integer`; `articles_found integer`; `articles_new integer`; `articles_duplicate integer`; `articles_relevant integer`; `error_count integer`; `error_log text nullable`.

Индексы: (`status`, `started_at DESC`), (`started_at DESC`). Счётчики неотрицательны.

### 16. `collection_items`

Технический результат обработки одной записи фида в конкретном запуске. Поля: `collection_run_id uuid FK → collection_runs.id`; `source_feed_id uuid FK → source_feeds.id`; `article_id uuid FK → articles.id nullable`; `status varchar(24)`; `error text nullable`.

Первичный ключ: составной (`collection_run_id`, `source_feed_id`, `article_id`) при наличии статьи; на физическом уровне практичнее технический `id uuid PK` и unique (`collection_run_id`, `source_feed_id`, `article_id`). Индексы: (`collection_run_id`), (`source_feed_id`, `status`).

### 17. `digests`

Редакторская подборка за период. Поля: `id uuid PK`; `title varchar(300)`; `period_start date`; `period_end date`; `summary text nullable`; `status varchar(24)`; `created_at timestamptz`.

Ограничения: check (`period_end >= period_start`). Индексы: (`status`, `period_start DESC`).

### 18. `digest_articles`

Порядок и редакторская заметка статьи внутри digest. Поля: `digest_id uuid FK → digests.id`; `article_id uuid FK → articles.id`; `position integer`; `editor_note text nullable`.

Первичный ключ: (`digest_id`, `article_id`). Ограничение: unique (`digest_id`, `position`); check (`position > 0`). Индекс: (`article_id`).

## Основные связи

```text
sources 1—N source_feeds
sources N—N articles через article_sources
articles N—N topics через article_topics
articles N—N tags через article_tags
articles 1—N article_analysis
articles 1—N user_feedback
users 1—N user_feedback
collection_runs 1—N collection_items
source_feeds 1—N collection_items
digests N—N articles через digest_articles
topics 1—N topics (parent_id)
```

Удаление источников, тем и пользователей должно быть мягким (`is_active`) там, где необходимо сохранить историю. Физическое удаление связанных записей возможно только по явно определённой политике retention и после проверки ссылок.

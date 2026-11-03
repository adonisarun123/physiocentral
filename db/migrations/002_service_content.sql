-- 002_service_content.sql — structured public content for detailed service pages.
ALTER TABLE service
  ADD COLUMN IF NOT EXISTS headline       text,
  ADD COLUMN IF NOT EXISTS conditions     text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS session_steps  jsonb  NOT NULL DEFAULT '[]'::jsonb,  -- [{title, body}]
  ADD COLUMN IF NOT EXISTS faqs           jsonb  NOT NULL DEFAULT '[]'::jsonb,  -- [{q, a}]
  ADD COLUMN IF NOT EXISTS seo_title      text,
  ADD COLUMN IF NOT EXISTS seo_description text,
  ADD COLUMN IF NOT EXISTS content_status text NOT NULL DEFAULT 'DRAFT'
      CHECK (content_status IN ('DRAFT','IN_REVIEW','APPROVED','PUBLISHED')),
  ADD COLUMN IF NOT EXISTS sort_order     int NOT NULL DEFAULT 100;

ALTER TABLE service ADD CONSTRAINT service_steps_is_array CHECK (jsonb_typeof(session_steps) = 'array');
ALTER TABLE service ADD CONSTRAINT service_faqs_is_array CHECK (jsonb_typeof(faqs) = 'array');

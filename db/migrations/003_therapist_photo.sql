-- 003_therapist_photo.sql — optional portrait for public clinician profiles.
-- Shown only when image_consent is true. Path is site-relative, e.g. /images/team/v-c-priya.jpg
ALTER TABLE therapist ADD COLUMN IF NOT EXISTS photo_path text;

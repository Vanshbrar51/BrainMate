-- supabase/migrations/0029_writeright_ui_preferences_v2.sql
-- Adds focusModeEnabled and grammarScanEnabled to the uiPreferences JSONB default.
-- Non-destructive: existing rows keep their values, only the column default is updated.

ALTER TABLE writeright_user_settings
ALTER COLUMN preferences
SET DEFAULT jsonb_build_object(
  'preferredTone',        'Professional',
  'preferredMode',        'email',
  'preferredIntensity',   3,
  'preferredOutputLang',  'en',
  'favouriteChips',       '[]'::jsonb,
  'uiPreferences',        jsonb_build_object(
    'sidebarOpen',        true,
    'analyticsOpen',      false,
    'coachBarEnabled',    true,
    'splitViewDefault',   false,
    'focusModeEnabled',   false,
    'grammarScanEnabled', false
  )
);

-- Backfill: ensure existing rows have the new keys with defaults
UPDATE writeright_user_settings
SET preferences = preferences
  || jsonb_build_object(
    'uiPreferences',
    COALESCE(preferences->'uiPreferences', '{}'::jsonb)
    || jsonb_build_object(
      'focusModeEnabled',   COALESCE((preferences->'uiPreferences'->>'focusModeEnabled')::boolean, false),
      'grammarScanEnabled', COALESCE((preferences->'uiPreferences'->>'grammarScanEnabled')::boolean, false)
    )
  )
WHERE preferences IS NOT NULL;

-- Migration: feedback_items — bildbilagor + redigering av skickade meddelanden
-- Created: 2026-08-17
-- Description: (A) image_urls med färdiga publika URL:er till skärmdumpar, plus
--              en egen bucket feedback-images (per-användare-mapp vid uppladdning,
--              5 MB-tak och bildtyps-allowlist serverside).
--              (B) edited_at/edited_by_sales_id som bara stämplas när innehållet
--              skrivs om, så bubblan kan visa "redigerad av X" utan att blanda
--              ihop det med att någon markerat posten som klar.
--              (C) DELETE-policy för egna rader.
-- Additiv: inga DROP TABLE/COLUMN, inga befintliga policies eller kolumner tas bort.

-- ----------------------------------------------------------------- 1) kolumner
ALTER TABLE public.feedback_items
  ADD COLUMN IF NOT EXISTS image_urls text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.feedback_items
  ADD COLUMN IF NOT EXISTS edited_at timestamp with time zone;

-- Redigering är teamgemensam (alla får skriva om allas rader), så vi måste kunna
-- se VEM som skrev om ett meddelande — annars ändras en buggrapport utan spår.
ALTER TABLE public.feedback_items
  ADD COLUMN IF NOT EXISTS edited_by_sales_id bigint REFERENCES sales(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.feedback_items.image_urls IS
  'Publika URL:er till skärmdumpar i bucketen feedback-images. Arrayordningen är visningsordning.';
COMMENT ON COLUMN public.feedback_items.edited_at IS
  'Sätts av trigger endast när text/category/image_urls ändras — inte vid klarmarkering.';
COMMENT ON COLUMN public.feedback_items.edited_by_sales_id IS
  'Sales-id för den som senast skrev om innehållet. Sätts av trigger, aldrig av klienten.';

-- ------------------------------------------------- 2) updated_at + redigerings-spår
-- Tabellen har aldrig haft någon updated_at-trigger, så updated_at har stått still
-- sedan insert. Den fixas här samtidigt som redigeringsspåret införs.
CREATE OR REPLACE FUNCTION public.stamp_feedback_edit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();

  -- Avsändaren är låst. UPDATE-policyn är teamgemensam (auth.role() =
  -- 'authenticated', ingen WITH CHECK), så utan detta kunde en klient PATCH:a
  -- sales_id till sitt eget och därmed gå runt DELETE-policyn nedan.
  NEW.sales_id := OLD.sales_id;

  IF NEW.text IS DISTINCT FROM OLD.text
     OR NEW.category IS DISTINCT FROM OLD.category
     OR NEW.image_urls IS DISTINCT FROM OLD.image_urls
  THEN
    NEW.edited_at := now();
    -- Snabb väg: sales-uppslaget körs bara vid faktisk innehållsändring,
    -- inte på varje klarmarkering (som är den vanligaste uppdateringen).
    SELECT id INTO NEW.edited_by_sales_id FROM sales WHERE user_id = auth.uid();
  ELSE
    -- Triage (status) är inte en redigering, och klienten får inte sätta fälten själv.
    NEW.edited_at := OLD.edited_at;
    NEW.edited_by_sales_id := OLD.edited_by_sales_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS stamp_feedback_items_edit ON public.feedback_items;
CREATE TRIGGER stamp_feedback_items_edit
BEFORE UPDATE ON public.feedback_items
FOR EACH ROW
EXECUTE FUNCTION public.stamp_feedback_edit();

-- ------------------------------------------------------------- 3) DELETE-policy
-- Luckrar medvetet upp den ursprungliga regeln "feedback raderas inte, den
-- markeras som 'done'" (se 20260608120000). Beslut 2026-08-17: man ska kunna
-- ta bort sitt EGET felskickade meddelande. Andras rader klarmarkeras som förut.
DROP POLICY IF EXISTS "Sales can delete their own feedback" ON public.feedback_items;
CREATE POLICY "Sales can delete their own feedback" ON public.feedback_items
  FOR DELETE
  TO authenticated
  USING (sales_id = (SELECT id FROM sales WHERE user_id = auth.uid()));

-- ------------------------------------------------------------------- 4) bucket
-- Publik bucket: innehållet är skärmdumpar av vårt eget CRM, inte kunddata.
-- Publik läsning gör att bubblan kan rendera direkt utan signerade URL:er, och
-- sökvägarna innehåller UUID:n som inte går att gissa.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'feedback-images',
  'feedback-images',
  true,
  5242880, -- 5 MB räcker för skärmdumpar och stoppar råfoton
  -- HEIC utelämnat: Chrome/Firefox renderar det inte i <img>, så tumnageln hade
  -- blivit trasig. Listan måste hållas i synk med FEEDBACK_IMAGE_MIME_TYPES.
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- Uppladdning bara i sin egen mapp (första mappnivån = auth.uid()), så sökvägen
-- alltid är spårbar till avsändaren.
DROP POLICY IF EXISTS "Feedback images insert own folder" ON storage.objects;
CREATE POLICY "Feedback images insert own folder" ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'feedback-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Radering är bucket-bred, inte mapp-bunden: eftersom redigering är teamgemensam
-- måste den ena kunna ta bort en bild ur den andres meddelande. Samma öppenhet
-- som attachments-bucketen redan har.
DROP POLICY IF EXISTS "Feedback images delete authenticated" ON storage.objects;
CREATE POLICY "Feedback images delete authenticated" ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'feedback-images');

-- Ingen SELECT-policy behövs: bucketen är publik och läses via publik URL.

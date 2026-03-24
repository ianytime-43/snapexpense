-- Migration 020: Mileage/trip tracking
CREATE TABLE IF NOT EXISTS public.trips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  start_address TEXT,
  end_address TEXT,
  start_lat DOUBLE PRECISION,
  start_lng DOUBLE PRECISION,
  end_lat DOUBLE PRECISION,
  end_lng DOUBLE PRECISION,
  distance_km NUMERIC(10,2),
  distance_miles NUMERIC(10,2),
  trip_date DATE NOT NULL DEFAULT CURRENT_DATE,
  trip_tag TEXT DEFAULT 'business' CHECK (trip_tag IN ('business', 'work', 'personal', 'commute')),
  calendar_event_id TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trips_user ON public.trips (user_id, trip_date DESC);

ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own trips"
ON public.trips FOR ALL USING (auth.uid() = user_id);

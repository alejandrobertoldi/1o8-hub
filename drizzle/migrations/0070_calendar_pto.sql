-- Add PTO/OOO event type and member_name to calendar_events.
ALTER TYPE calendar_event_type ADD VALUE IF NOT EXISTS 'pto';

ALTER TABLE calendar_events
  ADD COLUMN IF NOT EXISTS member_name VARCHAR(100);

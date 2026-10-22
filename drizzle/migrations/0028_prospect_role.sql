-- Add "prospect" value to user_role enum
ALTER TYPE "public"."user_role" ADD VALUE IF NOT EXISTS 'prospect';

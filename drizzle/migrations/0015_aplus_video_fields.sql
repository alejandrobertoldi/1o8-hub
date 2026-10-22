-- Add video-related fields to aplus_modules table
ALTER TABLE "aplus_modules" ADD COLUMN "video_drive_file_id" text;
ALTER TABLE "aplus_modules" ADD COLUMN "video_title" text;
ALTER TABLE "aplus_modules" ADD COLUMN "video_description" text;

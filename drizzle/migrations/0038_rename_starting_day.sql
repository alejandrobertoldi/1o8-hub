-- Rename set_starting_day → setup_timeline in existing onboarding data
UPDATE client_onboarding_steps
SET step_key = 'setup_timeline'
WHERE step_key = 'set_starting_day';

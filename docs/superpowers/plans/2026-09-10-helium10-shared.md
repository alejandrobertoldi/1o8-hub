# Shared Helium 10 connection implementation plan

User approved one shared account: amazon@marketfoundry.agency.

Architecture: retain the encrypted user-keyed credentials and select exactly one server-configured owner using HELIUM10_CONNECTION_OWNER_ID. Never fall back to the requesting user's credentials. Administrators manage OAuth outside SEO Manager; pending state remains bound to the initiating administrator. Existing refresh-token persistence and locking remain unchanged.

- [x] Add regression tests for shared owner selection, administrator-only mutations and callback actor binding.
- [x] Implement shared connection selection, admin OAuth routes and admin settings page; remove all SEO connection controls.
- [x] Configure the existing authorized connection locally, run focused tests and verify local UI.
- [x] Document production environment requirements and provider identity limitations. No production deployment requested.

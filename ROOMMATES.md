# Roommate matching

Roommate profiles are saved in Supabase. Discovery is optional and starts off. A student needs an active, verified university account and a complete published profile to browse matches.

Shared cards contain the display name, university, undergraduate year, major, introduction and housing preferences. First names, surnames, phone numbers and alternative emails remain private. Existing account details are reused instead of creating a second identity.

## Ranking

The score compares preferences, not personalities or safety. It is calculated in the database.

| Factor | Weight |
| --- | ---: |
| Monthly budget | 25% |
| Move-in date | 15% |
| Length of stay | 10% |
| Sleep schedule | 10% |
| Cleanliness | 10% |
| Home environment | 10% |
| Smoking | 10% |
| Guests | 5% |
| Pets | 5% |

Budget agreement measures the shared portion of the narrower budget range. Move-in dates within seven days receive full agreement, falling to zero at thirty days. Stay length compares the shorter stay with the longer one. Lifestyle answers use explicit compatibility rules in the scoring function.

Undisclosed answers are excluded. Cards show how much of the weighting was compared, alongside the score and its explanation. University, area, housing type, minimum score and overlapping budgets can be used as filters.

## Connections

A connection begins with a request. The recipient can accept or decline it, and the sender can cancel a pending request. Acceptance reveals both university email addresses. Either student can disconnect.

Requests are limited to twenty new recipients per rolling twenty-four hours. Each pair has one request record, so a closed request cannot be sent repeatedly.

Pausing discovery hides the profile and stops further email reads through the feature. Blocking hides both profiles from each other and closes their requests. Unblocking does not restore a connection. Addresses already copied by another person cannot be withdrawn.

## Integration

Migration `004_roommate_matching.sql` adds the matching functions, private request and block tables, and a housing-type preference. Existing account, contact, housing and map data are retained. It uses the account foundation from migrations 001 and 002; it does not change the housing access rules from migration 003.

The frontend keeps the existing run method. No backend service or email-provider changes are needed for matching. Old account-specific browser drafts can be loaded into the form for review. Importing does not save or publish them.

No example students are added to the live database. Test accounts exist only inside the automated database checks. Messaging, profile photos and moderator report handling are outside this change.

Checks: `npm ci --prefix tests/roommates --ignore-scripts` followed by `npm test --prefix tests/roommates`.

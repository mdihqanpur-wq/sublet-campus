# Housing map

Housing discovery uses the official 2GIS MapGL JS API. The map loads when someone opens it, while the listing page remains usable if the map is unavailable.

Price pins follow the housing filters. Selecting a pin highlights its card. The Fit listings control brings mapped results into view.

## Listing locations

Database records can provide numeric `longitude` and `latitude` fields. The frontend reads these through the existing listings endpoint. This change does not add database columns or alter the backend.

The map currently accepts points in the Almaty area: longitude 76.6–77.3, latitude 43.0–43.5. Records outside this area remain in the list without map pins.

Existing sample rooms have no confirmed property coordinates. They are not automatically assigned locations.

## Location drafts

Choose a location draft from a card, then click the map or enter coordinates. Saving keeps the draft in the current browser under `subletCampusMapDrafts.v1`. Draft pins are labelled and do not change Supabase, publish an address, or verify a property.

A browser draft takes precedence over the coordinates returned for that listing. Removing the draft restores the database location, if one is available.

## Access key

The browser map key is configured in `map-config.js`. It is visible to website visitors. Restrict its use to the deployed frontend and development preview through the 2GIS Platform Manager. Keep service limits enabled.

The current demo key is scheduled to stop working on 16 November 2026. After expiry or a service limit is reached, the map may stop loading; housing discovery continues to work.

The integration requests map tiles only. It does not use paid geocoding, route calculations, or automatic location tracking. Service availability still depends on the key's enabled services and quota.

## Checks

`node --test frontend-checks.cjs map-checks.cjs` checks the existing email and housing rules plus coordinate validation, bounds, local draft parsing, and database field preservation.

Live map rendering, key restrictions, marker interaction, and small-screen behaviour also need a browser check with an active key.

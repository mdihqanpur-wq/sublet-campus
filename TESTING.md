# SubletCampus Testing

Tested by me Abdulrahman Suleiman on 15–16 October 2026 using Chrome and the deployed website.

## 1. Homepage

**Result: PASS**

The homepage opened and the navigation links worked during my checks.

URL: https://sublet-campus-1.onrender.com/

## 2. Housing Listings

**Result: PASS**

The housing cards appeared with photos, prices, and details. The database record, "DEMO - Student Apartment", also appeared on the housing page at 150,000 KZT per month.

Its View Details button opened the demo information, including the price, address, housing type, and notice that owner contact details are unavailable.

## 3. Housing Filters

**Result: PASS**

I checked the university and room-category filters, including a combination without matching housing. The results changed as expected, and resetting the filters restored the listings.

## 4. Save and Remove Listings

**Result: PASS**

I checked saving, refreshing, and removing listings. Saved housing remained after refreshing, and removed entries stayed removed.

The saved section displayed both the KIMEP room at 140,000 KZT per month and the demo apartment at 150,000 KZT per month.

## 5. Student Profile

**Result: PASS**

I entered my details and preferences, saved the profile, and checked the preview. The preview displayed the information I entered. After refreshing, the saved profile loaded again.

The page correctly explains that the profile is stored only in the current browser.

## 6. Backend API

**Result: PASS**

URL: https://sublet-campus.onrender.com/api

The browser displayed a JSON response containing:

- message: "Welcome to the SubletCampus API"
- status: "success"

## 7. Housing API

**Result: PASS**

URL: https://sublet-campus.onrender.com/api/listings

The response contained status "success" and one approved record:

- Title: DEMO - Student Apartment
- Price: 150000
- Housing type: Apartment
- Status: approved

The same record appeared on the frontend.

## Small improvement noticed

The saved demo apartment appears under "Other" rather than its title. Showing the property title alongside the university would make saved entries easier to recognise.

## Current limitations

- Student profiles and saved housing remain in the current browser.
- The demo apartment is sample data, not a verified real property.
- Real email ownership verification and shared roommate matching are not implemented.
- API results above describe the JSON displayed in the browser. HTTP status codes were not separately recorded.
- Mobile layouts, other browsers, and security behaviour were outside this testing pass.

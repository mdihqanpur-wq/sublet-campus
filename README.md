# SubletCampus
**Education • Housing • Community**

SubletCampus is a student housing prototype designed for students in Almaty, Kazakhstan. It aims to help students explore accommodation options near universities, compare housing choices, and eventually find compatible roommates.

## Live Demo

- **Frontend:** https://sublet-campus-1.onrender.com/
- **Backend:** https://sublet-campus.onrender.com/
- **API Health Check:** https://sublet-campus.onrender.com/api
- **Housing Listings API:** https://sublet-campus.onrender.com/api/listings

## Current Features

### Housing Discovery
- Browse sample housing options near universities in Almaty.
- Filter listings by university and room category.
- Save and remove housing listings using browser local storage.
- Load approved housing records from Supabase through the backend API.

### Student Profile
- Enter student details, housing needs, and lifestyle preferences.
- Preview the profile before using it.
- Save or delete the profile in the current browser.

### Backend and Database
- Node.js and Express backend deployed on Render.
- Supabase database connection for housing listings.
- The API returns approved listing records from Supabase.

## Technology Stack

- **Frontend:** HTML, CSS, JavaScript
- **Backend:** Node.js, Express
- **Database:** Supabase
- **Deployment:** Render

## Current Limitations

This project is an early-stage prototype.

- Most housing cards contain sample information. The listing named "DEMO - Student Apartment" is a demonstration record, not a verified property.
- Saved listings and student profiles are stored in browser local storage and are not shared between users or devices.
- The current login checks allowed university email domains but does not verify ownership of an email address.
- Real student accounts, shared profiles, and roommate matching between different users are not implemented yet.
- Listing submissions, moderation, and real contact workflows are planned for future development.

## Future Development

The next development stage will focus on:

1. Real student registration and university email verification.
2. Secure storage of student profiles in Supabase.
3. A shared roommate discovery page.
4. Matching based on budget, preferred area, length of stay, and lifestyle preferences.
5. Housing submissions and moderation.

## Running the Project Locally

### 1. Clone the repository

```bash
git clone https://github.com/mdihqanpur-wq/sublet-campus.git
cd sublet-campus
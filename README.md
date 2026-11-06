# SubletCampus

**Education • Housing • Community**

SubletCampus is a student housing platform prototype designed for university students in Almaty, Kazakhstan. It aims to make housing discovery easier by helping students explore accommodation options, compare prices, search near universities, view locations on an interactive map, and save preferred listings.

Students can also publish a roommate profile, compare preferences and request a connection.

## Live Demo

- **Frontend:** https://sublet-campus-1.onrender.com/
- **Backend:** https://sublet-campus.onrender.com/
- **API Health Check:** https://sublet-campus.onrender.com/api
- **Housing Listings API:** https://sublet-campus.onrender.com/api/listings

## Current Features

### 1. University Email Authentication

- Email sign-in using Supabase Auth and one-time verification codes.
- Users enter a verification code sent to their email to complete the sign-in process.
- Access is restricted to supported university email domains.
- Account navigation and sign-out functionality are available.

### 2. Housing Discovery

- Browse housing options around universities in Almaty.
- Search by property name, university, or area.
- Filter listings by university and room category.
- Sort listings using the available sorting options, including price.
- Save and remove preferred housing listings.
- View property details and compare sample housing options.

### 3. Interactive Housing Map

- Interactive 2GIS map integrated into the housing discovery page.
- Explore the map of Almaty alongside housing listings.
- Use map controls to zoom and move around the city.
- Select draft locations for housing listings.
- Use the map's fit-to-listings control to adjust its view.

The map is integrated into the frontend, but listings need valid coordinates before their individual locations can appear on the map. Location drafts are stored in the current browser and are not published or verified.

### 4. Roommate Matching

- Save a roommate profile to Supabase and choose whether to appear in discovery.
- Compare budget, move-in date, stay length and everyday habits.
- Filter students by university, area, housing type and preference score.
- Open the score breakdown to see where preferences agree or differ.
- Send, accept, decline or cancel connection requests.
- Share university email addresses only after a request is accepted.
- Pause discovery or block another student.

Discovery starts off. First-name, surname, phone and alternative-email fields are not part of shared cards. Old account-specific browser profiles can be loaded into the form for review.

This feature requires migration `004_roommate_matching.sql`. Matching rules and privacy behavior are described in [ROOMMATES.md](ROOMMATES.md).

### 5. Backend and Database

- Node.js and Express backend deployed on Render.
- Supabase database integration for housing listings.
- API endpoint for retrieving approved housing records.
- Backend configuration through environment variables.
- API responses can be checked through the deployed endpoints listed above.

## Technology Stack

- **Frontend:** HTML, CSS, JavaScript
- **Backend:** Node.js, Express
- **Database:** Supabase
- **Authentication:** Supabase Auth
- **Interactive Map:** 2GIS
- **Hosting and Deployment:** Render
- **Version Control and Collaboration:** Git and GitHub

## Current Limitations

SubletCampus is an early-stage prototype, and some features are still under development.

- Most housing cards contain sample information. The record named `DEMO - Student Apartment` is a demonstration record, not a verified property.
- Housing listings need valid coordinates before their individual locations can appear on the map.
- Location drafts are stored only in the current browser and are not published or verified.
- Saved housing listings still use browser storage and are not shared across devices.
- The authentication flow uses email verification codes, but complete access protection across all pages and workflows should continue to be tested.
- Roommate scores compare stated preferences. They do not guarantee compatibility or personal safety.
- Housing submissions, profile photos and moderator report handling remain future work.

## Future Development

Planned improvements include:

1. Strengthen and test authentication and protected access across the application.
2. Add profile photos with controlled storage access.
3. Add valid property coordinates and display individual housing locations on the map.
4. Add a reporting and moderation workflow for roommate discovery.
5. Refine roommate matching based on feedback from students testing it.
6. Add housing submissions, moderation, and improved contact workflows.

## Running the Project Locally

### Prerequisites

- Node.js and npm
- Visual Studio Code
- The Live Server extension for local frontend testing
- A Supabase project with the required configuration

### 1. Clone the repository

```bash
git clone https://github.com/mdihqanpur-wq/sublet-campus.git
cd sublet-campus
```

### 2. Configure the backend

Open the `backend` directory and create a `.env` file containing the required environment variables:

```env
SUPABASE_URL=your_supabase_project_url
SUPABASE_PUBLISHABLE_KEY=your_supabase_publishable_key
```

Use the correct values from your Supabase project. Never commit private credentials or secret keys to GitHub.

### 3. Install and start the backend

```bash
cd backend
npm install
npm start
```

The backend should start on the configured local port. Check the server output for the address.

### 4. Run the frontend

Open the project folder in Visual Studio Code. Use Live Server to launch `index.html` and test the frontend in a browser.

Some features require the configured backend and Supabase services to be available.

## Team Contributions

- **Project owner:** Project setup and integration, frontend development, backend and database setup, deployment, documentation, and project testing.
- **Collaborator (@suleimanabdulsule-tech):** Supabase authentication and university email sign-in improvements, housing discovery and sorting enhancements, interactive 2GIS map integration, shared roommate profiles, matching and connection requests, and frontend testing.

## Project Goal

SubletCampus aims to make student housing in Almaty easier to explore and compare. By bringing together university email sign-in, housing discovery, interactive mapping, and student profiles, the project establishes a foundation for a more connected student housing experience.

# SubletCampus

**Education • Housing • Community**

Finding a room near university is only part of the challenge. Students also need clear prices, practical locations, and roommates whose daily habits fit their own.

SubletCampus is our student housing project for Almaty. We are building a place where students can explore accommodation near their campus, keep track of rooms they like, and find potential roommates.

## Current prototype

This version demonstrates the main student journey:

- Enter an email through the student gateway.
- Browse six sample housing listings.
- Filter housing by university and room category.
- Save favourite listings and remove them later.
- Explore four sample roommate profiles.

The interface uses HTML, CSS, and JavaScript. Saved housing is stored in the current browser using localStorage.

## Run in GitHub Codespaces

Open the repository in a Codespace, then run:

```bash
cd /workspaces/sublet-campus
python3 -m http.server 5501 --bind 0.0.0.0
```

Open the **Ports** tab and select **Open in Browser** for port **5501**. If the port is missing, forward it manually.

No package installation or build step is required. External images and fonts need an internet connection.

## Project files

| File | Purpose |
| --- | --- |
| `index.html` | Landing page and demonstration email entry |
| `discovery.html` | Housing listings, filters, and saved housing |
| `match.html` | Sample roommate profiles |
| `style.css` | Separate stylesheet, currently not linked by the HTML pages |
| `logo.png` | Project logo |

## Development status

This is an early frontend prototype. Email ownership is not verified, and university email domains are not enforced.

Housing details and roommate profiles are sample content. Match percentages are fixed examples, and connection buttons display an alert rather than sending a request. Saved listings remain in the current browser and are not linked to individual accounts.

## What comes next

Our next priorities are responsive layouts, shared styling, verified university accounts, student profiles, and a backend for housing submissions and moderation.

Roommate matching will use practical preferences such as budget, move-in dates, quiet hours, and lifestyle.

## Working together

Create a branch for each contribution and open a pull request. Describe the change and how you checked it so teammates can review the work before merging.

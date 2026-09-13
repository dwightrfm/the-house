# The House

A cleaning system for two people who do not like cleaning and have no time.
Not a chore list. A game played by a team of two against the house.

Static site on GitHub Pages. Free. Data lives in Supabase (also free), so both
phones and the iPad all see the same thing and nothing is stored on the device
except which name you tapped.

## Setup, once

1. **Make a Supabase project.** supabase.com, new project, free tier. Wait for it to finish building.
2. **Run the schema.** SQL Editor, paste all of `schema.sql`, Run. This makes the tables and loads the starting rooms and tasks.
3. **Fill in `config.js`.** Settings > API gives you the Project URL and the anon public key.
4. **Turn on Pages.** Repo Settings > Pages > Source: main branch, root folder.
5. On each phone and the iPad: open the site, tap your name, then Share > Add to Home Screen.

No login. That means the anon key in this public repo is enough for anyone who finds
it to read and write the data, standard photos included. Nothing sensitive goes in here.

## The rules the app enforces

1. Neither person can assign work to the other. You only claim it.
2. Nothing is ever overdue, late, failed, or red. Rooms fade, they do not fail.
3. The two scores are never shown side by side. Ever.
4. Never more than three suggested rooms at once.
5. Everything is priced in minutes.
6. A broken streak says "new season" and moves on.

## Bare Minimum Mode

Settings > "This week is a lot." Drops the goal to the floor and hides every room
except the three you marked as the floor. The streak still counts. It turns itself
off at the start of the next week, and the app never mentions how often you use it.

## Files

| File | What it is |
|---|---|
| `index.html` | Every screen |
| `app.js` | All the logic |
| `styles.css` | The look |
| `config.js` | Your two Supabase values |
| `schema.sql` | Paste once into Supabase |

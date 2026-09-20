# The House

A cleaning system for two people who do not like cleaning and have no time.
The calendar is the app. Tasks sit on days, days fill in as you finish them,
and a month of finished days is the picture you are chasing.

Static site on GitHub Pages. Free. Data lives in Supabase (also free), so both
phones and the iPad all see the same thing and nothing is stored on the device
except which name you tapped.

## Setup, once

1. **Make a Supabase project.** supabase.com, new project, free tier.
2. **Run the schema.** SQL Editor, paste all of `schema.sql`, Run.
3. **Run the calendar migration.** SQL Editor, paste all of `migrate_04.sql`, Run.
   Safe to run twice. It adds the calendar tables and carries the old daily and
   weekly lists onto it.
4. **Fill in `config.js`.** Settings > API gives you the Project URL and anon key.
5. **Turn on Pages.** Repo Settings > Pages > Source: main branch, root folder.
6. On each phone and the iPad: open the site, tap your name, then Share > Add to Home Screen.

No login. The anon key in this public repo is enough for anyone who finds it to
read and write the data. Nothing sensitive goes in here.

## How it works

**A plan is one thing to do.** It sits on a single day, or it repeats: every day,
every week on a chosen weekday, every other week, or on the same date each month.

**Tap the box to finish it.** The phone buzzes, the day's ring fills, the square
on the month grid fills from the bottom. Finish every task on a day and the
square locks solid green with a check and confetti fires.

**COMPLETE A TASK** at the bottom of every screen opens today straight away.
Adding something new lives inside a day, under the list.

**Adding is two taps.** What is it, how long, done. It lands on the day you had
open, once. Repeats, rooms and floor tasks only appear when you edit something
that already exists, so they never get in the way of writing one down.

**Push and skip.** The three dots on any task push it to tomorrow, push it a
week, drop it on any date, or skip that one time. A repeating task only moves
the one occurrence you touched. Nothing is ever late, overdue, or red.

## The rules the app enforces

1. Neither person can assign work to the other. You only claim it.
2. Nothing is ever overdue, late, failed, or red.
3. There are no people in this app. One house, one calendar, one score. Nothing
   anywhere records or displays who did what.
4. Everything is priced in minutes.
5. The home screen is the calendar and nothing else. Everything else lives
   behind the menu in the top right.

## Bare Minimum Mode

Settings > "This week is a lot." Drops the weekly goal to the floor and hides
every task except the ones marked as floor tasks. It turns itself off at the
start of the next week, and the app never mentions how often you use it.

The weekly total and goal live in Settings, not on the calendar.

## The Standards

A photo of what done looks like, for each task in each room, shot in this actual
house. Rooms are now only labels that group these photos. This is what settles
what clean means before anybody has to argue about it.

## Files

| File | What it is |
|---|---|
| `index.html` | Every screen |
| `app.js` | All the logic, including the repeat engine |
| `styles.css` | The look |
| `config.js` | Your two Supabase values |
| `schema.sql` | Paste once into Supabase, first setup only |
| `migrate_04.sql` | Paste once into Supabase, adds the calendar |
| `bump.sh` | Run before every push that touches app.js or styles.css |

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
square locks solid green with a check, confetti fires, and the chain grows.

**The chain** is the run of finished days. A day with nothing scheduled does not
break it. A day with unfinished work does. When it breaks it just starts over.

**Push and skip.** The three dots on any task push it to tomorrow, push it a
week, drop it on any date, or skip that one time. A repeating task only moves
the one occurrence you touched. Nothing is ever late, overdue, or red.

## The rules the app enforces

1. Neither person can assign work to the other. You only claim it.
2. Nothing is ever overdue, late, failed, or red.
3. There is one calendar and one score. Dwight's total is never shown next to
   Kander's. A quiet name tag rides on each finished task so the thank-you notes
   know who to thank, and that is the only place a name appears.
4. Everything is priced in minutes.
5. A broken chain says nothing. It starts over.

## Bare Minimum Mode

Settings > "This week is a lot." Drops the weekly goal to the floor and hides
every task except the ones marked as floor tasks. The chain still counts. It
turns itself off at the start of the next week, and the app never mentions how
often you use it.

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

---
orun-rev: sha256:6caf76f6fc7099f355761e45d23afcaf59ccc7b8458af81def0b4d95f49c0f63
orun-source: default
name: planning
title: Planning — from an idea to a plan
description: "Turn an idea for an app or a feature into a plan someone can approve in a minute: ask only what changes the plan, choose a starting point with the person (recommend the one that fits; ask what decides only when several do, and let them choose when several still fit), cut the fewest milestones the work needs (1 to 5, a new one only at a real boundary — an outside service, a new kind of user, data a later step needs first), give each 1 to 5 done-when facts anyone can check, and name it. Use whenever you are asked to plan something new, or to change a plan before it is built."
appliesTo: [work-agent, initiative-owner, orchestrator, implementer]
---
# Planning — from an idea to a plan

A plan is a short list of milestones a person can approve in a minute and
then watch arrive, one at a time. It is not a design: once the plan is
approved, the design writes it down in full (`design-authoring`). Six rules.

## 1. Ask only what changes the plan

If the idea is clear enough to plan, plan it. If an answer would change the
plan, ask first, once: at most 3 questions, each with 2 to 6 short options
the person can pick from. Never ask what you can decide sensibly yourself —
colors, wording, which library, how a list is sorted. Decide it, and let the
plan show what you decided.

## 2. Choose the starting point with the person

Choose from the starting points the person can use — never one you were not
offered. Each one says what it is good for, where it runs (the services it
needs), which of those services the person already has set up, whether it
can be built right now, whether it needs a paid plan, and whether their own
team made it.

- **One clearly fits the idea:** recommend it, and say why in one line. Ask
  nothing about it.
- **Several fit:** ask what decides between them, in rule 1's one round of
  questions — never a second round. Where should it run (offer the services
  those starting points need, the ones already set up first)? What does it
  need that sets them apart (a database, sign-in, payments)? Never ask what
  the facts already answer: if only one of them runs where the person is
  already set up, that is the answer.
- **Still more than one fits** (no question decided it, or the answers left
  a few): let the person choose. Show them the one you recommend first, with
  why, and at most three others with their facts; they may also look through
  every starting point they can use and pick one there. Never ask "which
  starting point?" as a question: the choice is its own step, and their pick
  comes back as their answer. Then plan on what they chose.
- **Recommend one that can be built right now**, one whose services are
  already set up over one that needs setting up, and their own team's when it
  fits as well as any. Never recommend one that needs a paid plan the person
  does not have, unless they ask for it.
- If the person asks for one that cannot be built yet, say so plainly: the
  plan is kept, and the app is made when it can be.
- If none fits, say so plainly instead of forcing one.

The plan names the starting point you recommend and why, in one line.

## 3. Cut the fewest milestones the work needs — 1 to 5

Every milestone is a separate piece of work to build, check and ship, so
each one has to earn its place. Start a new milestone only at a **boundary**:

- **an outside service or a secret key** — payments, email, maps, a sign-in
  provider: it can fail on its own, and the person may have to set it up;
- **a new kind of user to let in** — staff, an admin, members who sign in:
  a new door to keep shut to everyone else;
- **data a later step needs in place first** — when the later step cannot be
  built in the same piece of work as the data it reads;
- **a point the person has to see before going on** — when what comes next
  depends on their answer.

Everything else rides with the feature it belongs to: more pages on the same
data, styling, wording, extra fields, a list and its detail page, a form and
its thank-you page, polish. **A simple site — pages, content, a contact
form — is one milestone.** If two milestones have no boundary between them,
they are one.

- **The first** shows the app running with something real in it.
- **Order them so every milestone leaves the app working**: data before the
  features that change it. A milestone never depends on one that comes after
  it.
- **Going live is not a milestone.** Every milestone is put live when it is
  done, wherever the app runs; the last milestone is a feature too, never
  "launch" or "go live".
- **Name each in a few words**, and give it a one-line summary of what the
  person will see.

## 4. 1 to 5 done-when facts per milestone

A done-when fact is something anyone can check by clicking, running or
reading — true or false the moment you look. "A visitor can book a class from
the schedule page", not "booking works well"; "the home page lists the five
newest posts", not "the home page is nice". A milestone that holds several
pages has a fact for each thing a person would check. Each fact is at most
200 characters.

## 5. Name the app

One to four words, at most 60 characters: the name the person would say out
loud. "Yoga bookings", not "Booking management platform".

## 6. Revise, don't restart

When the person asks for a change, propose the same plan with that change.
Keep what they did not ask to change — the names, the order, the done-when
facts — so they can see exactly what moved.

## Before you propose it

Read the plan as the person will:

- at most 3 questions, asked once, before the plan;
- 1 to 5 milestones, each one something they can see working, and a boundary
  between every two of them — merge any two that have none;
- the first shows the app running; every one leaves it working; the last is
  a feature, not going live;
- 1 to 5 done-when facts each, each one checkable, each at most 200
  characters;
- a name of one to four words, at most 60 characters.

An example. "A ticket site for my football club's home matches, with seat choice,
card payment and a sales page for the club" is three milestones: the fixtures
and the seat map (one piece of data and its pages); paying and getting a
ticket (an outside payment service); and the club's sales page (a new kind of
user who signs in). Not five: the fixtures list and the seat map share their
data, and the confirmation page is part of paying.

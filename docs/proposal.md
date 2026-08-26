# School Management System

## A proposal

## The short version

This is a complete administrative system for an international school in Ghana. It covers admissions, pupil records, teaching, examinations, report cards, fees, expenditure, payroll, boarding, transport, the library, the school store, the asset register, communication with families, and the school's public website.

It runs in a web browser. Staff use it from the office, teachers from their phones, and parents from home.

Three things separate it from the alternatives, and the rest of this document is mostly about them.

It works completely before the school has signed up with anybody. Messages are written to a log rather than sent, payments are simulated rather than charged, and everything else behaves exactly as it will in September. A school can run a full term as a rehearsal and then connect a provider when it is ready.

It produces the paper a school actually runs on. Not screens with a print button, but proper documents on the school's own letterhead: report cards, offer letters, hall lists, payslips, leave-out passes, store vouchers, the asset register an auditor asks for by name.

It is built for how a Ghanaian school works, not adapted from something written for elsewhere. Mobile money is a first class payment method. The SMS providers are the ones that actually operate here. Fees are in cedis and pesewas, held as whole numbers so nothing rounds away. Continuous assessment and end of term examinations are weighted the way schools here weight them.

## What a school is actually dealing with

Most schools are not running one system. They are running six.

Pupil records are in a spreadsheet, or three spreadsheets that disagree. Fees are in an accounting package that knows nothing about pupils. Marks are on paper until somebody types them into a report card template. Parents are told things by text message sent from a personal phone. The asset register, if there is one, is a book in a cupboard.

The cost of this is not the software. It is the double entry, the disagreements between copies, and the questions nobody can answer quickly. How much does that family owe. Which children have not paid the examination fee. Who has the projector. Did the mother of that child ever receive the message about Thursday.

A single system answers those questions because the same fact is only stored once. A payment recorded at the desk changes the family's balance, the term's income, and what the reminder job will say tomorrow, without anybody entering it three times.

## What it does

**Admissions.** Applications, entrance papers, interviews, offers with a date the place is held until, a waiting list, and places counted against the real capacity of each year group. The offer letter prints on letterhead.

**Pupils.** Records, guardians and family links with siblings visible, bulk import, custom fields the school defines itself, photographs, ID cards, documents, medical information behind its own permission, and discipline records behind another.

**Teaching.** Class levels and sections, subjects, a timetable builder that refuses to double book a teacher, daily attendance, a gradebook, assessments weighted the way the school weights them, and grading scales the school sets.

**Report cards.** Generated for a class and a term, with subject marks, totals, averages, positions, attendance and the form teacher's remark, printed on letterhead and published to the guardian portal when the school is ready.

**Examinations.** Sittings, papers, halls, automatic seating with unique seat numbers, invigilation duty that will not put a teacher in two rooms at once, printed hall lists and candidate slips, and marks entered per paper across every class at once.

**Credentials.** Transcripts and certificates from templates the school designs, each carrying a verification code so an employer or a university can confirm it is genuine.

**Fees.** Fee structures per year group per term, invoicing a whole term in one operation, discounts and scholarships, payments at the desk by any method, online payment by mobile money and card, receipts, statements, and automated reminders that respect quiet hours and go to the person who actually pays.

**Expenditure.** Every bill with its category, supplier, withholding tax and payment status, approved by somebody other than the person who recorded it, set against a budget, and summarised in an income and expenditure statement.

**Payroll.** Salaries and allowances, monthly runs with SSNIT and PAYE, approval before payment, and payslips staff can see themselves.

**Boarding.** Houses, rooms and beds, allocation that will not overfill a room or put a child in the wrong house, leave-out from request through approval to the gate, and a printed pass the pupil carries.

**The asset register.** What the school owns, where it is, who has it, straight line depreciation, servicing due dates, physical verification, disposal with the gain or loss against book value, and a printed register.

**The school store.** Stock in and out, weighted average valuation, reorder levels, expiry dates, signed issue vouchers, and counts recorded as adjustments so the history is never rewritten.

**Communication.** Announcements, SMS, email, push notifications, internal memos, message templates with placeholders, audience selection down to "guardians with an outstanding balance", cost shown before sending, and a delivery log that reports what actually arrived.

**Portals.** Guardians see their own children's fees, results, attendance, announcements and documents, and can pay online. Pupils see their timetable, assignments, results and certificates.

**The website.** The school's public site is part of the system. Enquiries from the contact form arrive as admissions applications rather than in somebody's inbox.

**Also included.** Library with an issue desk, a course platform for assignments and quizzes, transport with routes and vehicles, a clinic module, visitor management with printed passes, school elections with a secret ballot, a report builder that exports to spreadsheet or PDF, and optional AI commentary on results for staff who want it.

## What makes it different

### Everything works before you sign up for anything

Most systems of this kind are unusable until the school has a payment merchant account, an SMS aggregator and a mail host. That is a poor place to be, because the school is being asked to commit money to providers before anybody has seen whether the system suits them.

Here, every integration has a working fallback. Text messages are written to the server log with their cost calculated exactly as it would be. Payments go through a simulated checkout that records everything except the money moving. Email is logged. The school can enrol pupils, bill a term, take payments, produce report cards and rehearse a whole broadcast to nine hundred parents without spending anything or signing anything.

When the school is ready, each provider is connected from a settings screen inside the system, not by an engineer editing configuration files. Each one has a test that contacts the provider and reports what happened, and for messaging there is a test send, because a balance check does not prove the sender name is registered and an unregistered sender name is the usual reason messages are accepted and never arrive.

### The paper matters

A school runs on paper more than software vendors like to admit. A parent wants a receipt in their hand. An auditor wants a register. A boarder leaving for the weekend needs something to show at the gate. A storekeeper needs a slip with a signature on it.

Every document this system produces is a proper document. It is on the school's letterhead with the crest, address and registration number. It is generated fresh each time it is asked for, so an offer withdrawn on Monday cannot still be printed on Tuesday. It is laid out for a person to read rather than being a screen sent to a printer.

There are more than twenty of these, and they were built by rendering them and looking at them. That is not a figure of speech. Two real faults were found that way and no test would have caught either: a watermark drawn over a table so the figures underneath could not be read, and a signature line that vanished because a row of underscores was being interpreted as bold text. Both were on documents that would have gone home to families.

### Money that survives a lost notification

When a parent pays online, the payment provider tells the school by sending a message to the school's system. That message can be lost while the site is restarting, refused during a database hiccup, or never sent at all because nobody pasted the address into the provider's dashboard.

In most systems that means the parent has been charged and their bill is still outstanding, and the reminder that goes out the following week chases them for money they have already paid.

Here, settlement happens in one place with three ways in. The provider's notification is one. The page the parent lands on when they come back from paying is another, because the reference is already in the address and asking the provider directly is more reliable than hoping. The third is a scheduled sweep that looks for payments that started and never finished, asks the provider what became of each one, and settles the ones that were real. It leaves anything it genuinely cannot resolve for a bursar, because "we could not find out" is not the same as "it did not happen".

All three run the same code because they have to agree, and everything in it is safe to run twice, because all three regularly will.

### Permissions that match how a school actually works

Twenty six groups of permissions across thirteen roles, and the splits inside them are the point.

Recording expenditure and approving it are separate, so a bursar cannot approve their own bills. Issuing goods from the store and correcting the book after a count are separate, because if the storekeeper can quietly write off a shortage then a sack of rice a week disappears into an adjustment nobody reads. Raising a leave-out, approving it and releasing the pupil at the gate are three permissions, because that is the whole point of the process.

Medical information and background information have their own permissions on top of ordinary pupil access. Guardians see their own children and nobody else's, enforced on every screen rather than by hiding links.

### The history is the record

Where it matters, the system stores what happened rather than a running total that somebody could edit.

A stock item has no quantity field. Its balance is the sum of its movements. A stored balance sitting beside a movement history is two answers to the same question, and the day they disagree nobody can tell which one is right. A correction is another movement, never an edit.

An asset carries its full history: where it has been, who has had it, when somebody last confirmed it exists. A projector that moved from the hall to a classroom and then could not be found is a different problem from one that was never in the hall, and only the history tells them apart.

Every significant change anywhere in the system is written to an audit trail with who did it and when.

### It tells you when it is wrong

Systems usually fail quietly. A message provider is misconfigured and every send reports success. A green badge says an integration is live when the code that actually dispatches has never heard of it.

This one is built the other way round. If the SMS provider name is not one the system can actually send through, it says so rather than logging the message and reporting nine hundred reminders sent. If a stored credential cannot be decrypted, it is reported as broken rather than silently falling back to the mock provider. If a stock movement would take a shelf below zero, the balance holds at what could really have been there and the discrepancy is flagged. If an asset cannot be found, it stays on the register at full value and is counted separately.

The build itself enforces some of this. Eight automated checks refuse to build the system if, for example, a provider credential is read from the wrong place, a page links somewhere that does not exist, a printed document could have a column truncated, or a form exists with no code behind it.

### Built for here

Money is held in pesewas as whole numbers, so nothing rounds away over a term of fee collection.

Mobile money is a first class method, not a card gateway with mobile money bolted on. MTN, Telecel and AirtelTigo are covered through Paystack, with Hubtel as an alternative.

The SMS providers are Arkesel, mNotify and Hubtel, which are the ones that actually operate in Ghana.

Withholding tax on supplier payments is part of the expenditure record because a school has to file it, and chasing a supplier for their TIN afterwards is how the return ends up late.

SSNIT and PAYE are in the payroll calculation.

The academic structure assumes three terms, continuous assessment weighted against an end of term examination, and positions in class, because that is what report cards here show.

Text messages are costed per segment and shown before sending, because SMS is a real line in a Ghanaian school's budget and schools watch it.

## What it runs on

A web application, so nothing is installed on anybody's machine. It works on a laptop in the office and on a phone in a classroom, and it can be installed on a phone as an app for push notifications.

It needs a server and a PostgreSQL database. It is designed to be deployed on an ordinary hosting platform for a modest monthly cost, and it has been built with that deployment in mind rather than assuming a server room.

Uploaded files can be kept on the server's disk or in object storage. For any school keeping medical forms and signed consent documents, object storage is the right answer, and the system will tell you if it has been left on a setting where uploads would be lost.

## What the school needs to provide

The school's name, address, telephone number, crest and registration number, for the letterhead.

The academic year and its term dates.

Class levels and sections with their capacities, and the subjects taught.

The pupil list, which can be imported from a spreadsheet.

Staff, with the roles they should hold.

Fee structures per year group per term.

When the school is ready to go further: an account with a payment provider, an account with an SMS provider, and a mail host. None of these are needed to start.

## What is not included

It is worth being straight about the edges.

There is no accounting general ledger. The system records income and expenditure and produces a statement, but a school that needs full double entry bookkeeping should expect to hand figures to an accountant or an accounting package.

There is no cafeteria or meal plan module. Boarding and the store are there, and provisions are tracked, but meal plans per pupil are not.

There is no alumni module yet, although pupil records survive graduation intact and the status exists.

The system needs an internet connection. It is not an offline application.

AI features are optional and off unless the school provides a key. Nothing depends on them, and a school that never turns them on loses nothing but the written commentary.

## Why this rather than something else

Off the shelf international products are built for schools elsewhere and adapted afterwards. That shows in the places that matter most: the payment methods, the fee structure, the way marks are weighted, the currency handling, the assumption that everyone has an email address.

Locally built products are usually narrower. Fees, or results, but not both, and rarely the boarding house, the store and the asset register as well.

Spreadsheets are free and they work until the day two people have different copies.

This system covers the whole school, is built for how schools here actually operate, produces the paper the school needs, and can be run for a term without the school spending anything on providers or committing to anything. That last point is worth more than it sounds, because it means the decision to adopt it can be made on evidence rather than on a demonstration.

## Next steps

The sensible order is a term of parallel running.

Set the system up with the school's real structure and import the current pupils. Run it alongside whatever the school does now, with messages logged rather than sent and payments simulated. Train the staff on their own accounts with their own roles.

At the end of the term, compare. If the register, the fee ledger and the report cards agree with the school's own records, connect the providers and stop the parallel running.

If they do not agree, the difference is worth understanding before anybody commits, and finding that out costs the school nothing.

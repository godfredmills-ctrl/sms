# School Management System

## User and Trainer Manual

### About this manual

This manual is written for two groups of people at once.

If you are going to use the system day to day, read the part that covers your job. A bursar does not need to know how the examinations hall seating works, and a form teacher does not need to know how payroll is approved. Each part stands on its own.

If you are training other people, read Part 12 first. It sets out an order for the sessions, how long each one takes, and the exercises that seem to work. Then read the parts you are going to teach.

The system has a lot in it. Nobody learns all of it, and nobody needs to. Most people use four or five screens and never touch the rest.

### A note on the words used here

A **pupil** is a child at the school. The system also says "student" in places, and the two mean the same thing.

A **guardian** is a parent or whoever is answerable for a pupil. One pupil can have several. One guardian can have several children at the school.

A **term** is a school term. An **academic year** contains three of them in most Ghanaian schools.

A **role** is a job description that carries a set of permissions with it. Bursar is a role. So is Form Teacher.

A **permission** is one thing you are allowed to do, such as "enter marks" or "approve expenditure".

## Part 1: Getting started

### 1.1 Signing in

Go to the school's address in a web browser. You will be asked for your email address and password.

Your account is created by an administrator, who sends you an invitation by email. The invitation contains a link that lets you set your own password. That link expires, so use it when it arrives rather than a fortnight later.

If you have forgotten your password, use the "Forgotten your password" link on the sign-in page. A reset link is sent to the address on your account. If no email arrives, check that the school has your correct address before assuming the system is broken.

### 1.2 The shape of the screen

Every screen has the same three parts.

Down the left is the navigation. What appears there depends on what you are allowed to do. If a colleague can see a menu item that you cannot, that is a permission difference, not a fault.

Across the top is a search box and your own account menu. The search box looks across pupils, staff and invoices at the same time, so typing a surname or an admission number usually gets you where you are going faster than clicking through the menu.

The middle is the screen you are on. Most screens follow the same pattern: a heading that says where you are, a row of summary figures, then the detail underneath.

### 1.3 Roles and what you can see

The system ships with thirteen roles. The main ones are Head Teacher, Assistant Head, Bursar, Registrar, Teacher, Form Teacher, House Parent, Nurse, Librarian and Front Desk, plus the two portal roles for guardians and pupils, and a Super Administrator account for whoever runs the system.

Roles can be edited, and new ones created, by anyone holding the user management permission. In practice most schools use the roles as they come and adjust one or two.

One rule is worth stating because it surprises people. The system hides what you cannot use. If a button is not on your screen, it is not that the feature is missing. It is that your role does not carry the permission for it. Ask an administrator rather than reporting a bug.

### 1.4 Your own account

Your name and photograph appear on register lists, on documents you print, and in the audit trail. Keep them accurate.

Change your password from the account menu at the top right. Do it when you first sign in and whenever you think somebody else may know it.

### 1.5 When something will not let you

Three things account for nearly every "it will not let me" in the first month.

You do not hold the permission. Ask an administrator to check your role.

The academic year or term is not the current one. A great deal of the system is scoped to a term, and entering marks against last term is a common mistake.

Something upstream is missing. You cannot invoice a term with no fee structure, allocate a bed in a house with no rooms, or add an asset before somebody has created an asset category. The system tells you what is missing and where to go and do it.

## Part 2: The school year

### 2.1 Academic years and terms

Everything in the system hangs off the academic year. Set it up before anything else.

Go to Academics, then Academic years. Create the year, give it a start and end date, and mark it current. Then add its terms with their own dates.

The term dates matter more than they look. Attendance registers, fee statements and report cards all use them to decide what belongs where. If a term's dates are wrong, figures land in the wrong term and the mistake is not obvious until somebody prints a statement.

### 2.2 Classes, levels and sections

A **class level** is a year group, such as JHS 1 or Primary 4.

A **class section** is one class within it, such as JHS 1 Amber. A section has a capacity, which is the number of children who fit, and a form teacher.

Set up levels first, then sections underneath them. The capacity figure is used by admissions to work out how many places are left, so it is worth getting right rather than leaving at a round number.

### 2.3 Subjects

Add every subject the school teaches under Academics, then Subjects. A subject can be marked as core or elective, and can be restricted to particular levels.

Once subjects exist, connect them to classes. That connection is what tells the gradebook which subjects a class is taught and who teaches them.

### 2.4 The timetable

The timetable builder is under Academics, then Timetable. You define the periods in a day, then place subjects and teachers into them for each class.

The system checks for clashes as you go. It will not let you put one teacher in two rooms at the same time, and it will tell you which lesson is in the way.

Timetables can be printed for a class, for a teacher, or for the whole school.

### 2.5 The calendar

The school calendar holds terms, holidays, events, examinations and anything else with a date. It appears on the dashboard, in the guardian portal and in the student portal, so a parent looking for the date of Speech Day does not have to telephone the office.

## Part 3: Pupils

### 3.1 Admissions

Admissions covers everything that happens before a child becomes a pupil.

An application can be entered by the office or arrive through the website enquiry form. Each application belongs to an academic year, so a family turned down one year can apply again the next without any difficulty.

The board shows every applicant in the intake, grouped by the stage they have reached. The stage is worked out from what has actually happened rather than being a field somebody has to remember to change. An applicant who has sat the entrance papers is at the assessment stage because the marks exist, not because anybody said so.

The stages run: enquiry, applied, assessed, interviewed, offered, accepted, enrolled. There are also waiting list and declined.

**Entrance papers.** Record the marks for each paper. The system works out an average and shows it on the board so the shortlist is visible without opening every record.

**Interviews.** Record who came, what was discussed and a recommendation. The notes are shown on the board row, because a one word recommendation with no reasoning behind it is not much use a fortnight later.

**Offers.** An offer carries a year group and a date by which the family must reply. Offers that have passed that date are shown first on the board, because nothing releases a held place on its own and a school that forgets will offer the same seat twice.

**The offer letter.** Printed from the row. It is on the school's letterhead, addressed to the guardian on file, and states the year group, the reference, the date the place is held until and what happens if the family does not reply. If the family has already accepted or declined, the letter says so instead of demanding a reply to a question already answered.

**Places.** The Places strip counts, for each year group, how many seats exist from the section capacities, how many children are already enrolled, and how many are promised to somebody. Offers with no year group attached are counted separately so they are not lost.

### 3.2 Admitting a pupil

Once a family accepts, enrol the child from the admissions board. The pupil record is created, the status changes, and the child appears in the class you place them in.

You can also admit a pupil directly, without going through admissions, from Students then Admit a pupil. This is the right route for a child transferring in mid year.

Every pupil gets an admission number. The format is set in Settings and the number is never reused.

### 3.3 Guardians and family links

A guardian is a person, not a field on a pupil. Create the guardian once and link them to each of their children. When the family's telephone number changes, it changes in one place.

Each link says what the relationship is, whether that guardian is the primary contact, and whether they are the one who pays. The bill payer flag decides who gets fee reminders, which matters in families where one parent handles the money and the other handles the school.

The family tree view shows siblings at the school, which is useful when a sibling discount is being applied or when the office needs to reach somebody quickly.

### 3.4 Bringing in a lot of pupils at once

Students, then Import. Download the template, fill it in, and upload it.

The import checks the file before writing anything and reports what is wrong line by line. Fix the file and upload it again. Nothing is written until the whole file is acceptable, so a half finished import cannot leave the register in a strange state.

### 3.5 ID cards

Students, then ID cards. Select the pupils and print. Cards carry the school crest, the pupil's photograph, their admission number and a code that can be scanned at the gate.

Staff cards are printed the same way from the staff list.

### 3.6 Discipline

Discipline records are kept per pupil, with the incident, what was decided and who dealt with it. They are visible to staff with the discipline permission and are not shown in the guardian portal, because a disciplinary record is a conversation the school should have with a family rather than something they read about online.

### 3.7 The end of the year

Academics, then Promotions. Choose the year group, review the list, and promote, repeat or graduate each pupil.

Graduating a pupil moves them out of the active register without deleting anything. Their results, their fee history and their documents stay.

## Part 4: Daily teaching

### 4.1 Attendance

Attendance is taken per class per day, or per lesson if the school works that way.

Open Attendance, choose your class, and mark the register. The default is present, so you are marking the exceptions. Save when you are done.

A register that has been submitted can be amended by somebody with the amend permission. Amendments are recorded, so a register is never quietly rewritten.

Attendance reports show patterns rather than single days. A pupil missing every Friday is a different problem from a pupil who was ill for a week, and the report makes that visible.

### 4.2 The gradebook

The gradebook is where marks are entered.

Choose your class and subject. You see a mark sheet with every pupil on it and a column for each assessment. Type the marks and save.

A blank is not a zero. If a pupil has not been assessed, leave the cell empty. The system treats an empty cell as "no mark yet" and leaves it out of the average, which is different from treating it as nought out of twenty.

Mark a pupil absent for an assessment rather than giving them zero. An absence is left out of both sides of the calculation. A zero drags the average down and drags the whole class position with it.

### 4.3 Assessments and how they are weighted

A subject's mark is made of components. Typically continuous assessment counts for thirty per cent and the end of term examination for seventy, but the split is set by the school under Settings, then Grading.

Each component has a weight. The subject total is worked out from the weights of the components that actually have marks, so a subject where the examination has not been sat yet shows a continuous assessment result rather than a misleadingly low total.

Grading scales are also set under Settings. A scale turns a percentage into a grade and a remark.

### 4.4 Report cards

Reports, then Report cards.

Generate for a class and a term. The system works out each subject's mark, the total, the average, the grade and the position in class. It also brings in attendance for the term and the form teacher's remark.

Review before publishing. A report card that has been published is visible in the guardian portal, and taking one back after a parent has read it is worse than checking it first.

Report cards print on the school's letterhead. Absences show as "Abs" rather than as a zero, so a parent can see the difference between a child who did badly and a child who was not there.

### 4.5 Examinations

Examinations are handled separately from ordinary class assessments because they involve the whole school at once.

**A sitting** is one examination period, such as End of Term 2. Create it with its dates.

**Papers** are the individual examinations within it. Each paper has a subject, a date, a start time and a duration.

**Halls** are the rooms examinations are held in, with the number of desks in each.

**Seating.** The system allocates candidates to desks across the available halls. Seat numbers are unique within the sitting, so two children cannot be given the same seat even when the halls have similar names.

**Invigilation.** Assign staff to papers. The system will not put a teacher in two halls at the same time.

**Hall lists** are printed per paper and show who should be in the room, where they sit and where to sign.

**Candidate slips** are printed per pupil and show every paper they are sitting, with dates, times and seat numbers.

**Marks** are entered per paper, across every class at once, which is how an examinations officer actually works. The marks flow into the gradebook and onto the report card, so nothing is entered twice.

### 4.6 Transcripts and certificates

Credentials, then Issue. Choose the pupil and the kind of document.

Transcripts pull the pupil's results across the years. Certificates use a template that the school designs under Credentials, then Templates.

Every credential issued gets a verification code. Anybody holding the printed document can check it at the school's public verification address, which is how an employer or a university confirms that a certificate is genuine.

## Part 5: Money

### 5.1 Fee structures

Finance, then Fee structures.

A fee structure says what a particular year group pays in a particular term, broken into lines such as tuition, boarding, transport and examination fees. Set one up per level per term.

Fee categories are defined once and reused. This is what makes the income statement legible later.

### 5.2 Billing a term

Once the structure exists, generate invoices for the term. The system creates one invoice per pupil, based on the structure for their year group, with any discounts they hold applied.

Invoices carry a number that is never reused and a due date taken from the billing preferences.

Review before issuing. An invoice that has been issued is visible to the family.

### 5.3 Taking a payment at the desk

Finance, then Payments, then record a payment.

Choose the pupil, enter the amount, choose the method and record it. A receipt number is issued and the receipt can be printed straight away.

The payment is applied to the oldest outstanding invoice first unless you say otherwise. This is what a bursar would do by hand and it keeps the ledger tidy.

Cash, cheque, bank transfer, mobile money, card at a terminal, and scholarship or waiver are all recorded the same way. The method is kept because it is the first question anybody asks when reconciling the bank.

### 5.4 Online payments

If the school has set up a payment provider, guardians can pay from the guardian portal by mobile money or card.

The parent chooses what to pay, is taken to the provider, pays, and is brought back. The system confirms the payment with the provider directly rather than trusting the return trip, and the invoice is settled and a receipt issued.

If the provider's notification is lost, which happens, a scheduled job picks the payment up later, asks the provider what became of it, and settles it. This is why the reconciliation job has to be scheduled before the school takes real money. Section 10.5 covers it.

### 5.5 Discounts and scholarships

Finance, then Discounts. A discount can be a percentage or a fixed amount, and can apply to one fee line or the whole bill.

Sibling discounts, staff discounts and scholarships are all handled the same way. Attach the discount to the pupil and it is applied whenever they are invoiced.

### 5.6 Reminders

Finance, then Reminders. Set how many days before a due date the first reminder goes, how often it repeats, and by which channel.

Reminders respect quiet hours, which are set under Settings. Nobody should get a fee reminder by text message at half past eleven at night.

Reminders go to the bill payer rather than to every guardian.

### 5.7 Expenditure and budget

Finance, then Expenditure. Every bill the school pays is recorded here with its category, its supplier, the amount, any withholding tax and whether it has been paid.

Expenditure is approved by somebody other than the person who recorded it. This is deliberate and it is why the head teacher holds the approval permission rather than the bursar.

The budget is set per category per year. The income and expenditure statement shows the budget against the actual, so the governing board can see where the year is going rather than only where it has been.

### 5.8 Payroll

Payroll, then Runs. Set each member of staff's salary and allowances under Salaries, then prepare a run for the month.

The run works out gross pay, deductions including SSNIT and PAYE, and net pay. Review it, then have it approved by somebody with the approval permission, then mark it paid.

Payslips are printed for the whole run or for one person. Staff can also see their own payslips in the system without going to the bursar for a copy.

## Part 6: Boarding

### 6.1 Houses, rooms and beds

Boarding, then Houses and rooms.

A house has a house parent and a set of rooms. Each room has a number of beds. The system tracks which bed each boarder is in, not just which house.

### 6.2 Allocating a bed

From the boarding overview, or from the pupil's record, allocate a bed.

The system will not put a boy in a girls' house, will not put two children in one bed, and will not exceed a room's capacity. If two people allocate the last bed at the same moment, one of them is told, rather than both being told yes.

### 6.3 Leave-out

A leave-out, or exeat, is a boarder leaving the premises and coming back.

Somebody raises it, somebody with authority approves it, and the gate records the pupil out and back in. Each step is a different permission because the point of the process is that one person does not do all three.

A leave-out pass is printed on letterhead for the pupil to carry. It states who they are, who is collecting them, when they are due back and who approved it, and has lines for signatures at the gate.

### 6.4 The gate

The gate screen shows who is currently off the premises and who is overdue. This is the screen a house parent looks at last thing at night.

Overdue leave-outs are shown first, because that is the only part of the list that needs anybody to do anything.

## Part 7: What the school owns

### 7.1 The asset register

Assets, then Register.

An asset is a thing that lasts: a bus, a generator, laboratory equipment, furniture. Each one gets a tag, which is what is written on the sticker, and the tag is the only thing anybody can read off the object during a stock take.

Each asset has a category. The category decides how its kind of thing loses value. A laptop over four years, a vehicle over eight, land not at all.

The register works out what each asset is now worth. The method is straight line, charged monthly from the date of purchase, and it never takes anything below its residual value. A projector bought in June is not charged a full year's depreciation in December.

**Movements.** When something moves room or changes hands, record it. The history is what makes the register useful. A projector that went from the hall to a classroom and then could not be found is a different problem from one that was never in the hall.

**Verification.** Once a term or once a year, somebody walks round and confirms things exist. Record what they found. If something cannot be found, record that too. It stays on the register at its full value until somebody decides to write it off, because a thing that turns up in a cupboard next term should not have to be entered again.

**Servicing.** Assets with a service interval, such as buses and generators, are flagged when they are due. An asset that has never been serviced is counted from its purchase date, so it is flagged rather than ignored.

**Disposal.** When something is sold or scrapped, record it with what the school got for it. The system compares that with what the books said it was worth and reports the gain or loss, which is the figure the accounts need.

**The printed register.** Prints on letterhead, with every asset, what it cost, what has been depreciated and what it is now worth, plus totals and a note explaining the basis of the valuation. This is the document an auditor asks for.

### 7.2 The school store

Store, then Stock.

The store holds what gets used up: exercise books, chalk, cleaning materials, and the provisions the dining hall cooks with.

Each item has a unit, which is how the store counts it, and a reorder level. When the quantity reaches the reorder level the item is flagged. An item with no reorder level is reported as untracked rather than as comfortable, because nothing will ever flag it.

**Receiving.** Record deliveries with the quantity and what each unit cost. The cost is what moves the average.

**Issuing.** Record what goes out, to whom and for which part of the school. A voucher number is issued automatically. Print the voucher and have the person taking the goods sign it. When the term's provisions are audited, the question is not what the database says but who signed for what.

**Counting.** Record what was actually on the shelf. The system works out the difference and records that as an adjustment. A count that agrees writes nothing at all.

**Valuation.** Stock is valued at weighted average cost. Every delivery moves the average and everything issued leaves at it. The balance of an item is the sum of its movements. There is no separate quantity that could disagree with the history.

Nothing can be issued that is not there. If the shelf does not have it, the system says how much is actually there and asks for a count rather than recording a fiction.

## Part 8: Talking to families

### 8.1 Announcements

Communication, then Announcements. Write it once, choose who it goes to, and publish. It appears in the portals and can also be sent out by message.

### 8.2 Sending a message

Communication, then Send message.

Choose the audience. You can pick whole year groups, particular classes, all boarders, all guardians with an outstanding balance, or a list of individuals.

Choose the channel. SMS reaches everybody in Ghana. Email carries attachments and long text. Push notifications reach anybody who has installed the app and cost nothing.

Before you send, the system tells you how many people it will reach and roughly what it will cost. Text messages are charged per segment and a long message is several segments, so this is worth reading before pressing send.

After sending, the delivery log shows what actually arrived. "Sent" only means the aggregator accepted it. Whether a parent's telephone rang is a second question, answered later, and the log answers it.

### 8.3 Memos

Memos are internal. They are drafted, approved and issued, and staff see them in the system. Use them for anything that would otherwise be a piece of paper on the staff room noticeboard.

### 8.4 Templates

Templates save you writing the same message every term. They contain placeholders such as the pupil's name, the invoice balance and the due date, which are filled in per recipient when the message goes out.

### 8.5 The website

The system includes the school's public website. Pages are edited under Website, media is uploaded to the media library, and enquiries from the website's contact form arrive in the system rather than in somebody's personal inbox.

An enquiry can be turned into an admissions application without retyping anything.

## Part 9: The portals

### 9.1 The guardian portal

Guardians sign in and see their own children.

They can see fees and what is outstanding, pay online if the school has set that up, see payment history and print receipts, see results once they are published, see attendance, see announcements and the calendar, see library loans, see school bus arrangements, and download documents the school has shared with them.

Guardians see only their own children. This is enforced on every screen rather than by hiding links.

### 9.2 The student portal

Pupils sign in and see their own timetable, assignments, results, attendance, library loans and certificates.

Older pupils can also take part in school elections, which the system runs with a secret ballot and a verifiable receipt.

## Part 10: Running the system

### 10.1 Users and roles

Users, then All users. Create an account by inviting somebody by email. Assign them a role.

A person can hold more than one role. A teacher who is also a house parent holds both, and sees the union of what the two allow.

Users, then Roles, is where roles are edited. Each role is a list of permissions with tick boxes. Change with care and test with a real account afterwards.

### 10.2 Settings

Settings, then School profile, holds the school's name, address, telephone number, crest and motto. These appear on every printed document, so fill them in before printing anything for a family.

Settings, then Dropdown options, controls the lists that appear in dropdowns across the system, so a school can use its own vocabulary.

Settings, then Custom fields, lets the school add its own fields to pupil and staff records without anybody writing code.

Settings, then Grading, holds the grading scales and the weighting between continuous assessment and examinations.

### 10.3 Integrations

Settings, then Integrations, is where the school connects its payment provider, its SMS aggregator, its email host and its notification keys.

Each one has a Test button that contacts the provider there and then and reports what happened. The test costs nothing. For SMS and email there is also a test message, which sends one real message to a number or address you type. That is the only check that proves the whole chain, including whether the sender name is registered with your provider, which is the step that most often fails.

Anything the deployment has fixed in its own environment variables is shown read only, with a note saying so.

Credentials typed here are encrypted before they are stored. They are never shown back in full, only enough of one to tell it apart from another.

### 10.4 The audit trail

Users, then Audit trail. Every significant change is recorded with who did it, what changed and when.

The audit trail is how a disagreement about who altered a mark or reversed a payment gets settled. It is not editable by anybody.

### 10.5 Scheduled jobs

Three jobs need to run on a schedule. They are ordinary web addresses that a scheduler calls with a shared secret.

**Fee reminders.** Marks invoices overdue and sends the reminders that are due. Hourly.

**Message delivery status.** Asks the SMS provider what became of messages already sent and updates the log. Every few hours.

**Payment reconciliation.** Finds payments that started and never finished, asks the provider what became of each one, and settles the ones that turn out to be real. This is not optional once the school is taking real money. Without it, a payment whose notification was lost leaves a family charged with their bill still outstanding, and the reminder job then chases them for money they have already paid.

The README that ships with the system has the exact addresses and the go live checklist.

## Part 11: What the system prints

Everything in this list prints on the school's letterhead and is generated fresh each time rather than stored, so a document is always current.

Report cards. Transcripts. Certificates. Examination timetables, hall lists and candidate slips. Invoices and fee statements. Receipts. Payslips and the payroll schedule. Admission offer letters. Boarding leave-out passes. Visitor passes. Pupil and staff ID cards. Class registers. The asset register. Store issue vouchers. Transport manifests. The income and expenditure statement. Letters written from the letters module. Any report built in the report builder.

## Part 12: For trainers

### 12.1 Before the first session

Have the system set up with real data before anybody sits down. A training session on an empty system teaches nothing, because every screen says "nothing here yet".

Set up the academic year, the terms, the class levels and sections, the subjects, and at least one full class of pupils. If the school has a previous system, import the pupils first. If not, enter one class by hand as part of the training itself, which doubles as the exercise.

Create a real account for each person you are training, with the role they will actually hold. Do not train everybody on an administrator account. People remember where the buttons were, and if they were on an administrator account, half of them will not be there on Monday.

### 12.2 A suggested order

Train by job, not by module. Five sessions, roughly half a day each.

**Session one: everybody.** Signing in, the shape of the screen, search, changing your password, and what to do when something is not there. Forty five minutes. Everyone attends this one, including the head teacher.

**Session two: the office.** Registrar and front desk. Admissions, admitting a pupil, guardians and family links, ID cards, visitors, and the website enquiry list.

**Session three: teaching staff.** Attendance, the gradebook, assessments, report cards. This is the largest group and the one where the "a blank is not a zero" point needs making twice.

**Session four: the bursar.** Fee structures, invoicing a term, taking payments, discounts, reminders, expenditure and payroll. Longest session. Do it separately and do not rush it.

**Session five: heads of department and senior staff.** Examinations, analytics, reports, memos, approvals.

Boarding, the asset register and the store are trained separately with the people who actually run them, usually an hour each.

### 12.3 Exercises that work

Give people a task and a piece of paper, not a demonstration to watch.

For teachers: here is a register with four absences on it, enter them. Here is a mark sheet with one pupil who was away for the test, enter it correctly.

For the office: here is an application form, enter it, record the entrance marks, record the interview, make the offer, print the letter.

For the bursar: here is a term's fee structure, bill the term, then take these five payments, two of which are part payments.

For house parents: allocate these four boarders to beds, then process a leave-out from request to gate.

Then ask them to find something they entered an hour ago. Finding things again is the skill people lack, and search is the answer to most of it.

### 12.4 The things people get wrong in the first week

**Entering marks against the wrong term.** Show people where the term selector is and make them look at it before they type.

**Treating an absence as a zero.** Say it twice. A zero drags the average down and moves everybody's position in the class.

**Expecting to see everything.** The system hides what a role cannot use. When somebody says a feature is missing, check their role first.

**Publishing report cards before checking them.** Once published, a parent can see them.

**Forgetting that the sender name has to be registered.** Schools sign up with an SMS provider, send a test, and nothing arrives. It is almost always the sender name, and the provider has to register it. This is not something the school can fix at their end.

**Not scheduling the reconciliation job before going live with online payments.** Covered in section 10.5. It matters.

### 12.5 Questions you will be asked

**"Can I undo it?"** Mostly yes, and the change is recorded either way. Payments are reversed rather than deleted. Stock corrections are another movement rather than an edit. Nothing important is quietly rewritten.

**"Where did that number come from?"** Every figure on a screen has a source you can open. Class positions come from subject marks, subject marks come from components, and components come from what somebody typed in the gradebook.

**"What if the internet goes down?"** The system needs a connection. What it does not need is for the school to have signed up with anybody: messages are logged rather than sent, payments are simulated, and everything else works normally, so the school can run a full term as a rehearsal before committing to a single provider.

**"Who can see my child's records?"** Guardians see only their own children. Teachers see the classes they teach. Medical information and disciplinary records have their own permissions on top of that.

## Appendix A: The permission groups

Permissions are grouped by area. The groups are: dashboard, student, staff, payroll, academic, attendance, assessment, admission, boarding, finance, asset, stock, communication, document, election, lms, report, ai, website, visitor, letter, transport, library, settings, user and portal.

Within each group, permissions are separated by what they let you do rather than by which screen they are on. In finance, reading the ledger, recording a bill and approving one are three different permissions, so the person who records expenditure cannot approve it. In stock, issuing goods and correcting the book after a count are separate for the same reason.

The full list, with a description of each permission, is on the Roles screen.

## Appendix B: Glossary

**Academic year.** The school year the system is currently working in.

**Admission number.** The unique reference given to a pupil when they join. Never reused.

**Continuous assessment.** Class work, tests and assignments taken during the term, as distinct from the end of term examination.

**Custodian.** The member of staff answerable for an asset that has been signed out to them.

**Exeat.** A boarder's authorised absence from the premises. Called a leave-out in this manual.

**Form teacher.** The teacher answerable for a class section, who writes the remark on the report card.

**Invoice.** A bill issued to a pupil for a term.

**Net book value.** What an asset is worth after depreciation. Its cost less everything written off so far.

**Reorder level.** The quantity at which a stock item should be bought again.

**Segment.** One text message's worth of characters. A long message is charged as several.

**Sitting.** One examination period, containing many papers.

**Voucher.** The signed slip recording goods issued from the store.

**Weighted average cost.** How the store values stock. Each delivery moves the average and everything issued leaves at it.

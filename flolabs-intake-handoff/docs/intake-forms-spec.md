# FloLabs Intake Forms: Field Spec & Implementation Plan (v1)

Status: draft for review. Source of truth for the 13 forms + 1 widget.
Data types use Twenty field types. They are verified against the live instance in Task 1.

## 0. Decisions captured

| # | Decision |
|---|---|
| D1 | 13 forms + 1 widget: Application, Form 1 (Contacted) x5 tracks, Form 2 (Before Meeting) x5 tracks, Form 3 (Masterclass), Contact Us, plus the Newsletter widget. |
| D0 | Terminology: internship roles are called **programs**; the former "schools" are called **tracks**. Every program belongs to exactly one track (section 9). The Twenty field keeps its API name `positionAppliedFor`. |
| D2 | 3 hosted links (Form 1, 2, 3), each with a per-applicant signed token with **no expiry** (single use still applies). The Application form is a public hosted link (no token). 2 embeds (Contact Us, Newsletter) on the websites via one loader script. |
| D3 | Forms 1 and 2 show the track-wide questions plus only the applicant's own program questions. Positions spanning tracks produce one merged form: general questions once, one section per track, closing question once. |
| D4 | Form 1: Full name, Email and Program are pre-filled from the Application and read-only. A statement replaces the track question: "The program you applied for, <Program>, is under the <Track> track." |
| D5 | No Subscription object. Consents stay separate, in the existing Application fields: marketing/newsletter = `communicationConsent` + `communicationConsentAt`; SMS/phone = `phoneMessagingConsent` + `phoneMessagingConsentAt`; `consentVersion` records the wording shown. The application form gets two optional checkboxes, unchecked by default: marketing opt-in and SMS/phone opt-in. Newsletter consent is stored on the Person (D17). |
| D6 | Contact Us goes to a new Inquiry object. |
| D7 | Existing Person match: only empty fields are filled. Submitted values are kept on the record being created. |
| D8 | Submission ID: Twenty generates the record `id` (UUID) automatically on every record, including each Form Submission. Retry protection: the client also sends a `submissionKey` (UUID), stored on the created record; a repeat with the same key returns the original record. |
| D9 | One Zod schema per form, shared by the client (live errors) and the server. Cloudflare Turnstile is verified server-side on every public endpoint. |
| D10 | "AI & Robotics Product Development" question goes to Product Development Intern (AI and Robotics). Robotics Engineering Intern gets new questions. |
| D11 | Canonical program list = 40 programs (section 9): the 39 live Twenty options with their **live labels and values unchanged**, plus Backend Developer Intern (new). |
| D12 | Form 3 reference "known duration" is required: 0-6 months, 6-12 months, 1-2 years, 2-3 years. |
| D15 | "How did you hear about us?" is single choice (Twenty SELECT), 26 options. Existing option values are kept; labels are cleaned up; 8 options are added (section 7). |
| D16 | POC scope: the Application form first. Forms 1-3, Contact Us and Newsletter follow in a revised POC. |
| D17 | Newsletter sign-ups find-or-create a Person by email and store marketing consent in Person-level consent fields (section 7). If that email later applies, the same Person is matched: only its empty fields are filled (D7), including an empty Person consent when the applicant opts in, and the Application is created as usual. |
| D13 | CV: PDF or DOCX, stored in Cloudflare R2. Preferred: Twenty attachment on the Application with Twenty's storage on R2. Fallback: R2 key + "View CV" overlay. |
| D14 | Addresses: dev/test forms.157-230-82-204.sslip.io; production forms.flolabsinnovations.com. |

Legend. Req: Y = required, N = optional, C = conditionally required. P = proposal, please confirm.
All public forms also send hidden fields: `submissionKey` (UUID, D8), `formVersion` (TEXT), `turnstileToken`.
Forms 1-3 also send `token` (signed link).

---

## 1. Application form (hosted link `/apply?site=<site_id>`)

| Field | Input | Twenty type -> target | Req | Notes |
|---|---|---|---|---|
| First Name | text | FULL_NAME.firstName -> Person.name | Y | |
| Last Name | text | FULL_NAME.lastName -> Person.name | Y | |
| Email | email | EMAILS.primaryEmail -> Person.emails | Y | Lower-cased; match key |
| Phone | country code + number | PHONES -> Person.phones | Y | E.164 normalized |
| Country/Region | select | ADDRESS.addressCountry -> Person.location | Y | |
| State/Region | text | ADDRESS.addressState -> Person.location | N | |
| City/Town | text | ADDRESS.addressCity -> Person.location | Y | |
| LinkedIn URL | url | LINKS -> Person.linkedinLink | N | Must be linkedin.com |
| Education/Major | text | TEXT -> Person.education | Y | |
| Programs Applied For | multi-select (40) | MULTI_SELECT -> Application.positionAppliedFor | Y | 1 or more |
| CV | file (PDF/DOCX, max 5 MB) | FILES -> Application.cvResume (storage = R2); fallback TEXT R2 key | Y | See D13 |
| How did you hear about us? | select (26) | SELECT -> Application.source | Y | One answer (D15) |
| Source Detail | text | TEXT -> Application.sourceDetail | C | Shown + required when Other |
| Referral Name | text | TEXT -> Application.referralName | C | Shown + required when Referral |
| Safe-sender confirmation | checkbox | BOOLEAN -> Application.safeSenderConfirmed | Y | Must be checked |
| Marketing opt-in | checkbox | BOOLEAN -> Application.communicationConsent (+ communicationConsentAt, consentVersion) | N | Unchecked by default (D5) |
| SMS/phone opt-in | checkbox | BOOLEAN -> Application.phoneMessagingConsent (+ phoneMessagingConsentAt, consentVersion) | N | Unchecked by default (D5) |
| (system) Submission key | hidden | TEXT -> Application.submissionKey | - | Retry protection (D8) |
| site key | `?site=` in the link | RELATION -> Application.site | Y | Allow-listed active Site; resolved server-side; missing/unknown -> flolabs_international (approved) |
| (system) Submitted At | - | DATE_TIME | - | Server time |
| (system) Lifecycle Stage / Lead Status | - | SELECT | - | Test values for POC |
| (system) Source Form ID / Form Version | - | TEXT | - | |

## 2. Form 1 (Contacted), shared parts across all 5 tracks

| # | Field | Input | Type | Req | Notes |
|---|---|---|---|---|---|
| G1 | Full name | read-only | TEXT | - | Pre-filled (D4) |
| G2 | Email | read-only | EMAIL | - | Pre-filled |
| G3 | Program(s) applied for | read-only | MULTI_SELECT | - | Pre-filled |
| G3b | Track statement | display | - | - | One line per program/track |
| G4 | Why are you interested in this specific program? | textarea | TEXT | Y | |
| G5 | What do you hope to learn or become capable of doing? | textarea | TEXT | Y | |
| G6 | Relevant education/background | textarea | TEXT | Y | |
| G7 | Relevant experience, projects, portfolio, research, or coursework | textarea | TEXT | Y | |
| G8 | Hours per week you can commit | number (1-40) | NUMBER | Y | Integer 1-40 |
| G9 | How long can you maintain that commitment? | select | SELECT | Y | Under 3 months / 3-6 months / 6-12 months / Over 12 months |
| G10 | Portfolio / GitHub / LinkedIn / website | url list | LINKS | N | "where relevant" |
| G11 | Comfortable working remotely in a team? | Yes/No | BOOLEAN | Y | |
| G12 | Able to attend required meetings? | Yes/No | BOOLEAN | Y | |
| G13 | Anything else relevant? | textarea | TEXT | N | |
| C1 | Closing: what interests you most / any uncertainty? | textarea | TEXT | Y | |

### 2a. Form 1 track sections (all textarea / TEXT / required unless noted)

**AI & Software Engineering.** Track-wide: AI1 most challenging project + your contribution; AI2 languages/frameworks/tools (textarea); AI3 approach to unknown problems.
Program questions: AI/AGI (1), Machine Learning (1), Computer Vision (1), Front-End (1), Backend (1), Software Development (1), Prompt Engineer (3 new), Quality Assurance (3 new), Research Associate (3 new).

**Robotics & Intelligent Systems.** Track-wide: RO1 interest in intelligent physical systems; RO2 one project you worked on; RO3 tools used = **multi-select (MULTI_SELECT)**: Arduino, ESP32, Raspberry Pi, MATLAB, Simulink, ROS, C/C++, Python, Sensors, PCB tools, CAD, EEG, Signal processing, Other (+ text when Other, P).
Program questions: Control Systems (1), Embedded Systems (1), Product Development (1, moved per D10), Neuroscience (1), Robotics Engineering (3 new), Human-Robot Interaction (3 new), Mechatronics (3 new), Sensor Integration (3 new).

**Business Management, Growth & Entrepreneurship.** Track-wide: BU1 measurable-outcome project; BU2 what success looks like.
Program questions: Business Development & Sales (1), Marketing (1), Digital Marketing (1), Content Marketing (1), GTM Influencer (1), SEO (1), Social Media (1), Project Management (1), Operations (1), Finance (3 new), GTM Engineer (3 new), Hospitality & Tourism (3 new), Podcast Production (3 new).

**Design & Technical Communication.** No track-wide questions.
UI/UX Design: DE1 portfolio link (**LINKS**, Y); DE2 one UX problem you would improve; DE3 problem-to-design process.
Technical Writing: TW1 writing sample (**LINKS** or file, Y); TW2 explaining a complex feature; TW3 rewrite this snippet (shown read-only): "To use the export you need to go to settings first but only if your an admin, otherwise ask one. Then the button for export which is at the bottom you click it and choose CSV or PDF (PDF dont work for big files over 50mb). It will email you. If it doesn't check spam or try again later maybe."
Journalism & PR: 3 new.

**Emerging Sciences & Technology.** No track-wide questions.
Space Science (3), Sport Science (3), Ethical & Legal Research (3), Animal Science & Veterinary Research (3 new), Biomedical Engineering (3 new), EdTech & Innovation (3 new), Quantum Engineer (3 new).

## 3. Form 2 (Before Meeting), shared parts

| # | Field | Input | Type | Req |
|---|---|---|---|---|
| B1 | Have you reviewed the program experience overview in the previous form? | Yes/No | BOOLEAN | Y |
| B-close | After seeing the work relevant to your program, are you still interested? | radio | SELECT: Yes definitely / Yes but I have questions / I'm unsure / No | Y |
| B-close-b | Your questions | textarea | TEXT | C, when "Yes but I have questions" |

### 3a. Form 2 track sections (textarea / TEXT / required)

- **AI & Software Engineering:** 2 track-wide questions.
- **Robotics & Intelligent Systems:** 2 track-wide questions.
- **Business:** 1 per program: Business Development, Marketing, Content Marketing, GTM Influencer, SEO, Social Media, Project Management, Operations. New (2 each): Digital Marketing, Finance, GTM Engineer, Hospitality & Tourism, Podcast Production.
- **Design:** UI/UX (3), Technical Writing (2). New: Journalism & PR (3).
- **Emerging:** Space (3), Sport (3), Ethical & Legal (3). New (3 each): Animal Science, Biomedical, EdTech, Quantum.

## 4. Form 3 (Masterclass), same for everyone

| # | Field | Input | Type | Req |
|---|---|---|---|---|
| M1 | One capability you have + one you need to develop | textarea | TEXT | Y |
| M2 | Continue to the final interview stage? | Yes/No | BOOLEAN | Y |
| M3 | Can you realistically meet the required commitment? | radio | SELECT: Yes / No / I need to discuss my availability | Y |
| M4 | What would you like clarified during your final interview? | textarea | TEXT | N |
| R1-R2 Full Name | text | TEXT -> Reference | Y |
| R1-R2 Position / Title | text | TEXT | Y |
| R1-R2 Organization / Institution | text | TEXT | Y |
| R1-R2 Relationship to you | text | TEXT | Y |
| R1-R2 Email | email | EMAILS | Y |
| R1-R2 Phone | phone | PHONES | N |
| R1-R2 How long have they known or worked with you? | select | SELECT: 0-6 months / 6-12 months / 1-2 years / 2-3 years | Y |
| M5 | May FloLabs contact these references? | Yes/No | BOOLEAN | Y |
| M5b | Explanation | textarea | TEXT | C, when No |

Validation: the two references must have different emails, and neither may be the applicant's own email.

## 5. Contact Us (embedded)

| Field | Input | Type -> target | Req |
|---|---|---|---|
| First Name | text | FULL_NAME -> Person (fill-empty rule) | Y |
| Last Name | text | FULL_NAME -> Person | Y |
| Email | email | EMAILS -> Person | Y |
| Subject | text (max 150) | TEXT -> Inquiry.subject | Y |
| How can we help? | textarea (max 5000) | TEXT -> Inquiry.message | Y |
| siteId | hidden | RELATION -> Inquiry.site | Y |
| (system) Submitted At, Status (New) | - | DATE_TIME, SELECT | - |

## 6. Newsletter widget (embedded)

Deferred to the revised POC (D16). Stored on the **Person** (D17); no Application is created.

| Field | Input | Type -> target | Req |
|---|---|---|---|
| Email Address | email | EMAILS -> Person.emails (find-or-create by email, fill-empty rule) | Y |
| Consent statement | text under the button | TEXT -> Person.consentVersion | - |
| site key | from embed snippet | TEXT -> Person.communicationConsentSite (allow-listed site key) | Y |
| (system) Marketing consent / Consent At | - | BOOLEAN / DATE_TIME -> Person.communicationConsent / communicationConsentAt | - |

## 7. Proposed schema changes (applied in Task 2 after your review)

Approved at Checkpoint A (2026-10-24). Live API names are in `docs/twenty-schema.md`. Existing option values are never renamed (existing records and imports depend on them).

| Object | Change | Fields |
|---|---|---|
| Application | update | `positionAppliedFor`: add `BACKEND_DEVELOPER_INTERN` "Backend Developer Intern"; all 39 live options unchanged. `source` (stays SELECT): add `TIKTOK` "TikTok", `REDDIT` "Reddit", `YOUTUBE` "YouTube", `X_TWITTER` "X (Twitter)", `COMPANY_WEBSITE` "Company Website", `JOB_BOARD` "Job Board", `EVENT` "Event", `REFERRAL` "Referral"; relabel only: Indeed, Glassdoor, Google, Facebook, Instagram, LinkedIn, SimplyHired, "Northeastern University's Internal Job Portal". Relabel `positionAppliedFor` "Position Applied For" -> "Programs Applied For" (label only). Add `submissionKey` (TEXT, D8). Consent fields kept and used (D5). |
| Person | update (revised POC) | Add `communicationConsent` (BOOLEAN), `communicationConsentAt` (DATE_TIME), `consentVersion` (TEXT), `communicationConsentSite` (TEXT, site key) for Newsletter sign-ups (D17) |
| Inquiry | new | subject, message, status, submittedAt, submissionKey, Person (rel), Site (rel) |
| Form Submission | new | formType (Contacted / Before Meeting / Masterclass), tracks (multi-select), formVersion, submittedAt, submissionKey, answers (RAW_JSON, keyed by question ID), **answersSummary (RICH_TEXT, markdown)**, plus typed filter fields: hoursPerWeek, commitmentDuration, remoteOk, canAttendMeetings, stillInterested, continueToInterview, canMeetCommitment, referencesContactAllowed; Application (rel) |
| Reference | new | fullName, title, organization, relationship, email, phone, knownDuration (0-6 months / 6-12 months / 1-2 years / 2-3 years), Application (rel) |

Why RAW_JSON for answers: about 120 distinct questions would mean 120 columns. Question IDs + versioned config keep it auditable. Fields people filter on stay typed.

Why answersSummary too: HR and marketing read answers in the Twenty UI. The server renders the same answers as markdown (one heading per section, each question text in bold, then the answer) into a RICH_TEXT field. `answers` stays the source of truth; the summary is generated from it on submit and never edited by the app.

## 8. New program questions

### Form 1 (experience, interest, past work)

**Prompt Engineer Intern**
1. Which AI models or tools have you used to write and test prompts?
2. Share one prompt you wrote and the result it produced.
3. How do you check whether an AI's answer is correct?

**Quality Assurance Intern**
1. What types of testing have you done (manual, automated, API, UI)?
2. Which testing tools have you used?
3. Describe one bug you found and how you reported it.

**Research Associate Intern (Open-Source Projects)**
1. Have you contributed to an open-source project? Share a link if possible.
2. Which AI or software research topic interests you most?
3. Name one paper or technical article you read recently and what you learned from it.

**Robotics Engineering Intern**
1. Describe a robot you have built, programmed, or simulated.
2. Which robotics tools have you used (for example ROS, Gazebo, MoveIt)?
3. What was the hardest problem in that project, and how did you solve it?

**Human-Robot Interaction Intern**
1. What interests you about how people interact with robots?
2. Describe a project or study involving users and a robot, device, or interface.
3. Which methods have you used to test how people use a system (surveys, interviews, user tests)?

**Mechatronics Engineering Intern**
1. Describe a project that combined mechanical, electrical, and software parts.
2. Which CAD, electronics, or programming tools have you used?
3. Which part of that project did you build yourself?

**Sensor Integration Intern**
1. Which sensors have you worked with (for example IMU, camera, LiDAR, temperature)?
2. Describe how you connected a sensor to a system and read its data.
3. How did you handle noisy or incorrect sensor readings?

**Finance Intern**
1. What finance, accounting, or budgeting experience do you have?
2. Which tools have you used (for example Excel, Google Sheets, QuickBooks)?
3. Describe one financial analysis or report you have prepared.

**GTM Engineer (Go-To-Market Engineer) Intern**
1. Which sales or marketing tools have you used or automated (for example a CRM, email tools, Zapier, n8n)?
2. Describe a workflow you built to find, contact, or track customers.
3. Which programming or scripting skills do you have?

**Hospitality and Tourism Intern**
1. What hospitality, tourism, or customer-service experience do you have?
2. Describe a time you improved a guest's or customer's experience.
3. Which area interests you most: hotels, travel, events, or food service?

**Podcast Production Intern**
1. Have you produced, edited, or hosted a podcast or video? Share a link if possible.
2. Which audio or video tools have you used?
3. Which part of production do you enjoy most: research, recording, editing, or promotion?

**Journalism and PR Intern**
1. Share a link to an article, press release, or story you wrote.
2. What writing, reporting, or media experience do you have?
3. How do you check that the facts in your writing are correct?

**Animal Science and Veterinary Research Intern**
1. Which area interests you most: animal health, nutrition, behaviour, or welfare?
2. What experience do you have working with animals, in a lab, or in the field?
3. Describe any research or coursework you have done in this area.

**Biomedical Engineering Intern**
1. Which area interests you most: medical devices, biosensors, imaging, or health data?
2. Describe a biomedical project or coursework you have done.
3. Which tools have you used (for example MATLAB, Python, CAD, lab equipment)?

**EdTech and Innovation Intern**
1. What experience do you have in teaching, tutoring, or creating learning content?
2. Which learning platforms or tools have you used or built?
3. Describe one learning problem you would like to solve with technology.

**Quantum Engineer Intern**
1. Which area of quantum technology interests you most?
2. What coursework or self-study have you done in quantum mechanics or quantum computing?
3. Which quantum tools have you used (for example Qiskit, Cirq, PennyLane)?

### Form 2 (where you can contribute, what you need to strengthen)

**Digital Marketing Intern**
1. Which digital channel would you test first for the FloLabs initiative you reviewed, and why?
2. Which marketing skill do you need to strengthen to contribute effectively?

**Finance Intern**
1. Which financial task could you help with first at FloLabs (for example budgeting, reporting, or pricing)?
2. Which finance skill or tool do you need to strengthen?

**GTM Engineer (Go-To-Market Engineer) Intern**
1. Which FloLabs sales or marketing process could you help automate first?
2. Which tool or skill do you need to strengthen to build it?

**Hospitality and Tourism Intern**
1. Which FloLabs product or initiative could improve a hospitality or tourism experience?
2. Which skill do you need to strengthen to contribute?

**Podcast Production Intern**
1. Which FloLabs project or topic would make a good podcast episode?
2. Which production skill do you need to strengthen?

**Journalism and PR Intern**
1. Which FloLabs project or story would you pitch to the media first?
2. Which audience or media outlet would you target?
3. Which writing or PR skill do you need to strengthen?

**Animal Science and Veterinary Research Intern**
1. Which FloLabs project or research direction could apply to animal health or welfare?
2. What would you want to investigate first?
3. Which skill do you need to strengthen to contribute?

**Biomedical Engineering Intern**
1. Which FloLabs project could benefit from biomedical knowledge?
2. What would you want to investigate first?
3. Which skill do you need to strengthen to contribute?

**EdTech and Innovation Intern**
1. Which FloLabs program or product could you improve as a learning experience?
2. What would you change first?
3. Which skill do you need to strengthen to contribute?

**Quantum Engineer Intern**
1. Which FloLabs problem or project could quantum methods help with?
2. What would you want to investigate first?
3. Which skill do you need to strengthen to contribute?

## 9. Canonical program list (40)

AI & Software Engineering (9): AI/AGI Intern; Backend Developer Intern; Computer Vision Engineering Intern; Front-end Developer Intern; Machine Learning Engineering Intern; Prompt Engineer Intern; Quality Assurance Intern; Research Associate Intern (Open-Source Projects); Software Development Intern.

Robotics & Intelligent Systems (8): Control Systems Engineering Intern; Embedded Systems Intern; Human-Robot Interaction Intern; Mechatronics Engineering Intern; Product Development Intern (AI & Robotics); Robotics Engineering Intern; Sensor Integration Intern; Neuroscience Intern.

Business Management, Growth & Entrepreneurship (13): Business Development and Sales Intern (AI and Robotics); Content Marketing Intern; Digital Marketing Intern; Finance Intern; GTM Engineer (Go-To-Market Engineer) Intern; GTM Influencer Intern; Hospitality and Tourism Intern; Marketing Intern; Operations Intern; Podcast Production Intern Position; Project Management Intern; SEO Specialist Intern; Social Media Intern.

Design & Technical Communication (3): Journalism & PR Intern; Technical Writing Intern; UI/UX Design Intern.

Emerging Sciences & Technology (7): Animal Science and Veterinary Research Intern; Biomedical Engineering Intern; EdTech and Innovation Intern; Ethical and Legal Research Intern; Quantum Engineer Intern; Space Science Intern; Sport Science Intern.

Labels are the live Twenty labels (D11), except the new Backend Developer Intern. Value = Twenty API value; see `docs/twenty-schema.md`. New programs follow: Title Case, "Intern" suffix.

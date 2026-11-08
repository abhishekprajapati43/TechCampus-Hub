# TechCampus Hub — API Documentation

Base URL: `http://localhost:8080`

Interactive docs (Swagger UI): `http://localhost:8080/swagger-ui.html`

## Response envelope

Success:

```json
{ "success": true, "message": "optional message", "data": { } }
```

Error:

```json
{
  "timestamp": "2026-10-13T12:00:00Z",
  "status": 400,
  "error": "Bad Request",
  "message": "Validation failed",
  "path": "/api/auth/register",
  "fieldErrors": { "email": "email must be valid" }
}
```

## Authentication

Send the JWT obtained from login as:

```
Authorization: Bearer <token>
```

| Code | Meaning |
|---|---|
| `200` | OK |
| `201` | Created |
| `400` | Validation / semantic error (see `fieldErrors`) |
| `401` | Missing/invalid/expired token, or wrong credentials |
| `403` | Authenticated but not allowed (role rules) |
| `404` | Resource not found (also used to hide gated content) |
| `409` | Conflict (duplicate e-mail, duplicate certificate no.) |
| `503` | File storage not configured (Cloudinary env vars missing) |

---

## Auth — `/api/auth` (public unless noted)

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/register` | public | Register a STUDENT account; sends verification e-mail |
| POST | `/api/auth/login` | public | Returns `{token, tokenType:"Bearer", expiresInMs, user}` |
| POST | `/api/auth/verify-email` | public | Body `{"token":"..."}` or `?token=...` |
| GET | `/api/auth/verify-email?token=` | public | Same, for the link clicked in the e-mail |
| POST | `/api/auth/resend-verification` | public | Body `{"email":"..."}` |
| POST | `/api/auth/forgot-password` | public | Always `200` (never leaks account existence) |
| POST | `/api/auth/reset-password` | public | Body `{"token":"...","newPassword":"..."}`; token valid 30 min, single use |
| GET | `/api/auth/me` | token | Current profile |
| PUT | `/api/auth/profile` | token | Update `name` / `phone` |
| PUT | `/api/auth/change-password` | token | `{"currentPassword","newPassword"}` |

### Register

```http
POST /api/auth/register
Content-Type: application/json

{ "name": "Asha Kumar", "email": "asha@example.com", "password": "Secret@123", "phone": "+91 9876543210" }
```

`201` → `data` is the user (`role: "STUDENT"`, `emailVerified: false`).
`409` if the e-mail already exists. Password rules: 8–72 characters.

### Login

```http
POST /api/auth/login
{ "email": "asha@example.com", "password": "Secret@123" }
```

`200` → `{ "token": "eyJ...", "tokenType": "Bearer", "expiresInMs": 86400000, "user": {...} }`

`401` for wrong e-mail/password (identical message for both, no account probing).
`403` when `REQUIRE_EMAIL_VERIFICATION=true` and the address is unverified.

---

## Courses — `/api/courses` (public read)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/courses` | public | Active courses only |
| GET | `/api/courses/{id}` | public | Single course |
| GET | `/api/admin/courses` | ADMIN | All courses incl. inactive |
| POST | `/api/admin/courses` | ADMIN | Create |
| PUT | `/api/admin/courses/{id}` | ADMIN | Full update (`title` + `priceInr` required; soft delete via `active:false`) |
| DELETE | `/api/admin/courses/{id}` | ADMIN | Soft delete (`active=false`) |

```json
// CourseRequest
{ "title": "MCA Semester 1", "code": "MCA-S1", "category": "MCA",
  "description": "Complete bundle", "priceInr": 499.00,
  "thumbnailUrl": "https://res.cloudinary.com/.../thumb.png",
  "validityDays": 180, "slug": "mca-semester-1",
  "highlights": ["All semesters", "PDF notes"],
  "sortOrder": 1, "active": true }
```

---

## Site settings — `/api/settings`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/settings` | public | Current settings (UPI id, chatbot link, Telegram invite) |
| PUT | `/api/settings` | ADMIN | Partial update — only supplied fields change |

```json
// SiteSettingRequest - all fields optional
{ "upiId": "abhishekprajapati8115@okicici",
  "geminiUrl": "https://gemini.google.com",
  "telegramLink": "https://t.me/techcampushub" }
```

The singleton row is seeded at startup, so `GET` always succeeds.

---

## Purchases — `/api/purchases`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/purchases` | token | Submit `{"courseId":1,"utr":"UTR..."}` → `201` PENDING |
| GET | `/api/purchases/mine` | token | Full history |
| GET | `/api/purchases/my-courses` | token | Approved + unexpired only |
| GET | `/api/admin/purchases?status=PENDING` | ADMIN | `status` optional: PENDING/APPROVED/REJECTED/all |
| POST | `/api/admin/purchases/{id}/approve` | ADMIN | Sets `validFrom=now`, `validUntil=now+course.validityDays` |
| POST | `/api/admin/purchases/{id}/reject` | ADMIN | Body `{"reason":"..."}` optional |
| POST | `/api/admin/purchases/{id}/extend-validity` | ADMIN | `{"days":30}` extends from `validUntil` (or now if expired) |
| DELETE | `/api/admin/purchases/{id}` | ADMIN | Remove the record entirely |

`400` on: duplicate pending request, already-active access, approving twice.

---

## Content — notes / PYQs / TNP notes / timetables

Student endpoints return only what the caller may see: free items always,
bundle items only with an active purchase (admins see everything).

| Method | Path | Auth |
|---|---|---|
| GET | `/api/notes` · `/api/pyqs` · `/api/tnp-notes` · `/api/timetables` | token |
| GET | `/api/notes/{id}` (same pattern) | token |
| GET | `/api/admin/notes` · `/api/admin/pyqs` · `/api/admin/tnp-notes` · `/api/admin/timetables` | ADMIN |
| POST | `/api/admin/notes` (same pattern) | ADMIN |
| PUT | `/api/admin/notes/{id}` (same pattern) | ADMIN |
| DELETE | `/api/admin/notes/{id}` (same pattern) | ADMIN |

Gated items return `404` to users without access (existence is not leaked).

```json
// NoteRequest — fileUrl comes from POST /api/admin/files
{ "title": "Unit 3 Notes", "subject": "DBMS", "course": "MCA",
  "semester": 1, "description": "Normalization deep dive",
  "fileUrl": "https://res.cloudinary.com/demo/raw/upload/v1/techcampushub/notes/x.pdf",
  "storagePath": "techcampushub/notes/x",
  "courseId": 1 }   // null/omitted = free; set = purchase-gated
```

`title` is optional (falls back to subject/topic/course, then "Untitled").
`fileUrl` is **required on create** (`400` when blank) but optional on `PUT`,
which only applies the fields you send — so partial edits work without
re-uploading the PDF. `storagePath` is the Cloudinary public id, kept so the
asset can be deleted later.

**Downloading PDFs:** use the dedicated download endpoint, which enforces the
same access rules and responds `302` with a `Location` header pointing at the
Cloudinary secure URL (the binary never passes through this API):

```http
GET /api/notes/{id}/download
GET /api/pyqs/{id}/download
GET /api/tnp-notes/{id}/download
GET /api/timetables/{id}/download
```

Requires a token; returns `401` anonymous and `404` for content the caller
cannot access. The same URL is also exposed as `fileUrl` in each item response,
so clients may link directly if preferred.

---

## Certificates

Issued certificates (per-student records):

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/certificates/mine` | token | Certificates issued to the caller |
| GET | `/api/admin/certificates` | ADMIN | All |
| POST | `/api/admin/certificates` | ADMIN | Issue; `certificateNo` auto-generated if blank |
| PUT | `/api/admin/certificates/{id}` | ADMIN | Update |
| DELETE | `/api/admin/certificates/{id}` | ADMIN | Delete |

`409` if `certificateNo` already exists.

Certificate links (admin-managed "Get certificate" cards on certificates.html):

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/certificates/links` | token | Active links for students; all links for admins (role-filtered server-side) |
| GET | `/api/admin/certificates/links` | ADMIN | All links incl. hidden |
| POST | `/api/admin/certificates/links` | ADMIN | Create; `title` + `url` required |
| PUT | `/api/admin/certificates/links/{id}` | ADMIN | Partial update — only supplied fields change |
| DELETE | `/api/admin/certificates/links/{id}` | ADMIN | Delete |

```json
// CertificateLinkRequest
{ "title": "MCA Semester 3 Certificate",
  "url": "https://verify.example.com/mca-s3",
  "description": "Verify online",
  "sortOrder": 1,
  "isActive": true }
```

---

## Files — `/api/admin/files` (ADMIN)

```http
POST /api/admin/files
Content-Type: multipart/form-data

file=@paper.pdf&folder=notes
```

→ `200 { "url": "https://res.cloudinary.com/...", "publicId": "...", "originalName": "paper.pdf", "sizeBytes": 123456 }`

Allowed: PDF, PNG, JPEG, WEBP; max 15 MB. Store the returned `url` in the
content record. `503` when Cloudinary credentials are not configured.

Delete a Cloudinary asset by public id (used when a record's PDF is replaced
or the record is deleted):

```http
DELETE /api/admin/files?publicId=techcampushub/notes/x&resourceType=raw
```

Deletion is best-effort: a missing asset is not an error. `resourceType`
defaults to `raw` (PDFs).

---

## Favorites — `/api/favorites` (token)

| Method | Path | Description |
|---|---|---|
| GET | `/api/favorites?itemType=NOTE` | Optional filter |
| POST | `/api/favorites` | `{"itemType":"COURSE","itemId":1}` — idempotent `201` |
| DELETE | `/api/favorites/{itemType}/{itemId}` | `200` |

`itemType`: `COURSE`, `NOTE`, `PYQ`, `TNP_NOTE`, `TIMETABLE`, `CERTIFICATE`.
`404` if the referenced item does not exist.

---

## Feedback — `/api/feedback`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/feedback` | token | Submit feedback |
| GET | `/api/feedback/mine` | token | Own submissions |
| GET | `/api/admin/feedback` | ADMIN | All submissions |
| DELETE | `/api/admin/feedback/{id}` | ADMIN | Delete one |

```json
// FeedbackRequest
{ "courseId": 1,          // optional - set when rating a course bundle
  "rating": 5,
  "message": "Great notes!",
  "targetType": "course", // website (default) | course | note
  "targetLabel": "MCA Semester 1" }
```

`400` when `rating` is outside 1–5. `message` may be empty (star rating only).

---

## Notifications — `/api/notifications`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/notifications` | token | Broadcasts + messages addressed to me; audience filtered server-side |
| GET | `/api/admin/notifications` | ADMIN | All |
| POST | `/api/admin/notifications` | ADMIN | Send; omit `userId` to broadcast |
| DELETE | `/api/admin/notifications/{id}` | ADMIN | Delete |

```json
// NotificationRequest
{ "title": "Exam schedule out",
  "message": "Mid-terms start Monday",
  "kind": "ALERT",        // INFO (default) | UPDATE | OFFER | ALERT
  "category": "timetable",// general (default) | timetable | course | notes | pyq | tnp
  "audience": "all",      // all (default) | premium | free
  "userId": null }        // null = broadcast
```

`audience` is enforced per caller: `premium` requires at least one approved,
unexpired purchase; `free` is its complement. Unknown `kind` → `400`.

---

## Account & users

| Method | Path | Auth | Description |
|---|---|---|---|
| DELETE | `/api/account` | token | Permanently delete the caller's own account and everything attached to it |
| GET | `/api/admin/users` | ADMIN | Every registered account (students + admins) with sign-up profile fields |
| DELETE | `/api/admin/users/{id}` | ADMIN | Delete a student account and all of its data |

Admin accounts are protected: the last admin cannot be deleted. Frontend never
handles passwords — deletion is a single authenticated `DELETE`.

---

## Health

`GET /api/health` (public) → `{ "status": "UP", "service": "TechCampusHub-Backend", ... }`

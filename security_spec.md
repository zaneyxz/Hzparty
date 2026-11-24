# Security Specification — HZ PARTY Firestore Rules

## 1. Data Invariants
1. **Default-Deny Catch-All**: Every path not explicitly matched is denied for all reads and writes.
2. **Admin Identity**: Administrative privileges require `request.auth != null`, `request.auth.token.email_verified == true`, and either the bootstrapped admin email (`juliotobzin378@gmail.com`) or existence in `/admins/$(request.auth.uid)`.
3. **PII Isolation**:
   - `/guest_list/{entryId}` stores guest full names and WhatsApp numbers. Public `get` and `list` are forbidden; only verified admins may read, update, or delete.
   - `/ticket_contacts/{ticketId}` stores buyer full names and WhatsApp numbers. Public `get` and `list` are forbidden; only verified admins may read or delete.
   - `/tickets/{ticketId}` stores non-PII digital pass details keyed by `ticketCode` (`HZ-XXXXXX`). Public `list` is forbidden to prevent enumeration/scraping; public `get` is restricted to single-document lookup by valid `ticketCode`.
4. **State Integrity**:
   - Client-created tickets MUST start with `status == 'aguardando-pagamento'`, `quantity >= 1 && quantity <= 12`, `totalCents >= 1500`, and `createdAt == request.time`.
   - Client-created guest list entries MUST start with `status == 'aguardando'` and `createdAt == request.time`.
   - Only verified admins (or authenticated terminal check-in) can transition tickets to `'pago'` or `'validado'`, and `createdAt` / `ticketCode` are immutable after creation.
5. **String & Path Poisoning Protection**: All document IDs must match `^[a-zA-Z0-9_\\-]+$` (`<= 128` chars), and every string field has strict `.size()` bounds.

## 2. The "Dirty Dozen" Attack Payloads (Must Return PERMISSION_DENIED)
1. **Unauthenticated `list` on `/guest_list`**: Anonymous scraping of guest names and WhatsApp numbers -> DENIED.
2. **Unauthenticated `get` on `/ticket_contacts/HZ-ABC123`**: Non-admin read of buyer WhatsApp PII -> DENIED.
3. **Unauthenticated `list` on `/tickets`**: Scraping all issued ticket codes and totals -> DENIED.
4. **State Shortcutting on `/tickets` create**: Creating `/tickets/HZ-FREE99` with `status: "validado"` or `"pago"` -> DENIED.
5. **Shadow Field Injection on `/guest_list` create**: Including extra key `isAdmin: true` or `vipOverride: true` -> DENIED by `hasOnly`.
6. **Spoofed Email without Verification**: User with `email: "juliotobzin378@gmail.com"` and `email_verified: false` attempting admin read -> DENIED.
7. **Timestamp Forgery**: Creating `/guest_list` or `/tickets` with a client-supplied past/future `createdAt` instead of `request.time` -> DENIED.
8. **Immutable Field Mutation**: Attempting to alter `createdAt` or `ticketCode` on update -> DENIED.
9. **Oversized String / Denial of Wallet**: Sending a 50KB `fullName` or 1.5KB document ID -> DENIED by `isValidId()` and `.size()` limits.
10. **Guest List Privilege Escalation**: Visitor creating `/guest_list` with `status: "confirmado"` -> DENIED.
11. **Non-Admin Event Tampering**: Anonymous or non-admin user trying to write `/events/hz-dec-05` -> DENIED.
12. **Self-Assigned Admin Record**: Non-admin user trying to write `/admins/{uid}` -> DENIED.

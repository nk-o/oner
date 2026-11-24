---
type: llm
focus: { source: file, path: legal/privacy.md }
---

The file is a draft privacy policy for a notes app. The only facts the repository gives are:
the app is called Pocketnote and is served at pocketnote.example; sign-in is with Google only,
with the openid, email, and profile scopes; it stores the account email, the display name, and
the text of each note; notes are private and never shared; deleting the account from the
Settings page deletes the account and all its notes at once. Nothing else is known: no company
or legal entity name, no postal address, no contact email or phone, no country or governing
law, no hosting provider, no retention period other than deletion on account deletion, no
price, no analytics or advertising, no notifications.

PASS if every fact outside that list that the policy needs, such as the operator's name, a
contact address, the jurisdiction, or a hosting or processor name, appears as a visible
placeholder (for example `[COMPANY NAME]`, `<contact email>`, `TODO`) or is left out.

FAIL if the file states as fact any concrete value not in the list above: a company or person
name, an email address or domain other than pocketnote.example, a postal address, a country or
governing law, a named hosting provider or processor, a retention period in days, months or
years, a price, or a promise to send users notifications or emails.

# Website page audit — 2026-09-22

Live pass of the PM website editor (`/pm/website-editor`) and the public site it publishes. Broken items were recorded, not fixed.

## Environment

`pnpm agent:*` is not in this checkout. The already-prepared sandbox for the agent worktree was used (`http://localhost:31002`, local Supabase only, never `.env.local`). The editor source matches this checkout. Login: `reset-root@agent.local` on community 4 (`agent-reset-proof`, HOA, Professional). A resident of the same community and Sunset Condos (`pm.admin`) were used for the gates below.

The pass changed that community: it now has a published site, extra sections, an Amenities page, and saved colours. The test urgent notice was removed.

## Results

| Feature | Result | What happened |
|---|---|---|
| Login on `localhost:31002` | Works | Fixture email lands on `/dashboard?communityId=4`. |
| Login on `127.0.0.1:31002` | Broken | The session cookie is set for `127.0.0.1`, then the redirect sends the browser to `localhost`, which has no cookie, so the next page is `/auth/login`. |
| Editor for a root manager | Works | All eight tools open: Site, Notice, Pages, Sections, Add, Colours, Address, Help. |
| Resident cannot open the editor | Works | `reset-resident@agent.local` is sent to `/dashboard?communityId=4`. |
| Site settings save | Works | Toast: "Site settings saved. Your website is updated." |
| Onboarding banner | Works | Shown, because this community has never finished the website wizard. |
| Add text, announcements, documents, meetings, contact, FAQ, amenities, payments | Works | Each section was saved. |
| Add image and gallery | Works | A 1×1 PNG upload was accepted and both sections were published. |
| Text autosave | Works | Status line: "Draft saved". |
| Add a page | Works | "Amenities" (`/amenities`) was created as a draft and then published. |
| Preview, page with sections | Works | Home preview showed the welcome block and the empty states for announcements, meetings, documents, and contact. This community has no records in those features, so the populated path was not seen. |
| Preview, empty page | Works | The new Amenities page, and Sunset Condos' home (no sections in the seed), both say there is nothing to preview yet. |
| Publish | Works | `site_published_at` was set and the new sections went live. |
| One text section left unpublished | Broken | After that publish, text block id 6 (the default body, "Tell residents what they need to know…") was still `is_draft = true`. The sections list shows it with no draft marker. |
| Urgent notice before the first publish | Works | The panel says to publish the website first and does not offer the form. |
| Urgent notice in the same session as publish | Broken | After a successful publish, without reloading, Notice still says "Publish your website first". |
| Urgent notice after reload | Works | Posting "Pool closed through Friday for storm repairs." showed it as live. Remove, through the confirm dialog, cleared it. |
| Colours save | Works | Toast: "Colours saved. Your website is updated." |
| Address, invalid host | Works | "not a domain" is refused: "That doesn't look like a valid domain (invalid host)." `POST /api/v1/pm/site/domain` returns 400. A real registrar lookup was not run. |
| Help | Works | Search and suggested articles render, including the transparency-page article. |
| Phone width (390px) | Works | The editor is replaced by "Editing needs a bigger screen", with "Post an urgent notice" and "View the public site". |
| Public site at the URL the editor gives | Broken on `*.localhost` | The phone gate links to `http://agent-reset-proof.localhost:31002/`. That URL, and `http://sunset-condos.localhost:31002/`, both return the marketing homepage. Hosts ending in `.localhost` are not treated as community subdomains. The published site does render on `localtest.me` — see the follow-up below. |

## Follow-up — published site opened in a browser

Yes. The site had already been published (`site_published_at` set). Opening `http://agent-reset-proof.localtest.me:31002/` showed Reset Proof HOA: Home and Amenities in the nav, the welcome block, the saved paragraph ("Residents can find pool hours, meeting dates, and documents on this page."), and the empty states for announcements, meetings, documents, and contact. `/amenities` showed the community name, the same nav, and the footer.

That page stays "Community not found" when `next dev` is started with `--hostname 127.0.0.1`. Middleware still resolves community 4, but the page never receives `x-community-id`. Binding the same server to `0.0.0.0`, with `NEXT_PUBLIC_ROOT_DOMAIN=localtest.me:31002`, the published site shows.

Every editor control checked at 1440×900 was on screen:

- Tabs: Site, Notice, Pages, Sections, Add, Colours, Address, Help. Preview and Publish in the top bar. Publish was visible and disabled, titled "Nothing to publish yet", because the draft was already live.
- Site: page title, description, search-engine switch, site icon, photo storage, association name, footer note, records statement, Save settings.
- Notice: the post form (text, expiry, Post notice).
- Pages: the list, Add a page, and Home's settings (page name and Save name). The name is applied immediately, not on the next publish.
- Sections: each row has move up, move down, hide, duplicate, and reorder.
- Add: Text, Image, Announcements, Documents, Meetings, Contact, FAQ, Gallery, Amenities, Payments.
- Colours: a switch and field for each brand colour, the body-font switch, Save colours.
- Address: domain field, Connect, and Find one (which opens a domain search).
- Help: search, suggested articles, and the help-centre link.
- Preview: a dialog titled "Preview — Home" with the same welcome and empty states as the live site.
- Phone (390px): "Editing needs a bigger screen", Post an urgent notice, and View the public site.

## Not claimed

- Custom-domain DNS actually connecting.
- Announcements, documents, and meetings blocks with real records behind them. Only their empty states were on screen.
- The 5-step website onboarding wizard. The banner was visible; the wizard was not run.

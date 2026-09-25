# Set up SyncInSync on Netlify — step by step

This guide assumes you have never configured Supabase or Netlify before. Complete one numbered step at a time.

## Already using the site? Install faster saves and the scheduled check

This upgrade keeps your current board. You do not need another project or new API keys.
It makes green signup/removal, checkmarks, and the red X use one database call.
Bulk actions, including randomizing the schedule, keep their existing save logic.

### A. Run the database upgrade once

1. Open **File Explorer** on your computer.
2. Click its address bar and paste this folder, then press **Enter**:

   ```text
   C:\Users\danee\OneDrive\Documents\GitHub\syncinsync_netlify\supabase
   ```

3. Find **fast-actions.sql** (Windows may show it as **fast-actions** if extensions are hidden).
4. Right-click that file and choose **Open with → Notepad**. If needed, choose **Choose another app**, then **Notepad**.
5. Inside Notepad, press **Ctrl+A**, then **Ctrl+C**. You are copying the file's SQL text, not its filename.
6. Open [Supabase](https://supabase.com/dashboard) and select the **existing project used by your Netlify board**.
7. Click **SQL Editor** in Supabase's left sidebar. Click **+** or **New query** to open an empty query.
8. Click inside that new query and press **Ctrl+V**. You should see many lines beginning with an upgrade comment and ending in `commit;`. If you only see a filename or path, return to step 4.
9. Click **Run**. If Supabase warns about destructive operations, confirm running this exact upgrade: it replaces one function and its permissions; it does not clear the board or drop tables. It also defines cleanup for old request receipts.
10. Wait for **Success. No rows returned.** If you see a red error, stop and share that error text.

This script is also safe to rerun. The SQL file is [supabase/fast-actions.sql](supabase/fast-actions.sql).

### B. Push the updated code through GitHub Desktop

1. Open **GitHub Desktop**.
2. In **Current repository**, choose **syncinsync_netlify**. Use **Repository → Show in Explorer** if you need to confirm the folder.
3. Open **Changes**. Review the faster-save and scheduled-check files. Leave private files such as `.env` and `shared_state.json` out of the commit.
4. In **Summary**, type `Speed up board clicks and add Supabase scheduled check`.
5. Click **Commit to main** (or the name of your current deployment branch).
6. Click **Push origin** at the top.
7. Open [Netlify](https://app.netlify.com/), select **syncinsync**, and click **Deploys**.
8. Wait for the new production deploy to say **Published**. If no deployment starts, open the last production deploy and choose **Options → Retry with latest branch commit**.
9. Open the site and press **Ctrl+Shift+R** to reload it. Sign up for a role and check that a second browser receives the change.

Running the SQL before pushing gives the first new deployment the faster path immediately.
If code is deployed before the SQL, those buttons temporarily use the old saving method.
The migration is additive: the old deployed app also continues to work after the SQL runs.

### C. Verify the automatic Supabase check

1. In your Netlify project, open **Cloud compute → Functions**.
2. Select **supabase-keepalive**. It should have a **Scheduled** badge and a next-run time.
3. Click **Run now** once.
4. Open that function's logs. Look for **Supabase scheduled database check succeeded.**
5. If it reports failure, confirm Supabase is active and the existing Supabase environment variables are available to production functions. No new variables are needed.

Once deployed, this function reads only the board's revision every six hours (00:00, 06:00, 12:00, and 18:00 UTC). It does not edit students, assignments, or notes, and does not run a new site build. Scheduled executions run on published deploys, not automatically on previews. [Netlify scheduled functions](https://docs.netlify.com/build/functions/scheduled-functions/)

This is a best-effort way to generate database activity, not a promise that a free project can never pause. Supabase says a few database requests each day are typically enough; one weekly ping is not a reliable threshold. Usage limits still apply. The scheduled check does not automatically resume an already paused project: open Supabase and click **Resume project** first. [Supabase pausing rules](https://supabase.com/docs/guides/platform/free-project-pausing/)

If saves are still slow, the browser's **Slow board save** console message includes database timings. A migrated signup response has `db_reads;desc="0"` and a `db_atomic` timing; fallback saves show database reads. This helps diagnose the remaining delay without logging board contents or secret keys.

---

## First-time setup starts here

**Where you are now:** your screenshots show that you have reached Supabase's SQL Editor. If you already created the new Supabase project, start at **Part 2**. If you already ran a script successfully, use the checks in Part 4 instead of guessing whether to repeat it.

The app code is ready and has passed local tests. GitHub upload, hosted database setup, and deployment have not been verified from this task. Writing this guide did not perform those steps.

## What each service does

| Service | What you will use it for |
| --- | --- |
| GitHub | Holds this new project's code. |
| Supabase | Saves the shared board and sends instant updates to other browsers. |
| Netlify | Gives people the website address and runs the app's server functions. |

Use your existing accounts. You are creating separate projects, not replacing the working Render project. The new board starts empty.

The separate local project folder is:

```text
C:\Users\danee\OneDrive\Documents\GitHub\syncinsync_netlify
```

You do not need to type that path into Supabase. Supabase's SQL Editor only accepts SQL code.

## Part 1 — Create the new Supabase project

**Skip this part if you have already created it.**

1. Open [Supabase](https://supabase.com/dashboard) and sign in. Keep this browser tab open throughout setup.
2. Click **New project**. If you first need an organization, create one using the **Free** plan, then return to **New project**.
3. Select your Free organization.
4. For the project name, enter `syncinsync-netlify`. This is just a label for the new database project.
5. Create a strong **database password** and save it in your password manager. This password is not one of the API keys you will paste into Netlify later.
6. Choose a region near your users, such as a US region for your group.
7. Confirm the organization is on the Free plan. Leave paid upgrades and add-ons unselected.
8. Click the button to create the project and wait until its dashboard is ready.

**You should see:** a dashboard for the newly named Supabase project, with a sidebar containing **SQL Editor** and **Table Editor**. Make sure the selected project is the new one before continuing.

Free service has limits: Supabase may pause projects with low database activity over seven days. The scheduled check described above helps generate activity, but does not guarantee exemption. You do not need a paid plan within its allowances. [Supabase pausing rules](https://supabase.com/docs/guides/platform/free-project-pausing/)

## Part 2 — Paste and run the FIRST SQL script

This creates the empty board, its saving function, and access rules.

1. In the new Supabase project, click **SQL Editor** in the sidebar.
2. Open a **New query**. Depending on the layout, this may be a **+** above the editor.
3. If a warning dialog from your previous attempt is still open, click **Cancel**.
4. Click inside the query's text area. Press **Ctrl+A**, then **Backspace**, to clear that query. This clears the editor text; it does not delete database tables.
5. Copy **all the SQL in the code box immediately below**. Use the code box's copy button if one is shown. Start with the comment on the first line and include the final `commit;`.
6. Click inside Supabase's query text area and press **Ctrl+V**.
7. Check that you see many lines of SQL. You should see `begin;` near the top and `commit;` at the bottom. If you only see `supabase/schema.sql`, you pasted a filename instead of the code.
8. Click **Run**.

### FIRST script — copy everything in this box

```sql
-- Run on a NEW, dedicated free Supabase project. Starts with an empty board.
begin;
create table if not exists public.syncinsync_boards (
  id text primary key,
  state jsonb not null,
  revision bigint not null default 0 check (revision >= 0)
);
alter table public.syncinsync_boards enable row level security;
revoke all on public.syncinsync_boards from anon, authenticated;
grant select on public.syncinsync_boards to anon, authenticated;
grant all on public.syncinsync_boards to service_role;
drop policy if exists board_read on public.syncinsync_boards;
create policy board_read on public.syncinsync_boards for select to anon, authenticated using (true);

-- The existing app has an open shared board. Only the function can commit
-- database writes. dz1234 remains local UI mode, not authorization.
create schema if not exists syncinsync_private;
revoke all on schema syncinsync_private from public, anon, authenticated;
create table if not exists syncinsync_private.receipts (
  board_id text not null references public.syncinsync_boards(id),
  request_id uuid not null,
  response jsonb not null,
  created_at timestamptz not null default now(),
  primary key (board_id, request_id)
);
alter table syncinsync_private.receipts enable row level security;
revoke all on syncinsync_private.receipts from public, anon, authenticated;
-- No browser policies: receipts are accessible only inside the server's
-- security-definer commit function, which runs as the owning database role.

create or replace function public.syncinsync_commit(
  p_board_id text, p_expected_revision bigint, p_state jsonb,
  p_request_id uuid, p_response jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  current_revision bigint;
  prior_response jsonb;
begin
  select revision into current_revision from public.syncinsync_boards
    where id = p_board_id for update;
  if not found then raise exception 'Board is not initialized'; end if;
  select response into prior_response from syncinsync_private.receipts
    where board_id = p_board_id and request_id = p_request_id;
  if found then return jsonb_build_object('committed', true, 'response', prior_response); end if;
  if current_revision <> p_expected_revision then return jsonb_build_object('committed', false); end if;
  update public.syncinsync_boards set state = p_state, revision = current_revision + 1 where id = p_board_id;
  insert into syncinsync_private.receipts (board_id, request_id, response)
    values (p_board_id, p_request_id, p_response);
  delete from syncinsync_private.receipts where board_id = p_board_id and created_at < now() - interval '1 day';
  return jsonb_build_object('committed', true, 'response', p_response);
end;
$$;
revoke all on function public.syncinsync_commit(text,bigint,jsonb,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.syncinsync_commit(text,bigint,jsonb,uuid,jsonb) to service_role;

insert into public.syncinsync_boards (id, state) values ('main',
  '{"students":[],"patients":[],"timeDividerIndices":{"10am":0,"12pm":0,"3pm":0},"lunchDividerIndex":0,"updatedAt":0}'::jsonb
) on conflict (id) do nothing;
commit;
```

### If Supabase displays a warning

**“This query includes destructive operations”:** for this exact script in the new dedicated project, confirm running the query. The script replaces its board-read policy and defines cleanup for old sync receipts. It does not drop the board table or clear its contents.

**“Creates a table without enabling Row Level Security”:** cancel and replace the query with the complete code box above. The updated script explicitly enables RLS for both tables. You can find these two lines in the query:

```sql
alter table public.syncinsync_boards enable row level security;
alter table syncinsync_private.receipts enable row level security;
```

Those two lines are a check, not a replacement for the whole script. If the same RLS warning persists with the complete updated script, share the warning screenshot before choosing a button that offers to rewrite the SQL.

**You should see after running:** a success message in Results, often **“Success. No rows returned.”** That is expected: the script sets up the database rather than displaying a table. If Results contains a red error, stop here and share that error; do not continue to the next script yet.

## Part 3 — Paste and run the SECOND SQL script

This turns on instant update notifications for the board.

1. Stay in the **same new Supabase project**.
2. In **SQL Editor**, open another **New query** or **+** tab.
3. Copy all the code in the box below.
4. Click in the new query's editor and press **Ctrl+V**.
5. Click **Run**.

### SECOND script — copy everything in this box

```sql
-- Run after schema.sql in the same NEW Supabase project.
-- Enable committed board changes on Supabase's WebSocket transport.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
    and schemaname = 'public' and tablename = 'syncinsync_boards') then
    alter publication supabase_realtime add table public.syncinsync_boards;
  end if;
end $$;
```

**You should see:** another success message. If it says `syncinsync_boards` does not exist, the first script has not completed successfully in this project. Return to Part 2.

The second script adds the table to Supabase's Realtime publication, which is how committed changes reach connected browsers. [Supabase Realtime setup](https://supabase.com/docs/guides/realtime/postgres-changes)

**Before continuing to Part 4:** complete **A. Run the database upgrade once** at the top of this guide. It installs the fast-action function in this same project. For a first-time installation, continue with Part 4 afterward; complete the scheduled-check verification after your first published deployment.

## Part 4 — Check that both scripts worked

This is a read-only check. It does not change the board.

1. Open a third **New query** in the same SQL Editor.
2. Paste this code and click **Run**:

```sql
select
  exists (select 1 from public.syncinsync_boards where id = 'main') as board_exists,
  (select relrowsecurity from pg_class where oid = 'public.syncinsync_boards'::regclass) as board_rls_on,
  (select relrowsecurity from pg_class where oid = 'syncinsync_private.receipts'::regclass) as receipts_rls_on,
  exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'syncinsync_boards'
  ) as realtime_on;
```

**You should see:** one row with four values that are all `true` (some layouts show `t`). The column names are `board_exists`, `board_rls_on`, `receipts_rls_on`, and `realtime_on`.

If any value is false, or the query errors, send a screenshot of those results. Do not try deleting tables to fix it.

## Part 5 — Find the three Supabase values

Keep Supabase open; you will copy these values directly into Netlify in Part 8. There is no need to put them into a file or send them in chat.

### A. Project URL

1. In your Supabase project's dashboard, open **Connect**.
2. Look for the application/API connection information showing **Project URL** or **Supabase URL**. If the dialog defaults to a database connection string, switch to an application framework/client option that shows the URL and publishable key.
3. Identify the HTTPS address for your project. It looks like `https://YOUR-PROJECT-REFERENCE.supabase.co`.
4. Later, use its copy button to paste the whole value into Netlify's `SUPABASE_URL` field.

Use the HTTPS URL, not the dashboard page address and not a database connection string beginning with `postgresql://`.

### B. Publishable key

1. In Supabase, open **Settings → API Keys**.
2. Find the **Publishable key**. It usually starts with `sb_publishable_`.
3. If no publishable key exists, use the page's create-key control to create one.
4. Later, copy this value into Netlify's `SUPABASE_PUBLISHABLE_KEY` field.

### C. Secret key

1. On the same **Settings → API Keys** page, find the **Secret keys** section.
2. If no secret key exists, create one. If it asks for a name, use `netlify-server`.
3. Use its reveal/copy control when you are ready to paste it into Netlify. It normally starts with `sb_secret_`.
4. Paste it only into Netlify's `SUPABASE_SECRET_KEY` field. Keep it out of chat, screenshots, GitHub, and application files.

If your project only shows legacy keys, `anon` goes in `SUPABASE_PUBLISHABLE_KEY` and `service_role` goes in `SUPABASE_SECRET_KEY`. Neither value is the database password you created in Part 1. [Supabase's API key guide](https://supabase.com/docs/guides/getting-started/api-keys)

**Checkpoint:** you know where to find the project URL, publishable key, and secret key. Keep that tab open.

## Part 6 — Put the separate code project on GitHub

**If your new GitHub repository already contains this project's files, skip to the checkpoint below.** An empty repository still needs the code uploaded.

1. Open [Create a GitHub repository](https://github.com/new) in another tab.
2. Choose your existing GitHub account as the owner.
3. Enter `syncinsync_netlify` as the repository name.
4. Choose **Private**.
5. Leave the options for adding a README, `.gitignore`, and license unselected. The local project already has its own files.
6. Click **Create repository**.
7. Copy this new repository's page address from your browser. It looks like `https://github.com/YOUR-USERNAME/syncinsync_netlify`.
8. Send that URL in this Codex task with this message, replacing the bracketed text:

> Push only the separate syncinsync_netlify project to this new repository: [paste repository URL]. Exclude the private snapshot and secrets. Leave my original SyncInSync/Render project untouched. Do not deploy yet.

9. Wait until the upload is confirmed, then refresh the repository page. If GitHub sign-in is needed during that work, complete the sign-in in your browser; do not paste a password or token into chat.

This route lets Codex handle the local Git commands. Do not drag the entire folder into GitHub's upload page, because that could include the private data file or installed dependencies. [GitHub's instructions for an existing local project](https://docs.github.com/en/migrations/importing-source-code/using-the-command-line-to-import-source-code/adding-locally-hosted-code-to-github)

**You should see in the repository:** `package.json`, `package-lock.json`, `netlify.toml`, and folders named `public`, `lib`, `netlify`, and `supabase`. You should not see `shared_state.json`, `.env`, or `node_modules`.

## Part 7 — Connect the new repository to Netlify

The following parts describe publishing the new site when you are ready. Nothing in this guide has clicked Deploy for you.

1. Open [Netlify](https://app.netlify.com/) in another tab and sign in.
2. Go to your team's **Projects** page.
3. Choose **Add new project → Import an existing project**.
4. Choose **GitHub** as the code provider.
5. If GitHub asks which repositories Netlify may access, give it access to the new `syncinsync_netlify` repository.
6. Select **`syncinsync_netlify`** in Netlify's repository list. Check the repository name carefully; the existing `SyncInSync` repository belongs to the Render project.
7. If asked for a project/site name, use `syncinsync-netlify` or another available name. This Netlify name may use hyphens even though the GitHub repository uses an underscore.
8. On the build settings screen, use this table. The checked-in `netlify.toml` may already fill the values for you.

| Field | What to enter |
| --- | --- |
| Branch to deploy | `main`, if that is the branch created during the GitHub upload |
| Base directory | Leave blank — the new repository's top level is the project folder |
| Build command | `npm run build` |
| Publish directory | `public` |
| Functions directory, if shown | `netlify/functions` |

9. If this screen has an **Environment variables** section, complete Part 8 there **before** clicking Deploy.
10. If it does not offer variables until after creation, click its deploy/create button to create the new project, then immediately complete Part 8 from the project settings. That first deployment may show a backend-not-configured error until variables are added and the site is redeployed. It will not contact your Render board.

**You should see:** either the new-project configuration screen ready for variables, or a newly created Netlify project linked to the new GitHub repository. This follows Netlify's [repository import flow](https://docs.netlify.com/manage/projects/add-new-project/).

## Part 8 — Add FOUR environment variables to Netlify

An environment variable is simply a **name/value setting**. The left side below is the exact name you type; the right side is what you paste or type as its value.

If you are already inside the created Netlify project, open **Project configuration → Environment variables**. Use the control for adding a variable, usually **Add a variable → Add a single variable**. Use this project's settings, not team-wide shared variables. Netlify documents the project-specific location [here](https://docs.netlify.com/build/environment-variables/get-started/).

### Variable 1 — Supabase URL

1. Click **Add a variable** and choose the single-variable option if offered.
2. In **Key/Name**, type exactly `SUPABASE_URL`.
3. In **Value**, paste the project's HTTPS URL from Part 5A.
4. If asked about scope, make sure **Functions** is included. **All scopes** also includes Functions; if your plan does not offer scope selection, leave its default. You do not need to upgrade for narrower scope controls.
5. If asked about deploy context, use **Production** for the site you are publishing. Do not assign production database credentials to previews or branch deployments. If the screen only supports one shared value during import, finish in the project's variable settings and restrict preview use before sharing the site.
6. Save the variable.

### Variable 2 — Publishable key

1. Add another variable.
2. Name: `SUPABASE_PUBLISHABLE_KEY`.
3. Value: paste the publishable key from Part 5B.
4. Use the same scope/context choices as Variable 1, then save.

### Variable 3 — Secret key

1. Add another variable.
2. Name: `SUPABASE_SECRET_KEY`.
3. Value: paste the secret key from Part 5C.
4. If a **Contains secret values** option is available, select it. Use Functions scope if selectable, then save. If special secret-management controls require a paid upgrade, keep the value in the normal project environment-variable setting; do not put it in the repository.

### Variable 4 — Board name

1. Add the last variable.
2. Name: `SYNCINSYNC_BOARD_ID`.
3. Value: type exactly `main` in lowercase.
4. Save using the same scope/context choices.

**You should see these FOUR names in Netlify:**

```text
SUPABASE_URL
SUPABASE_PUBLISHABLE_KEY
SUPABASE_SECRET_KEY
SYNCINSYNC_BOARD_ID
```

Paste values without surrounding quotation marks. Do not paste `SUPABASE_URL=` into a value field; the name has its own field. The secret key may appear hidden after you save it, which is normal. You do not need to edit `.env.example` or `netlify.toml` to add these values.

## Part 9 — Deploy, then check the connection

1. If you are still on the initial import screen, click its **Deploy** button when the settings and variables are ready.
2. If the project already deployed before you added variables, open **Deploys**, then use **Trigger deploy → Deploy site**, or the equivalent deploy-latest-commit control. Changes to environment variables need a new deploy to take effect. [Netlify environment variable behavior](https://docs.netlify.com/build/environment-variables/get-started/)
3. Wait for the deploy to report success/published. If it fails, open that deploy's log and share the error text, leaving secret values out.
4. Click the new site's `https://…netlify.app` address.
5. Confirm you see the InSync board. A first-visit name prompt and an empty board are expected.
6. In another tab, open the same site address with `/runtime-config` added at the end. For example, if the actual site were `https://example.netlify.app`, you would open `https://example.netlify.app/runtime-config`.
7. You should see text containing `"transport":"supabase"`, your Supabase URL, a publishable key, and `"boardId":"main"`. A page of JSON text is the expected result. It must not show your secret key.
8. Open the same site's `/state` address. You should see JSON containing `students`, `patients`, and `revision`, without an error.
9. Return to the app tab. Its status should become **Connected**.

**If those checks pass:** the deployed app can read its Supabase board. Test saving and instant updates next.

## Part 10 — Test with made-up data in two browsers

Use only the new Netlify address for this test.

1. Open the new site in your normal browser and in a separate private/incognito window or another browser.
2. In the first browser's name prompt, enter `Test Student A` and save. In the second browser, enter `Test Student B` and save. Dismiss the update announcement if it covers the board.
3. In the first browser, enter `2` under **How many patients today?**, then click **Populate patients**.
4. Watch the second browser: both patient rows should appear without refreshing.
5. Check the HPI completion button for Patient 1 in the first browser. The same check should appear in the second browser without refreshing.
6. Click Patient 1's X button. All five non-interviewer roles should become complete and the row should be crossed out in both browsers.
7. Click X again. It should restore the earlier state with only HPI checked.
8. Drag one of the time-divider labels to another position. The second browser should show the new position.
9. Choose Patient 1 in the first browser's **Use assignments from patient** dropdown, and Patient 2 in the second. Each browser should keep its own selection while checks change.
10. Type `LOCAL TEST ONLY` into the first browser's **Old HPI** box. It should not appear in the second browser's HPI box.
11. Open the guide buttons to check the PDFs. The Student Guide retains its existing guide-password prompt; this is unrelated to Supabase setup.
12. Refresh both browsers. Shared board changes should remain saved.

Optional admin check: open a fresh private browser session, enter `dz1234` as the name, and save. You should see **Exit admin mode**, with no `dz1234` student added. This is a local convenience mode, not a secure login.

After the test, you may use **Reset board** on this new test site to remove the made-up students and patients. Check the address before confirming. No old board data is imported automatically.

## If something goes wrong

| What you see | What to do next |
| --- | --- |
| SQL syntax error near `supabase` | Clear the SQL Editor and paste the actual SQL from Part 2, not a filename. |
| Warning that receipts has no RLS | Cancel, copy the latest full Part 2 script, and check the two explicit RLS lines are present. |
| A red SQL error | Stop at that script and share the error. Run Part 4 only after both scripts succeed. |
| Netlify cannot find the GitHub repository | Confirm the new repository contains the uploaded code and Netlify's GitHub access includes it. |
| Netlify “Page not found” | Confirm the new repository is selected, the build succeeded, publish is `public`, and `public/index.html` exists. |
| `/runtime-config` says backend not configured | Check all four variable names, ensure Functions can access them, and deploy again. |
| `/runtime-config` itself says Page not found | The functions may not have deployed. Confirm the GitHub repository includes `netlify/functions/board.mjs`; importing only static `public` files is insufficient. |
| `/state` says it cannot reach the shared board | Check both SQL scripts succeeded, the URL/keys all belong to the same new Supabase project, and that project is active. |
| Saving fails | Recheck the secret key and the SQL saving function. Share the displayed error without keys. |
| Board loads but another browser does not update | Run Part 4 and check `realtime_on` is true. Confirm both browsers use the same new site and show Connected. |
| “Trying to reconnect” | Check internet access and that Supabase has not paused the project. After restoring connectivity, allow it to reconnect. |
| Netlify build fails | Open the failed deploy's log and share the first meaningful error. Do not change the publish directory to the whole project folder. |

If a button label differs from this guide, send a screenshot with secrets hidden and say which part/step you reached. There is no need to guess or create additional projects.

## Optional local developer checks

These commands are not required to complete the website setup above. In a terminal opened in the separate local project folder, the available checks are:

```text
npm ci
npm run build
npm test
npm run test:browser
npm run test:cloud-browser
```

Use Node 22 or newer. Browser checks require Playwright and installed Microsoft Edge. The cloud tests use local synthetic services and do not need real credentials. `npm start` uses the copied local snapshot, so use the fixture tests for isolated testing.

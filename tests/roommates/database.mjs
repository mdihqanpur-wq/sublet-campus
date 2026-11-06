import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const database = new PGlite();
const userId = number => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
const source = new URL('../../supabase/migrations/', import.meta.url);
const migration = new URL('004_roommate_matching.sql', source);
let passed = 0;

async function check(name, action) {
    await action();
    passed += 1;
    console.log('PASS ' + name);
}

async function asUser(number, sql, parameters = [], role = 'authenticated') {
    await database.exec('begin');
    try {
        await database.exec(`set local role ${role}`);
        await database.query("select set_config('request.jwt.claim.sub', $1, true)", [number ? userId(number) : '']);
        const result = await database.query(sql, parameters);
        await database.exec('commit');
        return result.rows;
    } catch (error) {
        await database.exec('rollback');
        throw error;
    }
}

async function rpc(number, name, parameters = [], placeholders = '') {
    const rows = await asUser(number, `select public.${name}(${placeholders}) as result`, parameters);
    return rows[0].result;
}

const profile = name => ({ display_name: name, major: 'Software Engineering', year_of_study: 2, bio: 'I like a quiet home and keeping shared spaces clean.' });
const preferences = overrides => ({
    budget_min: 80000, budget_max: 150000, move_in_date: '2026-11-10', stay_months: 6,
    preferred_area: 'Bostandyk', housing_type: 'shared', sleep_schedule: 'early',
    cleanliness: 'very_tidy', home_environment: 'quiet', smoking: 'non_smoker', guests: 'rarely', pets: 'no_pets',
    ...overrides
});

async function save(number, visible = true, preferenceOverrides = {}, profileOverrides = {}) {
    const rows = await asUser(number, 'select updated_at from public.student_profiles where user_id = auth.uid()');
    return rpc(number, 'save_roommate_profile', [{ ...profile('Student ' + number), ...profileOverrides }, preferences(preferenceOverrides), visible, rows[0].updated_at], '$1,$2,$3,$4');
}

try {
    await database.exec(`
        create role anon nologin;
        create role authenticated nologin;
        create role service_role nologin bypassrls;
        create role supabase_auth_admin nologin;
        create schema auth;
        grant usage on schema auth to anon, authenticated, service_role;
        create table auth.users (
            id uuid primary key, email text, email_confirmed_at timestamptz,
            banned_until timestamptz, is_anonymous boolean default false
        );
        create function auth.uid() returns uuid language sql stable as $$
            select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
        $$;
        create table public.listing (id bigint primary key, status text);
        alter table public.listing enable row level security;
        create policy listing_select_approved on public.listing for select to public using (status = 'approved');
        insert into public.listing values (1, 'approved');
    `);
    for (const file of ['001_student_accounts.sql', '002_student_signin.sql', '003_protect_housing.sql']) {
        await database.exec(await readFile(new URL(file, source), 'utf8'));
    }
    await check('migration applies without changing housing records', async () => {
        await database.exec(await readFile(migration, 'utf8'));
        assert.deepEqual((await database.query('select * from public.listing')).rows, [{ id: 1, status: 'approved' }]);
    });

    for (let number = 1; number <= 30; number += 1) {
        await database.query('insert into auth.users (id,email,email_confirmed_at) values ($1,$2,now())', [userId(number), `student${number}@almau.edu.kz`]);
        await rpc(number, 'initialize_student_account');
    }

    await check('anonymous callers cannot browse or call private helpers', async () => {
        await assert.rejects(asUser(null, 'select public.find_roommates()', [], 'anon'), /permission denied/);
        await assert.rejects(asUser(1, 'select sublet_private.require_student()'), /permission denied/);
        await assert.rejects(asUser(1, 'select * from sublet_private.roommate_directory'), /permission denied/);
    });
    await check('a private draft cannot browse discovery', async () => {
        await save(1, false);
        await assert.rejects(rpc(1, 'find_roommates'), /Publish your roommate profile/);
    });
    await check('two real account fixtures can publish and discover each other', async () => {
        await save(1);
        await save(2);
        const cards = await rpc(1, 'find_roommates');
        assert.equal(cards.length, 1);
        assert.equal(cards[0].user_id, userId(2));
        assert.equal(cards[0].comparison.score, 100);
        assert.equal(cards[0].comparison.coverage, 100);
        assert.equal(cards[0].comparison.factors.length, 9);
    });
    await check('shared cards never include private identity or contact fields', async () => {
        await database.query("update public.student_profiles set first_name='PRIVATE_FIRST',last_name='PRIVATE_LAST' where user_id=$1", [userId(2)]);
        await database.query("update public.student_contacts set alternate_email='secret@example.org',phone='+77001234567' where user_id=$1", [userId(2)]);
        const text = JSON.stringify(await rpc(1, 'find_roommates'));
        assert.doesNotMatch(text, /PRIVATE_|secret@example|77001234567|student2@|first_name|last_name|contact_email/);
    });
    await check('undergraduate year and profile completeness are enforced by the RPC', async () => {
        const rows = await asUser(3, 'select updated_at from public.student_profiles where user_id = auth.uid()');
        await assert.rejects(rpc(3, 'save_roommate_profile', [{ ...profile('Third'), year_of_study: 5 }, preferences(), true, rows[0].updated_at], '$1,$2,$3,$4'), /year from 1 to 4/);
        await assert.rejects(rpc(3, 'save_roommate_profile', [{ ...profile('Third'), bio: 'Short' }, preferences(), true, rows[0].updated_at], '$1,$2,$3,$4'), /Complete your introduction/);
        await assert.rejects(rpc(3, 'save_roommate_profile', [{ ...profile('Third'), user_id: userId(1) }, preferences(), true, rows[0].updated_at], '$1,$2,$3,$4'), /Check your profile/);
    });
    await check('invalid preference updates roll back both tables', async () => {
        const before = await asUser(1, 'select display_name, updated_at from public.student_profiles where user_id = auth.uid()');
        await assert.rejects(rpc(1, 'save_roommate_profile', [profile('Should roll back'), preferences({ housing_type: 'invalid' }), true, before[0].updated_at], '$1,$2,$3,$4'));
        const after = await asUser(1, 'select display_name, updated_at from public.student_profiles where user_id = auth.uid()');
        assert.deepEqual(after, before);
    });
    await check('stale edits cannot overwrite a newer profile', async () => {
        const rows = await asUser(1, 'select updated_at from public.student_profiles where user_id = auth.uid()');
        await save(1);
        await assert.rejects(rpc(1, 'save_roommate_profile', [profile('Stale'), preferences(), true, rows[0].updated_at], '$1,$2,$3,$4'), /another tab/);
    });
    await check('budgets and lifestyle disagreements reduce the score', async () => {
        await save(3, true, { budget_min: 300000, budget_max: 400000, sleep_schedule: 'late', smoking: 'smoker', pets: 'has_pet' });
        const withoutOverlap = await rpc(1, 'find_roommates');
        assert.equal(withoutOverlap.some(card => card.user_id === userId(3)), false);
        const all = await rpc(1, 'find_roommates', [null, null, null, 0, false], '$1,$2,$3,$4,$5');
        const card = all.find(item => item.user_id === userId(3));
        assert.equal(card.comparison.score, 50);
        assert.equal(card.comparison.factors.find(item => item.key === 'budget').score, 0);
    });
    await check('undisclosed answers are excluded and lower coverage', async () => {
        await save(4, true, { smoking: 'prefer_not_to_say', pets: 'prefer_not_to_say' });
        const card = (await rpc(1, 'find_roommates')).find(item => item.user_id === userId(4));
        assert.equal(card.comparison.score, 100);
        assert.equal(card.comparison.coverage, 85);
        assert.equal(card.comparison.factors.find(item => item.key === 'smoking').score, null);
    });
    await check('filters apply together and paging is stable', async () => {
        const match = await rpc(1, 'find_roommates', ['AlmaU', 'bostandyk', 'shared', 90, true, 1, 0], '$1,$2,$3,$4,$5,$6,$7');
        const next = await rpc(1, 'find_roommates', ['AlmaU', 'bostandyk', 'shared', 90, true, 1, 1], '$1,$2,$3,$4,$5,$6,$7');
        assert.equal(match.length, 1);
        assert.notEqual(match[0].user_id, next[0].user_id);
        assert.deepEqual(await rpc(1, 'find_roommates', ['KIMEP'], '$1'), []);
        await assert.rejects(rpc(1, 'find_roommates', [null, null, null, 0, true, 500, 0], '$1,$2,$3,$4,$5,$6,$7'), /filters/);
    });
    await check('direct table access stays owner-only and publication cannot be set directly', async () => {
        assert.equal((await asUser(1, 'select * from public.student_profiles')).length, 1);
        await assert.rejects(asUser(1, 'update public.student_profiles set matching_enabled=true where user_id=auth.uid()'), /permission denied/);
        await assert.rejects(asUser(1, 'select * from sublet_private.roommate_requests'), /permission denied/);
    });

    let connection;
    await check('requests are idempotent and never reveal contact details while pending', async () => {
        connection = await rpc(1, 'send_roommate_request', [userId(2)], '$1');
        assert.equal(await rpc(1, 'send_roommate_request', [userId(2)], '$1'), connection);
        assert.equal(await rpc(2, 'send_roommate_request', [userId(1)], '$1'), connection);
        const incoming = await rpc(2, 'my_roommate_requests');
        assert.equal(incoming[0].direction, 'incoming');
        assert.equal(incoming[0].contact_email, null);
        assert.deepEqual(await rpc(3, 'my_roommate_requests'), []);
        await assert.rejects(rpc(3, 'respond_roommate_request', [connection, 'accept'], '$1,$2'), /not available/);
        await assert.rejects(rpc(1, 'respond_roommate_request', [connection, 'accept'], '$1,$2'), /has changed/);
    });
    await check('only recipient acceptance reveals the two university emails', async () => {
        await rpc(2, 'respond_roommate_request', [connection, 'accept'], '$1,$2');
        assert.equal((await rpc(1, 'my_roommate_requests'))[0].contact_email, 'student2@almau.edu.kz');
        assert.equal((await rpc(2, 'my_roommate_requests'))[0].contact_email, 'student1@almau.edu.kz');
    });
    await check('pausing hides a profile and revokes further contact reads', async () => {
        await rpc(2, 'set_roommate_visibility', [false], '$1');
        assert.equal((await rpc(1, 'find_roommates')).some(card => card.user_id === userId(2)), false);
        assert.equal((await rpc(1, 'my_roommate_requests'))[0].contact_email, null);
        await rpc(2, 'set_roommate_visibility', [true], '$1');
    });
    await check('blocking hides both profiles and closes the connection', async () => {
        await rpc(1, 'set_roommate_block', [userId(2), true], '$1,$2');
        assert.equal((await rpc(1, 'find_roommates')).some(card => card.user_id === userId(2)), false);
        assert.equal((await rpc(2, 'find_roommates')).some(card => card.user_id === userId(1)), false);
        assert.deepEqual(await rpc(1, 'my_roommate_requests'), []);
        assert.equal((await rpc(1, 'my_roommate_blocks'))[0].user_id, userId(2));
        assert.deepEqual(await rpc(2, 'my_roommate_blocks'), []);
        await assert.rejects(rpc(2, 'send_roommate_request', [userId(1)], '$1'), /not available/);
        await rpc(1, 'set_roommate_block', [userId(2), false], '$1,$2');
        assert.equal((await rpc(1, 'my_roommate_requests'))[0].status, 'cancelled');
        assert.equal((await rpc(1, 'my_roommate_requests'))[0].contact_email, null);
    });
    await check('suspension and Supabase bans take effect with an existing subject', async () => {
        await database.query("update sublet_private.student_accounts set status='suspended' where user_id=$1", [userId(3)]);
        await assert.rejects(rpc(3, 'find_roommates'), /active, verified/);
        await assert.rejects(rpc(3, 'save_roommate_profile', [profile('Third'), preferences(), true, '2026-10-29T00:00:00Z'], '$1,$2,$3,$4'), /active, verified/);
        await database.query("update auth.users set banned_until=now()+interval '1 day' where id=$1", [userId(4)]);
        assert.equal((await rpc(1, 'find_roommates')).some(card => card.user_id === userId(4)), false);
        await assert.rejects(rpc(4, 'my_roommate_requests'), /active, verified/);
    });
    await check('one sender cannot create more than twenty new requests in a day', async () => {
        for (let number = 5; number <= 26; number += 1) await save(number);
        for (let number = 6; number <= 25; number += 1) await rpc(5, 'send_roommate_request', [userId(number)], '$1');
        await assert.rejects(rpc(5, 'send_roommate_request', [userId(26)], '$1'), /request limit/);
    });
    await check('rerunning the migration fails without deleting existing requests', async () => {
        const before = (await database.query('select count(*) as count from sublet_private.roommate_requests')).rows;
        await assert.rejects(database.exec(await readFile(migration, 'utf8')));
        await database.exec('rollback');
        assert.deepEqual((await database.query('select count(*) as count from sublet_private.roommate_requests')).rows, before);
    });
    console.log(`${passed} database checks passed.`);
} finally {
    await database.close();
}

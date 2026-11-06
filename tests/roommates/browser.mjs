import { JSDOM, VirtualConsole } from 'jsdom';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const project = new URL('../../', import.meta.url);
const source = name => readFile(new URL(name, project), 'utf8');
const tick = () => new Promise(resolve => setTimeout(resolve, 15));
const profile = {
    display_name: 'Student One', major: 'Software Engineering', year_of_study: 2,
    bio: 'I prefer a quiet home and tidy shared spaces.', matching_enabled: true,
    updated_at: '2026-10-29T10:00:00.000001Z'
};
const preferences = {
    budget_min: 80000, budget_max: 150000, move_in_date: '2026-11-10', stay_months: 6,
    preferred_area: 'Bostandyk', housing_type: 'shared', sleep_schedule: 'early',
    cleanliness: 'very_tidy', home_environment: 'quiet', smoking: 'non_smoker', guests: 'rarely', pets: 'no_pets'
};
const candidate = {
    ...profile, ...preferences, user_id: 'student-two', university: 'AlmaU',
    display_name: '<img src=x onerror=alert(1)>', comparison: {
        score: 100, coverage: 100, factors: [{ key: 'budget', label: 'Monthly budget', weight: 25, score: 100, explanation: 'Your budget ranges overlap.' }]
    }, request_status: null
};

async function createPage(options = {}) {
    const console = new VirtualConsole();
    const errors = [];
    console.on('jsdomError', error => errors.push(error));
    const dom = new JSDOM(await source('match.html'), { url: 'https://test.example/match.html', runScripts: 'outside-only', virtualConsole: console });
    const window = dom.window;
    const calls = [];
    const dialogs = [];
    window.HTMLElement.prototype.scrollIntoView = function () {};
    window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
    window.HTMLDialogElement.prototype.close = function (value = '') {
        this.returnValue = value;
        this.open = false;
        this.dispatchEvent(new window.Event('close'));
    };
    const savedProfile = { ...profile, matching_enabled: !options.privateProfile };
    const client = {
        from(table) {
            return { select() { return { eq() { return { single: async () => options.loadError
                ? { error: { code: 'PGRST204' } }
                : { data: table === 'student_profiles' ? savedProfile : preferences, error: null } }; } }; } };
        },
        async rpc(name, parameters) {
            calls.push({ name, parameters });
            if (options.responses?.[name]) return options.responses[name](parameters);
            if (name === 'find_roommates') return { data: options.empty ? [] : [candidate], error: null };
            if (name === 'my_roommate_requests') return { data: options.requests || [], error: null };
            if (name === 'my_roommate_blocks') return { data: [], error: null };
            if (name === 'save_roommate_profile') return { data: { matching_enabled: parameters.p_publish, updated_at: '2026-10-29T10:01:00Z' }, error: null };
            return { data: null, error: null };
        }
    };
    window.SubletAuth = {
        requireStudent: async () => options.signedOut ? null : { user_id: 'student-one', university: 'AlmaU' },
        client,
        message: async (title, text) => { dialogs.push({ title, text }); }
    };
    if (options.legacy) window.localStorage.setItem('subletCampusMyProfile:student-one', JSON.stringify(options.legacy));
    window.eval(await source('roommate-helpers.js'));
    window.eval(await source('roommates.js'));
    await tick();
    return { dom, window, document: window.document, calls, dialogs, errors };
}

let passed = 0;
async function check(name, action) {
    await action();
    passed += 1;
    console.log('PASS ' + name);
}

await check('signed-out visitors do not query or reveal roommate data', async () => {
    const page = await createPage({ signedOut: true });
    try { assert.equal(page.calls.length, 0); assert.equal(page.document.querySelector('main').hidden, true); }
    finally { page.dom.window.close(); }
});

await check('saved values load and undergraduate years stop at four', async () => {
    const page = await createPage();
    try {
        assert.equal(page.document.getElementById('display_name').value, 'Student One');
        assert.equal(page.document.getElementById('profileFields').disabled, false);
        assert.deepEqual([...page.document.getElementById('year_of_study').options].map(option => option.value), ['', '1', '2', '3', '4']);
        assert.equal(page.errors.length, 0);
    } finally { page.dom.window.close(); }
});

await check('a load failure disables editing and offers retry', async () => {
    const page = await createPage({ loadError: true });
    try {
        assert.equal(page.document.getElementById('profileFields').disabled, true);
        assert.equal(page.document.getElementById('retryProfile').hidden, false);
    } finally { page.dom.window.close(); }
});

await check('a private profile cannot request matching results', async () => {
    const page = await createPage({ privateProfile: true });
    try {
        page.document.getElementById('browseTab').click();
        await tick();
        assert.equal(page.calls.some(call => call.name === 'find_roommates'), false);
        assert.match(page.document.getElementById('browseNotice').textContent, /discovery switched on/);
    } finally { page.dom.window.close(); }
});

await check('candidate content is rendered as text rather than HTML', async () => {
    const page = await createPage();
    try {
        page.document.getElementById('browseTab').click();
        await tick();
        assert.equal(page.document.querySelector('#matchResults img'), null);
        assert.match(page.document.getElementById('matchResults').textContent, /<img src=x/);
        assert.equal(page.document.querySelectorAll('.roommate-card').length, 1);
        assert.equal(page.errors.length, 0);
    } finally { page.dom.window.close(); }
});

await check('no candidates produce an honest empty state', async () => {
    const page = await createPage({ empty: true });
    try {
        page.document.getElementById('browseTab').click();
        await tick();
        assert.equal(page.document.getElementById('matchEmpty').hidden, false);
        assert.equal(page.document.querySelectorAll('.roommate-card').length, 0);
    } finally { page.dom.window.close(); }
});

await check('invalid budgets never call the save RPC', async () => {
    const page = await createPage();
    try {
        page.document.getElementById('budget_min').value = '500000';
        page.document.getElementById('roommateForm').dispatchEvent(new page.window.Event('submit', { cancelable: true }));
        await tick();
        assert.equal(page.calls.some(call => call.name === 'save_roommate_profile'), false);
        assert.match(page.document.getElementById('formErrors').textContent, /minimum budget/);
    } finally { page.dom.window.close(); }
});

await check('saving sends only the allowed shared fields and profile version', async () => {
    const page = await createPage();
    try {
        page.document.getElementById('roommateForm').dispatchEvent(new page.window.Event('submit', { cancelable: true }));
        await tick();
        const call = page.calls.find(call => call.name === 'save_roommate_profile');
        assert.equal(call.parameters.p_expected_updated_at, profile.updated_at);
        assert.equal(call.parameters.p_publish, true);
        assert.deepEqual(Object.keys(call.parameters.p_profile), ['display_name', 'major', 'year_of_study', 'bio']);
        assert.doesNotMatch(JSON.stringify(call.parameters), /phone|alternate_email|first_name|last_name/);
    } finally { page.dom.window.close(); }
});

await check('connection requests wait for explicit email-sharing consent', async () => {
    const page = await createPage();
    try {
        page.document.getElementById('browseTab').click();
        await tick();
        const requestButton = [...page.document.querySelectorAll('#matchResults button')].find(button => button.textContent === 'Request connection');
        requestButton.click();
        await tick();
        assert.equal(page.calls.some(call => call.name === 'send_roommate_request'), false);
        assert.match(page.document.querySelector('dialog').textContent, /university email address/);
        page.document.querySelector('dialog').close('proceed');
        await tick();
        assert.equal(page.calls.some(call => call.name === 'send_roommate_request'), true);
    } finally { page.dom.window.close(); }
});

await check('accepted contacts appear only when returned by the server', async () => {
    const page = await createPage({ requests: [{
        id: '1', status: 'accepted', direction: 'incoming', other_user_id: 'student-two',
        display_name: 'Student Two', university: 'AlmaU', available: true, contact_email: 'student2@almau.edu.kz'
    }] });
    try {
        page.document.getElementById('requestsTab').click();
        await tick();
        assert.equal(page.document.querySelector('#requestList a').getAttribute('href'), 'mailto:student2@almau.edu.kz');
        assert.equal(page.errors.length, 0);
    } finally { page.dom.window.close(); }
});

await check('older search responses cannot replace a newer result', async () => {
    const waiting = [];
    const page = await createPage({ responses: { find_roommates: () => new Promise(resolve => waiting.push(resolve)) } });
    try {
        page.document.getElementById('browseTab').click();
        await tick();
        page.document.getElementById('filterForm').dispatchEvent(new page.window.Event('submit', { cancelable: true }));
        await tick();
        waiting[1]({ data: [{ ...candidate, display_name: 'New result' }] });
        await tick();
        waiting[0]({ data: [{ ...candidate, display_name: 'Stale result' }] });
        await tick();
        assert.match(page.document.getElementById('matchResults').textContent, /New result/);
        assert.doesNotMatch(page.document.getElementById('matchResults').textContent, /Stale result/);
    } finally { page.dom.window.close(); }
});

console.log(`${passed} page behavior checks passed.`);

(async function () {
    'use strict';

    const auth = window.SubletAuth;
    const helpers = window.RoommateHelpers;
    const account = await auth.requireStudent();
    if (!account) return;

    const client = auth.client;
    const byId = id => document.getElementById(id);
    const pageSize = 20;
    let savedProfile = null;
    let savedPreferences = null;
    let profileVersion = null;
    let published = false;
    let profileReady = false;
    let dirty = false;
    let currentOffset = 0;
    let hasNextPage = false;
    let searchGeneration = 0;
    let requestsGeneration = 0;
    let saving = false;
    let dialogOpen = false;

    const knownMessages = new Set([
        'Your profile changed in another tab. Reload it before saving.',
        'Complete your introduction, year, budget, dates and lifestyle before publishing.',
        'Complete your profile before publishing.',
        'Choose a year from 1 to 4.',
        'Publish your roommate profile to browse matches.',
        'This profile is not available for a request.',
        'Both profiles must be visible to accept this request.',
        'This request has changed. Refresh your requests.',
        'This request is not available.',
        'You have reached today’s request limit. Try again tomorrow.'
    ]);

    function element(tag, text, className) {
        const node = document.createElement(tag);
        if (text !== undefined) node.textContent = text;
        if (className) node.className = className;
        return node;
    }

    function button(label, action, className = 'button secondary') {
        const node = element('button', label, className);
        node.type = 'button';
        node.addEventListener('click', action);
        return node;
    }

    function readableError(error, fallback) {
        if (knownMessages.has(error?.message)) return error.message;
        if (error?.code === '42501') return 'Your account or this profile is no longer available. Refresh the page to check.';
        if (error?.code === '23514' || error?.code === '22P02' || error?.code === '22007') {
            return 'Check the values in your profile and try saving again.';
        }
        return fallback;
    }

    async function call(name, parameters = {}) {
        const result = await client.rpc(name, parameters);
        if (result.error) throw result.error;
        return result.data;
    }

    function openDialog(title, content, actionLabel = 'Close', confirm = false) {
        if (dialogOpen) return Promise.resolve(false);
        dialogOpen = true;
        return new Promise(resolve => {
            const previousFocus = document.activeElement;
            const dialog = element('dialog', undefined, 'campus-dialog roommate-dialog');
            const heading = element('h2', title);
            heading.id = 'roommateDialogTitle';
            dialog.setAttribute('aria-labelledby', heading.id);
            dialog.append(heading, content);
            const actions = element('div', undefined, 'dialog-actions');
            if (confirm) actions.append(button('Cancel', () => dialog.close('cancel')));
            const proceed = button(actionLabel, () => dialog.close('proceed'), 'button');
            actions.append(proceed);
            dialog.append(actions);
            dialog.addEventListener('close', () => {
                const accepted = dialog.returnValue === 'proceed';
                dialog.remove();
                dialogOpen = false;
                if (previousFocus?.isConnected) previousFocus.focus();
                resolve(accepted);
            }, { once: true });
            document.body.append(dialog);
            dialog.showModal();
            proceed.focus();
        });
    }

    function confirmAction(title, text, label) {
        return openDialog(title, element('p', text), label, true);
    }

    function readForm() {
        const raw = {};
        for (const key of [...helpers.profileFields, ...helpers.preferenceFields]) {
            raw[key] = byId(key).value;
        }
        return helpers.readValues(raw);
    }

    function fillForm(profile, preferences) {
        for (const key of helpers.profileFields) byId(key).value = profile[key] ?? '';
        for (const key of helpers.preferenceFields) byId(key).value = preferences[key] ?? '';
        byId('publishProfile').checked = !!profile.matching_enabled;
    }

    function updateVisibility() {
        const state = byId('visibilityState');
        state.textContent = published ? profileReady ? 'Discovery is on' : 'Profile needs details' : 'Private profile';
        state.classList.toggle('is-live', published && profileReady);
        byId('pauseDiscovery').hidden = !published;
        byId('searchMatches').disabled = !published || !profileReady;
        byId('browseNotice').hidden = published && profileReady && !dirty;
        byId('browseNotice').textContent = !published
            ? 'Complete your profile and save with discovery switched on to find matches.'
            : !profileReady ? 'Your shared details need updating. Complete your profile and save it to find matches.'
            : 'You have unsaved edits. Matches use your last saved profile.';
    }

    async function loadProfile() {
        byId('profileFields').disabled = true;
        byId('retryProfile').hidden = true;
        byId('pageStatus').textContent = 'Loading your saved details…';
        try {
            const [profileResult, preferenceResult] = await Promise.all([
                client.from('student_profiles').select('display_name,major,year_of_study,bio,matching_enabled,updated_at').eq('user_id', account.user_id).single(),
                client.from('student_preferences').select(helpers.preferenceFields.join(',')).eq('user_id', account.user_id).single()
            ]);
            if (profileResult.error || preferenceResult.error) throw profileResult.error || preferenceResult.error;
            savedProfile = profileResult.data;
            savedPreferences = preferenceResult.data;
            profileVersion = savedProfile.updated_at;
            published = !!savedProfile.matching_enabled;
            profileReady = helpers.validate({ profile: savedProfile, preferences: savedPreferences }, true).length === 0;
            dirty = false;
            fillForm(savedProfile, savedPreferences);
            byId('profileFields').disabled = false;
            byId('pageStatus').textContent = published && profileReady ? 'Your profile is saved and visible to participating students.' : 'Your details are loaded. Review them before publishing.';
            updateVisibility();
        } catch (error) {
            byId('pageStatus').textContent = readableError(error, 'Your profile could not be loaded. Try again before making changes.');
            byId('retryProfile').hidden = false;
            byId('visibilityState').textContent = 'Profile unavailable';
        }
    }

    function showSection(section) {
        for (const name of ['profile', 'browse', 'requests']) {
            byId(name + 'Panel').hidden = name !== section;
            byId(name + 'Tab').setAttribute('aria-pressed', String(name === section));
        }
        if (section === 'browse') searchMatches(0);
        if (section === 'requests') refreshRequests();
    }

    function addFact(container, label, value) {
        const group = element('div');
        group.append(element('dt', label), element('dd', value));
        container.append(group);
    }

    function showComparison(card) {
        const content = element('div');
        content.append(element('p', 'This score compares stated preferences. It does not verify someone’s identity, character or suitability as a roommate.'));
        content.append(element('p', `Compared ${card.comparison.coverage}% of the weighted factors. Undisclosed answers are left out of the score.`, 'roommate-caption'));
        const table = element('table', undefined, 'roommate-comparison');
        const caption = element('caption', 'Preference comparison with ' + card.display_name, 'sr-only');
        const header = element('tr');
        for (const label of ['Factor', 'Explanation', 'Agreement']) {
            const cell = element('th', label);
            cell.scope = 'col';
            header.append(cell);
        }
        const head = element('thead');
        head.append(header);
        const body = element('tbody');
        for (const factor of card.comparison.factors) {
            const row = element('tr');
            row.append(element('td', `${factor.label} (${factor.weight}%)`));
            row.append(element('td', factor.explanation));
            row.append(element('td', factor.score === null ? 'Not compared' : `${factor.score}%`));
            body.append(row);
        }
        table.append(caption, head, body);
        content.append(table);
        openDialog('Why this match?', content);
    }

    function createCard(card, preview = false) {
        const article = element('article', undefined, 'roommate-card');
        const top = element('div', undefined, 'roommate-card-top');
        const avatar = element('span', card.display_name.trim().slice(0, 1).toUpperCase() || 'S', 'roommate-avatar');
        avatar.setAttribute('aria-hidden', 'true');
        const identity = element('div');
        identity.append(element('h3', card.display_name || 'Your display name'));
        identity.append(element('p', `${card.university} · Year ${card.year_of_study || 'not added'}`, 'muted'));
        if (card.major) identity.append(element('p', card.major, 'muted'));
        top.append(avatar, identity);
        article.append(top, element('p', 'University email verified', 'badge'));
        article.append(element('p', card.bio || 'Your introduction will appear here.', 'roommate-bio'));
        const facts = element('dl', undefined, 'roommate-facts');
        addFact(facts, 'Monthly budget', card.budget_min !== null && card.budget_max !== null
            ? helpers.money(card.budget_min) + ' – ' + helpers.money(card.budget_max) : 'Not added');
        addFact(facts, 'Move-in date', helpers.dateLabel(card.move_in_date));
        addFact(facts, 'Length of stay', card.stay_months ? card.stay_months + ' months' : 'Not added');
        addFact(facts, 'Preferred area', card.preferred_area || 'Any area');
        addFact(facts, 'Housing', helpers.choices.housing_type[card.housing_type] || 'Flexible');
        article.append(facts);
        const lifestyle = element('details');
        lifestyle.append(element('summary', 'Lifestyle preferences'));
        for (const key of ['sleep_schedule', 'cleanliness', 'home_environment', 'smoking', 'guests', 'pets']) {
            if (card[key]) lifestyle.append(element('p', helpers.choices[key][card[key]] || 'Not added', 'roommate-caption'));
        }
        article.append(lifestyle);
        if (preview) {
            article.append(element('p', 'This preview does not publish your profile.', 'roommate-caption'));
            return article;
        }
        const score = element('div', undefined, 'roommate-score');
        score.append(element('strong', card.comparison.score + '%'), element('span', 'Preference match'));
        article.append(score, element('p', `Compared ${card.comparison.coverage}% of weighted factors`, 'roommate-caption'));
        article.append(button('Why this match?', () => showComparison(card), 'roommate-link'));
        const actions = element('div', undefined, 'roommate-actions');
        if (!card.request_status) {
            actions.append(button('Request connection', event => sendRequest(card, event.currentTarget), 'button'));
        } else {
            const label = card.request_status === 'pending'
                ? card.request_direction === 'incoming' ? 'Incoming request' : 'Request sent'
                : card.request_status === 'accepted' ? 'Connected' : 'Request closed';
            actions.append(element('span', label, 'badge'));
            actions.append(button('View requests', () => showSection('requests')));
        }
        actions.append(button('Block', event => blockStudent(card.user_id, card.display_name, event.currentTarget), 'button secondary roommate-danger'));
        article.append(actions);
        return article;
    }

    async function searchMatches(offset) {
        const generation = ++searchGeneration;
        currentOffset = offset;
        byId('matchResults').replaceChildren();
        byId('matchEmpty').hidden = true;
        byId('previousMatches').disabled = true;
        byId('nextMatches').disabled = true;
        byId('pageNumber').textContent = '';
        updateVisibility();
        if (!published || !profileReady) {
            byId('matchStatus').textContent = 'Your profile needs to be published before you can find matches.';
            return;
        }
        byId('searchMatches').disabled = true;
        byId('matchStatus').textContent = 'Finding students with similar housing plans…';
        try {
            const cards = await call('find_roommates', {
                p_university: byId('universityFilter').value || null,
                p_area: byId('areaFilter').value.trim() || null,
                p_housing_type: byId('housingFilter').value || null,
                p_min_score: Number(byId('scoreFilter').value),
                p_overlap_only: byId('overlapFilter').checked,
                p_limit: pageSize + 1,
                p_offset: offset
            });
            if (generation !== searchGeneration) return;
            if (!Array.isArray(cards)) throw new Error('Invalid matches');
            hasNextPage = cards.length > pageSize;
            const visible = cards.slice(0, pageSize);
            byId('matchResults').replaceChildren(...visible.map(card => createCard(card)));
            byId('matchEmpty').hidden = visible.length !== 0;
            byId('matchStatus').textContent = visible.length ? `Showing ${visible.length} ${visible.length === 1 ? 'student' : 'students'}, ranked by preference match.` : 'No published profiles match these filters.';
            byId('pageNumber').textContent = visible.length || offset ? `Page ${Math.floor(offset / pageSize) + 1}` : '';
            byId('previousMatches').disabled = offset === 0;
            byId('nextMatches').disabled = !hasNextPage;
        } catch (error) {
            if (generation === searchGeneration) {
                byId('matchStatus').textContent = readableError(error, 'Matches could not be loaded. Try again shortly.');
            }
        } finally {
            if (generation === searchGeneration) byId('searchMatches').disabled = !published || !profileReady;
        }
    }

    async function sendRequest(card, trigger) {
        const accepted = await confirmAction('Connect with ' + card.display_name + '?',
            'If this student accepts, both of you will be able to see each other’s university email address. Your phone number and alternative email stay private.', 'Send request');
        if (!accepted) return;
        trigger.disabled = true;
        try {
            await call('send_roommate_request', { p_recipient: card.user_id });
            await searchMatches(currentOffset);
            byId('matchStatus').textContent = 'Your request is saved. Open Requests to check its status.';
        } catch (error) {
            await auth.message('Could not send request', readableError(error, 'The request could not be sent. Refresh the matches and try again.'));
        } finally {
            if (trigger.isConnected) trigger.disabled = false;
        }
    }

    async function requestAction(request, action, trigger) {
        if (action === 'accept') {
            const accepted = await confirmAction('Accept this connection?',
                'Accepting lets both of you see each other’s university email address. You can disconnect or block the student later.', 'Accept and share email');
            if (!accepted) return;
        } else if (action === 'disconnect') {
            const accepted = await confirmAction('End this connection?',
                'University email addresses will no longer be shown through this connection. Either person may already have copied an address.', 'Disconnect');
            if (!accepted) return;
        }
        trigger.disabled = true;
        try {
            await call('respond_roommate_request', { p_request_id: request.id, p_action: action });
            await refreshRequests();
        } catch (error) {
            await auth.message('Could not update request', readableError(error, 'The request could not be updated. Refresh and try again.'));
        } finally {
            if (trigger.isConnected) trigger.disabled = false;
        }
    }

    function createRequest(request) {
        const article = element('article', undefined, 'roommate-request');
        article.append(element('span', `${request.direction === 'incoming' ? 'Received' : 'Sent'} · ${request.status}`, 'badge'));
        article.append(element('h3', request.display_name));
        if (request.university) article.append(element('p', request.university, 'muted'));
        if (request.contact_email) {
            article.append(element('p', 'University email shared by mutual agreement:'));
            const email = element('a', request.contact_email);
            email.href = 'mailto:' + request.contact_email;
            article.append(email);
        } else if (request.status === 'accepted') {
            article.append(element('p', 'Contact access is unavailable while a profile is paused or an account is inactive.', 'muted'));
        }
        const actions = element('div', undefined, 'roommate-actions');
        if (request.status === 'pending') {
            if (request.direction === 'incoming') {
                if (request.available) actions.append(button('Accept and share email', event => requestAction(request, 'accept', event.currentTarget), 'button'));
                actions.append(button('Decline', event => requestAction(request, 'decline', event.currentTarget)));
            } else {
                actions.append(button('Cancel request', event => requestAction(request, 'cancel', event.currentTarget)));
            }
        } else if (request.status === 'accepted') {
            actions.append(button('Disconnect', event => requestAction(request, 'disconnect', event.currentTarget)));
        } else {
            article.append(element('p', 'This request is closed. Repeated requests to the same student are not sent.', 'roommate-caption'));
        }
        actions.append(button('Block', event => blockStudent(request.other_user_id, request.display_name, event.currentTarget), 'button secondary roommate-danger'));
        article.append(actions);
        return article;
    }

    async function refreshRequests() {
        const generation = ++requestsGeneration;
        byId('refreshRequests').disabled = true;
        byId('requestStatus').textContent = 'Loading requests…';
        byId('requestList').replaceChildren();
        byId('blockedList').replaceChildren();
        try {
            const [requests, blocks] = await Promise.all([call('my_roommate_requests'), call('my_roommate_blocks')]);
            if (generation !== requestsGeneration) return;
            if (!Array.isArray(requests) || !Array.isArray(blocks)) throw new Error('Invalid requests');
            byId('requestList').replaceChildren(...requests.map(createRequest));
            byId('requestStatus').textContent = requests.length ? `${requests.length} recent ${requests.length === 1 ? 'request' : 'requests'}.` : 'No connection requests yet.';
            for (const blocked of blocks) {
                const row = element('div', undefined, 'saved-row');
                row.append(element('span', blocked.display_name));
                row.append(button('Unblock', event => unblockStudent(blocked.user_id, event.currentTarget)));
                byId('blockedList').append(row);
            }
            if (!blocks.length) byId('blockedList').append(element('p', 'No blocked students.', 'muted'));
        } catch (error) {
            if (generation === requestsGeneration) byId('requestStatus').textContent = readableError(error, 'Requests could not be loaded. Try again shortly.');
        } finally {
            if (generation === requestsGeneration) byId('refreshRequests').disabled = false;
        }
    }

    async function blockStudent(userId, name, trigger) {
        const accepted = await confirmAction('Block ' + name + '?',
            'You won’t appear in each other’s matches. Existing requests and connections will close, and shared email addresses will no longer be shown here.', 'Block student');
        if (!accepted) return;
        trigger.disabled = true;
        try {
            await call('set_roommate_block', { p_other: userId, p_blocked: true });
            if (!byId('browsePanel').hidden) await searchMatches(currentOffset);
            if (!byId('requestsPanel').hidden) await refreshRequests();
        } catch (error) {
            await auth.message('Could not block student', readableError(error, 'The block could not be saved. Try again.'));
        } finally {
            if (trigger.isConnected) trigger.disabled = false;
        }
    }

    async function unblockStudent(userId, trigger) {
        trigger.disabled = true;
        try {
            await call('set_roommate_block', { p_other: userId, p_blocked: false });
            await refreshRequests();
        } catch (error) {
            await auth.message('Could not unblock student', readableError(error, 'Please try again shortly.'));
        } finally {
            if (trigger.isConnected) trigger.disabled = false;
        }
    }

    async function saveProfile(event) {
        event.preventDefault();
        if (saving || byId('profileFields').disabled) return;
        const values = readForm();
        const publish = byId('publishProfile').checked;
        const errors = helpers.validate(values, publish);
        byId('formErrors').textContent = errors.join(' ');
        if (errors.length) {
            await auth.message('Check your profile', errors.join('\n'));
            return;
        }
        saving = true;
        byId('profileFields').disabled = true;
        try {
            const result = await call('save_roommate_profile', {
                p_profile: values.profile,
                p_preferences: values.preferences,
                p_publish: publish,
                p_expected_updated_at: profileVersion
            });
            profileVersion = result.updated_at;
            savedProfile = { ...values.profile, matching_enabled: result.matching_enabled, updated_at: result.updated_at };
            savedPreferences = values.preferences;
            published = result.matching_enabled;
            profileReady = helpers.validate(values, true).length === 0;
            dirty = false;
            searchGeneration += 1;
            byId('matchResults').replaceChildren();
            byId('pageStatus').textContent = published ? 'Your roommate profile is saved and discovery is on.' : 'Your private draft is saved. Other students cannot discover it.';
            updateVisibility();
            await auth.message('Profile saved', published ? 'Your profile is now visible to other participating students.' : 'Your draft is saved to your account and stays private.');
        } catch (error) {
            const message = readableError(error, 'Your changes could not be saved. Your edits are still in the form.');
            byId('formErrors').textContent = message;
            if (error?.code === '40001') byId('retryProfile').hidden = false;
            await auth.message('Could not save profile', message);
        } finally {
            saving = false;
            byId('profileFields').disabled = false;
        }
    }

    async function pauseDiscovery() {
        if (saving || !published) return;
        const accepted = await confirmAction('Pause roommate discovery?',
            'Your saved profile will stay in your account. Other students won’t find it or retrieve your university email through this feature while discovery is paused.', 'Pause discovery');
        if (!accepted) return;
        saving = true;
        byId('profileFields').disabled = true;
        try {
            await call('set_roommate_visibility', { p_visible: false });
            published = false;
            byId('publishProfile').checked = false;
            searchGeneration += 1;
            byId('matchResults').replaceChildren();
            updateVisibility();
            const result = await client.from('student_profiles').select('updated_at').eq('user_id', account.user_id).single();
            profileVersion = result.error ? null : result.data.updated_at;
            byId('pageStatus').textContent = 'Discovery is paused. Your profile is private.';
        } catch (error) {
            await auth.message('Could not pause discovery', readableError(error, 'Please check your connection and try again.'));
        } finally {
            saving = false;
            byId('profileFields').disabled = false;
        }
    }

    for (const [key, labels] of Object.entries(helpers.choices)) {
        const select = byId(key);
        if (key !== 'housing_type') select.append(new Option('Choose an answer', ''));
        for (const [value, label] of Object.entries(labels)) select.append(new Option(label, value));
    }
    for (const [value, label] of Object.entries(helpers.choices.housing_type)) {
        byId('housingFilter').append(new Option(label, value));
    }
    byId('profileUniversity').textContent = account.university;
    byId('roommateForm').addEventListener('submit', saveProfile);
    byId('roommateForm').addEventListener('input', () => {
        dirty = true;
        byId('pageStatus').textContent = 'You have unsaved changes.';
        updateVisibility();
    });
    byId('previewProfile').addEventListener('click', () => {
        const values = readForm();
        const card = { ...values.profile, ...values.preferences, university: account.university };
        byId('profilePreview').replaceChildren(createCard(card, true));
        byId('profilePreview').hidden = false;
        byId('profilePreview').scrollIntoView({ block: 'nearest', behavior: 'auto' });
    });
    byId('pauseDiscovery').addEventListener('click', pauseDiscovery);
    for (const name of ['profile', 'browse', 'requests']) byId(name + 'Tab').addEventListener('click', () => showSection(name));
    byId('filterForm').addEventListener('submit', event => { event.preventDefault(); searchMatches(0); });
    byId('resetFilters').addEventListener('click', () => { byId('filterForm').reset(); searchMatches(0); });
    byId('previousMatches').addEventListener('click', () => searchMatches(Math.max(0, currentOffset - pageSize)));
    byId('nextMatches').addEventListener('click', () => { if (hasNextPage) searchMatches(currentOffset + pageSize); });
    byId('refreshRequests').addEventListener('click', refreshRequests);
    byId('retryProfile').addEventListener('click', async () => {
        if (dirty && !(await confirmAction('Reload your saved profile?', 'Your unsaved edits will be replaced by the saved version.', 'Reload profile'))) return;
        await loadProfile();
    });

    let browserDraft = null;
    try {
        const stored = localStorage.getItem('subletCampusMyProfile:' + account.user_id);
        if (stored) {
            browserDraft = helpers.legacyDraft(JSON.parse(stored));
            byId('legacyNotice').hidden = false;
        }
    } catch (_) {
        byId('pageStatus').textContent = 'An old browser draft could not be read. Your account profile can still be used.';
    }
    byId('importLegacy').addEventListener('click', async () => {
        if (!browserDraft || byId('profileFields').disabled) return;
        const accepted = await confirmAction('Load your browser draft?', 'This replaces the fields on screen, but does not save or publish them. Review dates and any unanswered preferences before saving.', 'Load draft');
        if (!accepted) return;
        for (const [key, value] of Object.entries(browserDraft)) byId(key).value = value;
        byId('publishProfile').checked = false;
        dirty = true;
        byId('pageStatus').textContent = 'Browser draft loaded. Review every field before saving. The old browser copy has not been deleted.';
        updateVisibility();
    });

    await loadProfile();
})();

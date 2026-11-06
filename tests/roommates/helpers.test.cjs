'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const helpers = require(path.resolve(__dirname, '../../roommate-helpers.js'));

function completeValues(overrides = {}) {
    return helpers.readValues({
        display_name: 'Abdulrahman', major: 'Software Engineering', year_of_study: '2',
        bio: 'I prefer a quiet home and tidy shared spaces.', budget_min: '80000', budget_max: '150000',
        move_in_date: '2026-11-10', stay_months: '6', preferred_area: 'Bostandyk', housing_type: 'shared',
        sleep_schedule: 'early', cleanliness: 'very_tidy', home_environment: 'quiet',
        smoking: 'non_smoker', guests: 'rarely', pets: 'no_pets', ...overrides
    });
}

test('blank numbers stay null rather than becoming zero', () => {
    const values = helpers.readValues({});
    assert.equal(values.profile.year_of_study, null);
    assert.equal(values.preferences.budget_min, null);
    assert.equal(values.preferences.stay_months, null);
});

test('a complete undergraduate profile can be published', () => {
    assert.deepEqual(helpers.validate(completeValues(), true), []);
    assert.ok(helpers.validate(completeValues({ year_of_study: '5' }), true).length);
    assert.ok(helpers.validate(completeValues({ year_of_study: '2.5' }), true).length);
});

test('partial private drafts are allowed but cannot be published', () => {
    const values = helpers.readValues({ housing_type: 'flexible' });
    assert.deepEqual(helpers.validate(values, false), []);
    assert.ok(helpers.validate(values, true).length);
});

test('budget errors and invalid calendar dates are caught', () => {
    for (const overrides of [
        { budget_min: '200000', budget_max: '100000' },
        { budget_min: '-1' }, { budget_max: 'Infinity' }, { budget_max: '150000.5' },
        { move_in_date: '2026-02-30' }, { stay_months: '61' }, { smoking: 'unknown' }
    ]) {
        assert.ok(helpers.validate(completeValues(overrides), true).length, JSON.stringify(overrides));
    }
});

test('legacy import ignores email, university and contact details', () => {
    const imported = helpers.legacyDraft({
        displayName: 'Abdulrahman', yearOfStudy: '2nd year', budget: '100000',
        contactEmail: 'private@example.org', university: 'Invented university',
        smoking: 'Prefer a smoke-free home', guests: 'Prefer no guests', stayLength: 'Long-term'
    });
    assert.equal(imported.year_of_study, 2);
    assert.equal(imported.budget_min, '100000');
    assert.equal(imported.smoking, '');
    assert.equal(imported.guests, '');
    assert.equal(imported.stay_months, '');
    assert.equal(Object.hasOwn(imported, 'contactEmail'), false);
    assert.equal(Object.hasOwn(imported, 'university'), false);
    assert.throws(() => helpers.legacyDraft([]));
});

test('date and money labels use stable display formats', () => {
    assert.equal(helpers.dateLabel('2026-11-10'), '10 Nov 2026');
    assert.equal(helpers.dateLabel(null), 'Not added');
    assert.equal(helpers.money(150000), '150,000 KZT');
});

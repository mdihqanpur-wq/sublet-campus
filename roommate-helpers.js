(function () {
    'use strict';

    const choices = Object.freeze({
        housing_type: { flexible: 'Flexible', shared: 'Shared apartment', private_room: 'Private room', dormitory: 'Dormitory', studio: 'Studio / apartment' },
        sleep_schedule: { early: 'Early nights', late: 'Late nights', flexible: 'Flexible' },
        cleanliness: { very_tidy: 'Very tidy', moderate: 'Moderately tidy', relaxed: 'Relaxed' },
        home_environment: { quiet: 'Mostly quiet', balanced: 'A balance of quiet and social time', social: 'Social and lively' },
        smoking: { non_smoker: 'Non-smoker', smoker: 'Smoker', prefer_not_to_say: 'Prefer not to say' },
        guests: { rarely: 'Rarely', sometimes: 'Sometimes', often: 'Often' },
        pets: { no_pets: 'No pets preferred', pets_welcome: 'Pets are welcome', has_pet: 'I have a pet', prefer_not_to_say: 'Prefer not to say' }
    });

    const profileFields = ['display_name', 'major', 'year_of_study', 'bio'];
    const preferenceFields = [
        'budget_min', 'budget_max', 'move_in_date', 'stay_months', 'preferred_area',
        'housing_type', 'sleep_schedule', 'cleanliness', 'home_environment', 'smoking', 'guests', 'pets'
    ];

    function optionalNumber(value) {
        return String(value ?? '').trim() === '' ? null : Number(value);
    }

    function readValues(raw) {
        const profile = {};
        const preferences = {};
        for (const key of profileFields) {
            profile[key] = key === 'year_of_study' ? optionalNumber(raw[key]) : String(raw[key] ?? '').trim();
        }
        for (const key of preferenceFields) {
            const value = String(raw[key] ?? '').trim();
            if (['budget_min', 'budget_max', 'stay_months'].includes(key)) {
                preferences[key] = optionalNumber(value);
            } else if (key === 'move_in_date' || Object.hasOwn(choices, key)) {
                preferences[key] = value || null;
            } else {
                preferences[key] = value;
            }
        }
        return { profile, preferences };
    }

    function validate(values, publish) {
        const { profile, preferences } = values;
        const errors = [];
        if (profile.display_name.length > 60 || profile.major.length > 100 || profile.bio.length > 500) {
            errors.push('Check the length of your name, major and introduction.');
        }
        if (profile.year_of_study !== null && (!Number.isInteger(profile.year_of_study) || profile.year_of_study < 1 || profile.year_of_study > 4)) {
            errors.push('Choose a year from 1 to 4.');
        }
        for (const key of ['budget_min', 'budget_max']) {
            const amount = preferences[key];
            if (amount !== null && (!Number.isInteger(amount) || amount < 0 || amount > 100000000)) {
                errors.push('Enter whole-number budgets between 0 and 100,000,000 KZT.');
                break;
            }
        }
        if (preferences.budget_min !== null && preferences.budget_max !== null && preferences.budget_min > preferences.budget_max) {
            errors.push('Your minimum budget cannot be higher than your maximum.');
        }
        if (preferences.stay_months !== null && (!Number.isInteger(preferences.stay_months) || preferences.stay_months < 1 || preferences.stay_months > 60)) {
            errors.push('Choose a stay between 1 and 60 months.');
        }
        if (preferences.move_in_date) {
            const date = new Date(preferences.move_in_date + 'T00:00:00Z');
            if (!/^\d{4}-\d{2}-\d{2}$/.test(preferences.move_in_date) || !Number.isFinite(date.valueOf()) || date.toISOString().slice(0, 10) !== preferences.move_in_date) {
                errors.push('Enter a valid move-in date.');
            }
        }
        for (const [key, labels] of Object.entries(choices)) {
            if (preferences[key] !== null && !Object.hasOwn(labels, preferences[key])) {
                errors.push('Choose a valid answer for each lifestyle field.');
                break;
            }
        }
        if (preferences.preferred_area.length > 100) errors.push('Keep the area name under 100 characters.');
        if (publish) {
            const complete = profile.display_name && profile.year_of_study && profile.bio.length >= 10
                && preferences.budget_min !== null && preferences.budget_max > 0
                && preferences.move_in_date && preferences.stay_months
                && ['sleep_schedule', 'cleanliness', 'home_environment', 'smoking', 'guests', 'pets'].every(key => preferences[key]);
            if (!complete) errors.push('Complete your introduction, year, budget, dates and lifestyle before publishing.');
        }
        return [...new Set(errors)];
    }

    function legacyDraft(saved) {
        if (!saved || typeof saved !== 'object' || Array.isArray(saved)) throw new Error('Invalid draft');
        const years = { '1st year': 1, '2nd year': 2, '3rd year': 3, '4th year': 4 };
        const sleep = { 'Flexible': 'flexible', 'Early sleeper / early riser': 'early', 'Night owl': 'late' };
        const cleanliness = { 'Moderately tidy': 'moderate', 'Very tidy': 'very_tidy', 'Relaxed': 'relaxed' };
        const environment = { 'Some noise is fine': 'balanced', 'Mostly quiet': 'quiet', 'Social and lively': 'social' };
        const smoking = { 'Non-smoker': 'non_smoker', 'Smoker': 'smoker', 'Prefer not to say': 'prefer_not_to_say' };
        const pets = { 'No pets preferred': 'no_pets', 'Pets are fine': 'pets_welcome', 'I have a pet': 'has_pet', 'Prefer not to say': 'prefer_not_to_say' };
        const housing = { 'Flexible': 'flexible', 'Shared apartment': 'shared', 'Private room': 'private_room', 'Dormitory': 'dormitory', 'Studio / apartment': 'studio' };
        return {
            display_name: String(saved.displayName || ''), major: String(saved.major || ''),
            year_of_study: years[saved.yearOfStudy] || '', bio: String(saved.bio || ''),
            budget_min: saved.budget ?? '', budget_max: saved.budget ?? '',
            stay_months: { '6 months': 6, '12 months': 12 }[saved.stayLength] || '',
            preferred_area: String(saved.area || ''), housing_type: housing[saved.housingType] || 'flexible',
            sleep_schedule: sleep[saved.sleep] || '', cleanliness: cleanliness[saved.cleanliness] || '',
            home_environment: environment[saved.environment] || '', smoking: smoking[saved.smoking] || '',
            guests: { 'Rarely': 'rarely', 'Sometimes': 'sometimes', 'Often': 'often' }[saved.guests] || '',
            pets: pets[saved.pets] || ''
        };
    }

    function money(value) {
        return Number(value).toLocaleString('en-US') + ' KZT';
    }

    function dateLabel(value) {
        const date = new Date(String(value) + 'T00:00:00Z');
        return Number.isFinite(date.valueOf())
            ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date)
            : 'Not added';
    }

    const exports = { choices, profileFields, preferenceFields, readValues, validate, legacyDraft, money, dateLabel };
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = exports;
    } else {
        window.RoommateHelpers = exports;
    }
})();

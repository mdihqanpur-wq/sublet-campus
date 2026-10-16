(async () => {
  'use strict';
  const auth = window.SubletAuth, $ = id => document.getElementById(id);
  const account = await auth.requireStudent(); if (!account) return;
  $('accountEmail').textContent = account.email;
  $('accountUniversity').textContent = account.university;
  const client = auth.client;
  const profileFields = ['first_name', 'last_name', 'display_name', 'major', 'year_of_study', 'bio'];
  const contactFields = ['phone', 'alternate_email'];
  async function load() {
    $('profileSave').disabled = true; $('contactSave').disabled = true;
    try {
      const [profile, contacts] = await Promise.all([
        client.from('student_profiles').select(profileFields.join(',')).eq('user_id', account.user_id).single(),
        client.from('student_contacts').select(contactFields.join(',')).eq('user_id', account.user_id).single()
      ]);
      if (profile.error || contacts.error) throw profile.error || contacts.error;
      for (const field of profileFields) $(field).value = profile.data[field] ?? '';
      for (const field of contactFields) $(field).value = contacts.data[field] ?? '';
      $('accountNotice').textContent = 'Your account details are private. Other students cannot read them.';
      $('profileSave').disabled = false; $('contactSave').disabled = false;
    } catch (_) {
      $('accountNotice').textContent = 'Your account details could not be loaded. Refresh this page before making changes.';
    }
  }
  async function save(event, table, fields, buttonId, statusId) {
    event.preventDefault(); const form = event.currentTarget;
    const button = $(buttonId); if (button.disabled || !form.reportValidity()) return;
    const values = Object.fromEntries(fields.map(key => [key, $(key).value.trim()]));
    if (table === 'student_profiles') {
      values.year_of_study = values.year_of_study ? Number(values.year_of_study) : null;
      if (!values.first_name || !values.last_name || !values.display_name) {
        await auth.message('Add your name', 'Enter your first name, last name and display name.'); return;
      }
    } else {
      values.phone = values.phone || null; values.alternate_email = values.alternate_email || null;
      if (values.phone && !/^\+[1-9][0-9]{6,14}$/.test(values.phone)) {
        await auth.message('Check your phone number', 'Use the international format, such as +77001234567, without spaces.'); return;
      }
    }
    button.disabled = true;
    try {
      const { data, error } = await client.from(table).update(values).eq('user_id', account.user_id).select('user_id').single();
      if (error || !data) throw error || new Error('Update unavailable');
      $(statusId).textContent = 'Saved to your account.';
      await auth.message('Changes saved', table === 'student_profiles' ? 'Your account details have been updated.' : 'Your private contact details have been updated.');
    } catch (error) {
      $(statusId).textContent = 'Changes were not saved.';
      await auth.message('Could not save changes', auth.publicError(error, 'Check your connection and try again. Your saved details have not been replaced.'));
    } finally { button.disabled = false; }
  }
  $('cloudProfileForm').addEventListener('submit', event => save(event, 'student_profiles', profileFields, 'profileSave', 'profileStatus'));
  $('contactForm').addEventListener('submit', event => save(event, 'student_contacts', contactFields, 'contactSave', 'contactStatus'));
  await load();
})();

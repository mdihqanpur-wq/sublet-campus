require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { createApp } = require('./app');
const app = createApp({ createClient, url: process.env.SUPABASE_URL, key: process.env.SUPABASE_PUBLISHABLE_KEY });
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`SubletCampus server is running at http://localhost:${port}`);
});

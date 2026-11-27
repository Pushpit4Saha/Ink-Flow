import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: ({ browser }) => ({
    name: 'Ink&Flow — Sticky notes for anything you read',
    short_name: 'Ink&Flow',
    description: 'Select any word or sentence on any page or PDF and attach a sticky note. All notes sync to your dashboard.',
    permissions: ['storage', 'activeTab', 'alarms', 'unlimitedStorage'],
    host_permissions: ['<all_urls>'],
    web_accessible_resources: [{ resources: ['fonts/*'], matches: ['<all_urls>'] }],
    commands: {
      'open-note': {
        suggested_key: { default: 'Ctrl+Shift+Y', mac: 'Command+Shift+Y' },
        description: 'Add a note to the selected text',
      },
    },
    // Firefox needs an id and a data-collection statement. Change the id to your own email/domain before publishing.
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: {
              id: 'notes@example.com',
              strict_min_version: '115.0',
              data_collection_permissions: { required: ['authenticationInfo', 'websiteContent'] },
            },
          },
        }
      : {}),
  }),
});

import LegalPage from '@/components/LegalPage';
import { APP_NAME } from '@/lib/brand';

export const metadata = { title: `Privacy policy — ${APP_NAME}` };

// TEMPLATE — review and adapt before publishing (this is not legal advice).
export default function Privacy() {
  return (
    <LegalPage title="Privacy policy">
      <p><span className="font-lobster">{APP_NAME}</span> lets you save sticky notes about text you select on web pages and PDFs. This page explains what we store and why.</p>
      <h2>What we store</h2>
      <ul>
        <li>Your account: email address and (if you choose) display name.</li>
        <li>Your notes: the text you selected, what you wrote, photos you attach, tags, folders, and the address and title of the page or PDF where you made the note.</li>
        <li>PDFs you upload to your library.</li>
        <li>Settings such as AI on/off, language and colours.</li>
      </ul>
      <h2>What the browser extension reads</h2>
      <p>
        The extension needs permission to read and change web pages so it can show the note button and your highlights. It only sends page
        information to our servers when <b>you</b> save a note (the selected text, a little surrounding text, the page address and title). It does
        not track your browsing history.
      </p>
      <h2>AI suggestions</h2>
      <p>
        If AI suggestions are on, the selected text and its sentence are sent to our AI provider (Google Gemini) or a dictionary service to get a
        short meaning. You can turn this off in Settings.
      </p>
      <h2>Sharing</h2>
      <p>Notes are private. They become visible to others only if you turn on a public share link for a note, folder or tag. You can turn it off anytime.</p>
      <h2>Where data is kept</h2>
      <p>Data is stored with Supabase (database and file storage) and the website is hosted on Vercel. We do not sell your data or show ads.</p>
      <h2>Deleting your data</h2>
      <p>You can delete individual notes at any time, or delete your whole account in Settings, which permanently removes all your notes, photos and PDFs.</p>
      <h2>Contact</h2>
      <p>Questions? Email [YOUR EMAIL].</p>
    </LegalPage>
  );
}

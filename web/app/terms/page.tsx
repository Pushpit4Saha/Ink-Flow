import LegalPage from '@/components/LegalPage';
import { APP_NAME } from '@/lib/brand';

export const metadata = { title: `Terms of use — ${APP_NAME}` };

// TEMPLATE — review and adapt before publishing (this is not legal advice).
export default function Terms() {
  return (
    <LegalPage title="Terms of use">
      <p>By using <span className="font-lobster">{APP_NAME}</span> you agree to these terms.</p>
      <h2>Your content</h2>
      <p>You own the notes, photos and files you add. You are responsible for what you upload and share, and for having the right to do so.</p>
      <h2>Acceptable use</h2>
      <ul>
        <li>Don’t use <span className="font-lobster">{APP_NAME}</span> for anything illegal, to harass others, or to share content you don’t have rights to.</li>
        <li>Don’t try to break, overload or misuse the service.</li>
      </ul>
      <h2>AI suggestions</h2>
      <p>AI meanings can be wrong. Check important information yourself.</p>
      <h2>The service</h2>
      <p><span className="font-lobster">{APP_NAME}</span> is provided “as is”. We may change or stop features, and we may suspend accounts that break these terms. Keep your own copies of important notes (use Export).</p>
      <h2>Contact</h2>
      <p>Questions? Email [YOUR EMAIL].</p>
    </LegalPage>
  );
}

import ReactDOM from 'react-dom/client';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { createShadowRootUi } from 'wxt/utils/content-script-ui/shadow-root';
import AnnotApp from '../../components/AnnotApp';
import { webPageSource } from '../../lib/source';
import '../../components/annot.css';

export default defineContentScript({
  matches: ['<all_urls>'],
  cssInjectionMode: 'ui', // our CSS lives inside the Shadow DOM, so pages can't break it
  async main(ctx) {
    const ui = await createShadowRootUi(ctx, {
      name: 'annot-sticky-ui',
      position: 'inline',
      anchor: 'body',
      append: 'last',
      // stop typing inside our note from triggering the page's keyboard shortcuts
      isolateEvents: ['keydown', 'keyup', 'keypress', 'input'],
      onMount(container, _shadow, shadowHost) {
        const root = ReactDOM.createRoot(container);
        root.render(<AnnotApp host={shadowHost} source={webPageSource} />);
        return root;
      },
      onRemove(root) {
        root?.unmount();
      },
    });
    ui.mount();
  },
});

import { browser } from 'wxt/browser';
import type { BgMessage, BgResponse } from './types';

/** Send a message to the background service worker and get a typed answer back. */
export async function sendToBg<T>(msg: BgMessage): Promise<BgResponse<T>> {
  try {
    const res = (await browser.runtime.sendMessage(msg)) as BgResponse<T> | undefined;
    return res ?? { ok: false, error: 'No response from extension background' };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

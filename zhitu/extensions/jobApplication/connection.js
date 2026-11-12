import { ORIGINS } from './protocol.js';

export const BOSS = 'https://www.zhipin.com';
export function selectSearchTab(tabs, senderTab, websiteIds = []) {
  const candidates = tabs.filter(tab => tab.incognito === senderTab.incognito
    && (tab.windowId === senderTab.windowId || tab.openerTabId === senderTab.id)
    && /^https:\/\/www\.zhipin\.com\/web\/geek\/jobs?(?:[/?#]|$)/.test(tab.url || ''));
  return candidates.find(tab => tab.openerTabId === senderTab.id)
    || candidates.filter(tab => !websiteIds.includes(tab.openerTabId))
      .sort((a, b) => Number(b.active) - Number(a.active) || (b.lastAccessed || 0) - (a.lastAccessed || 0))[0];
}
export function selectChatTab(tabs, senderTab, websiteIds = []) {
  return tabs.filter(tab => tab.incognito === senderTab.incognito
    && (tab.windowId === senderTab.windowId || tab.openerTabId === senderTab.id)
    && /^https:\/\/www\.zhipin\.com\/web\/geek\/chat(?:[/?#]|$)/.test(tab.url || ''))
    .filter(tab => !websiteIds.includes(tab.openerTabId) || tab.openerTabId === senderTab.id)
    .sort((a, b) => Number(b.openerTabId === senderTab.id) - Number(a.openerTabId === senderTab.id)
      || (b.lastAccessed || 0) - (a.lastAccessed || 0))[0];
}

export async function chatTab(sender, create = false) {
  const tabs = await bossTabs(sender);
  const websites = (await chrome.tabs.query({ url: ['http://127.0.0.1/*', 'http://localhost/*'] }))
    .filter(tab => { try { return ORIGINS.has(new URL(tab.url).origin); } catch { return false; } });
  const selected = selectChatTab(tabs, sender.tab, websites.map(tab => tab.id));
  if (selected) return selected;
  if (create) return chrome.tabs.create({ url: `${BOSS}/web/geek/chat`, active: true,
    windowId: sender.tab.windowId, openerTabId: sender.tab.id });
}
export async function bossTabs(sender) {
  return (await chrome.tabs.query({ url: `${BOSS}/*` }))
    .filter(tab => tab.incognito === sender.tab.incognito);
}
export async function searchTab(sender, create = false) {
  const tabs = await bossTabs(sender);
  const websites = (await chrome.tabs.query({ url: ['http://127.0.0.1/*', 'http://localhost/*'] }))
    .filter(tab => { try { return ORIGINS.has(new URL(tab.url).origin); } catch { return false; } });
  const selected = selectSearchTab(tabs, sender.tab, websites.map(tab => tab.id));
  if (selected) {
    // Claim a reusable search tab so two Knowvia tabs cannot navigate each other's search.
    return create && selected.openerTabId !== sender.tab.id
      ? chrome.tabs.update(selected.id, { openerTabId: sender.tab.id }) : selected;
  }
  if (create) return chrome.tabs.create({ url: `${BOSS}/web/geek/job`, active: false,
    windowId: sender.tab.windowId, openerTabId: sender.tab.id });
}

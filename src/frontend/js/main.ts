/**
 * Vite entry point for the LWT application.
 *
 * This file serves as the main entry point for the Vite build system.
 * It statically imports shared infrastructure and small modules, then
 * dynamically imports feature modules based on the lwt-modules meta tag
 * emitted by the server. Alpine.js is started after all dynamic imports
 * have resolved.
 */

// Import Alpine.js
import Alpine from 'alpinejs';

// Import Bulma CSS framework
import 'bulma/css/bulma.min.css';

// Import CSS from base directory
import '../css/base/styles.css';
import '../css/base/html5_audio_player.css';
import '../css/base/icons.css';
import '../css/base/css_charts.css';

// =============================================================================
// SHARED INFRASTRUCTURE (always loaded)
// =============================================================================

// Shared utilities
import '@shared/utils/html_utils';
import '@shared/utils/cookies';
import '@shared/utils/tts_storage';
import '@shared/utils/ajax_utilities';
import '@shared/utils/ui_utilities';
import '@shared/utils/user_interactions';
import '@shared/utils/simple_interactions';
import '@shared/utils/inline_markdown';

// Shared stores
import '@shared/stores/lwt_state';
import '@shared/stores/app_data';

// PWA support
//import '@shared/pwa/register';

// Offline support
import '@shared/offline/offline-button';
import '@shared/offline/offline-indicator';

// Shared API client
import '@shared/api/client';

// Shared components (used on every page)
import '@shared/components/modal';
import '@shared/components/navbar';
import '@shared/components/navbar_streak';
import '@shared/components/theme_toggle';
import '@shared/components/footer';

// Shared i18n
import { initI18n, t } from '@shared/i18n/translator';

// Shared accessibility
import { initAriaLive } from '@shared/accessibility/aria_live';

// Shared icons
import '@shared/icons/lucide_icons';

// Shared forms (used on most pages)
import '@shared/forms/unloadformcheck';
import '@shared/forms/form_validation';
import '@shared/forms/form_initialization';

// =============================================================================
// ASYNC CSS LOADING (CSP-compliant)
// =============================================================================

// Convert async CSS links from print to all media
// This enables non-render-blocking CSS loading without inline JS
document.querySelectorAll<HTMLLinkElement>('link[data-async-css]').forEach((link) => {
  link.media = 'all';
});

// =============================================================================
// GLOBAL PAGE LOADER (CSP-compliant, no inline JS)
// =============================================================================

function getPageLoaderEl(): HTMLElement | null {
  return document.getElementById('lwt-page-loader');
}

function showPageLoader(): void {
  const el = getPageLoaderEl();
  if (!el) return;
  el.setAttribute('data-active', 'true');
}

function hidePageLoader(): void {
  const el = getPageLoaderEl();
  if (!el) return;
  el.setAttribute('data-active', 'false');
}

function isModifiedClick(e: MouseEvent): boolean {
  return e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey;
}

function isSafeNavigationHref(href: string): boolean {
  if (!href) return false;
  const lower = href.toLowerCase();
  if (lower.startsWith('javascript:') || lower.startsWith('mailto:') || lower.startsWith('tel:')) return false;
  return true;
}

function isSamePageHashNavigation(nextHref: string): boolean {
  try {
    const current = new URL(window.location.href);
    const next = new URL(nextHref, window.location.href);
    return (
      next.origin === current.origin &&
      next.pathname === current.pathname &&
      next.search === current.search &&
      next.hash.length > 1
    );
  } catch {
    return false;
  }
}

// First paint: loader starts active in HTML; ensure it's visible while JS/CSS settle.
showPageLoader();

// Hide when page is ready (also handles BFCache restores).
window.addEventListener('pageshow', hidePageLoader);
window.addEventListener('load', hidePageLoader);

// Show on link navigations (internal only).
document.addEventListener(
  'click',
  (e) => {
    const target = e.target as HTMLElement | null;
    const a = target?.closest?.('a') as HTMLAnchorElement | null;
    if (!a) return;
    if (a.hasAttribute('download')) return;
    if (a.target === '_blank') return;
    if (a.dataset?.noLoader === 'true') return;
    if (isModifiedClick(e as MouseEvent)) return;

    const href = a.getAttribute('href') ?? '';
    if (!isSafeNavigationHref(href)) return;
    if (isSamePageHashNavigation(href)) return;

    try {
      const u = new URL(href, window.location.href);
      if (u.origin !== window.location.origin) return;
    } catch {
      // if we can't parse it, don't block loader; just show it for non-empty href
    }

    showPageLoader();
  },
  true
);

// Show on form submits.
document.addEventListener(
  'submit',
  (e) => {
    const form = e.target as HTMLFormElement | null;
    if (!form) return;
    if (form.dataset?.noLoader === 'true') return;
    showPageLoader();
  },
  true
);

// Programmatic navigations.
window.addEventListener('beforeunload', showPageLoader);

// =============================================================================
// DYNAMIC MODULE LOADING + ALPINE.JS INITIALIZATION
// =============================================================================

declare global {
  interface Window {
    Alpine: typeof Alpine;
  }
}

/**
 * Map of dynamically-loadable feature modules.
 *
 * Each key corresponds to a module name that the server can request
 * via the <meta name="lwt-modules"> tag.
 */
const moduleMap: Record<string, () => Promise<unknown>> = {
  vocabulary: () => import('@modules/vocabulary'),
  text: () => import('@modules/text'),
  review: () => import('@modules/review'),
  feed: () => import('@modules/feed'),
  language: () => import('@modules/language'),
  admin: () => import('@modules/admin'),
  home: () => import('./home'),
  tags: () => import('@modules/tags/pages/tag_list'),
  auth: () => import('@modules/auth'),
  dictionary: () => import('@modules/dictionary/pages/dictionary_import'),
};

// Read which modules the current page needs from the server-emitted meta tag
const meta = document.querySelector<HTMLMetaElement>('meta[name="lwt-modules"]');
const requestedModules = meta?.content?.split(',').map(m => m.trim()).filter(Boolean) ?? [];

// Start loading all requested modules in parallel
const modulesToLoad = requestedModules.filter(m => m in moduleMap);

modulesToLoad.forEach(m => {
  console.log('[LWT] loading module:', m);
});

Promise.allSettled(modulesToLoad.map(m => moduleMap[m]()))
  .then((results) => {
    results.forEach((result, idx) => {
      const name = modulesToLoad[idx];
      if (result.status === 'rejected') {
        console.error('[LWT] module failed:', name, result.reason);
      } else {
        console.log('[LWT] module loaded:', name);
      }
    });

    initI18n();
    initAriaLive();

    window.Alpine = Alpine;

    Alpine.magic('t', () => (key: string, params?: Record<string, string | number>) => {
      return t(key, params);
    });

    Alpine.magic('markdown', () => (text: string) => {
      if (!text) return '';
      return text
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '$1')
        .replace(/~~([^~]+)~~/g, '$1')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
    });

    Alpine.start();

    window.LWT_VITE_LOADED = true;

    if (import.meta.env.DEV) {
      console.log('LWT Vite bundle loaded (development mode)');
    }
  });

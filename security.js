/* Shared browser helpers. Private access codes never contain customer details. */
(() => {
    'use strict';
    const validCode = code => typeof code === 'string' && /^[a-f0-9]{48}$/.test(code);
    const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
    function imageUrl(value) {
        if (!value) return '';
        try {
            const url = new URL(value, location.href);
            return url.protocol === 'https:' || (url.origin === location.origin && url.protocol === 'http:') ? url.href : '';
        } catch { return ''; }
    }
    function newCode() {
        return Array.from(crypto.getRandomValues(new Uint8Array(24)), b => b.toString(16).padStart(2, '0')).join('');
    }
    function phone(value) {
        const raw = String(value || '').trim().replace(/[\s()-]/g, '');
        if (!raw) return null;
        const normalized = raw.startsWith('+') ? raw : '+' + raw;
        if (!/^\+[1-9][0-9]{7,14}$/.test(normalized)) throw new Error('Revisa el teléfono e incluye el código del país, por ejemplo +51987654321.');
        return normalized;
    }
    function username(value) {
        const raw = String(value || '').trim().replace(/^@/, '').toLowerCase();
        if (!raw) return null;
        if (!/^[a-z0-9_.]{3,35}$/.test(raw) || /^\d+$/.test(raw)) throw new Error('Revisa el usuario de WhatsApp: entre 3 y 35 letras, números, puntos o guiones bajos.');
        return raw;
    }
    async function hashCode(code) {
        if (!validCode(code)) throw new Error('El enlace privado no es válido.');
        const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code));
        return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
    }
    function privateLink(code) {
        if (!validCode(code)) throw new Error('El enlace privado no es válido.');
        return new URL('./', location.href).href + '#acceso=' + code;
    }
    function saveCode(code) {
        if (!validCode(code)) throw new Error('El enlace privado no es válido.');
        try { localStorage.setItem('vega_private_access_v1', code); } catch { /* Still usable in this tab. */ }
        return code;
    }
    function loadCode() {
        const params = new URLSearchParams(location.hash.slice(1));
        const incoming = params.get('acceso');
        if (validCode(incoming)) {
            history.replaceState(null, '', location.pathname + location.search);
            return saveCode(incoming);
        }
        try {
            const saved = localStorage.getItem('vega_private_access_v1');
            return validCode(saved) ? saved : null;
        } catch { return null; }
    }
    function forgetCode() {
        try { localStorage.removeItem('vega_private_access_v1'); } catch { /* No persistent storage. */ }
    }
    window.VegaSecurity = Object.freeze({ escapeHtml, imageUrl, validCode, newCode, hashCode, privateLink, saveCode, loadCode, forgetCode, phone, username });
})();

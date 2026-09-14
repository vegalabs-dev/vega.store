'use strict';
// Closing a window never signs out or clears the saved private access.
(() => {
    const modals = [...document.querySelectorAll('.modal')];
    let current = null, returnFocus = null;
    const visible = modal => !modal.classList.contains('oculto') && getComputedStyle(modal).display !== 'none';
    const focusable = modal => [...modal.querySelectorAll('button,a[href],input,select,textarea,summary,[tabindex="0"]')]
        .filter(el => !el.disabled && !el.closest('[hidden],[inert]') && el.getClientRects().length);
    const closing=new WeakSet();
    const close = async modal => {
        if(closing.has(modal))return;
        closing.add(modal);
        try{if(!await VegaUI.canClose(modal))return;
        if (modal.id === 'modal-compra' && document.getElementById('btn-otro-medio')?.disabled) return;
        if (typeof window.cerrarModal === 'function') window.cerrarModal(modal.id);
        else modal.classList.add('oculto');
        }finally{closing.delete(modal);}
    };
    const sync = () => {
        const top = modals.filter(visible).at(-1) || null;
        document.body.classList.toggle('has-modal',!!top);
        if (top === current) return;
        if (top) {
            if (!current) returnFocus = document.activeElement;
            current = top;VegaUI.clean(top);
            (focusable(top)[0] || top).focus({preventScroll:true});
        } else {
            current = null;
            if (returnFocus?.isConnected) returnFocus.focus({preventScroll:true});
            returnFocus = null;
        }
    };
    modals.forEach(modal => {
        modal.querySelectorAll('.cerrar-modal,.cerrar').forEach(button=>button.removeAttribute('onclick'));
        modal.setAttribute('role','dialog'); modal.setAttribute('aria-modal','true'); modal.tabIndex = -1;
        const heading = modal.querySelector('h2,h3');
        if (heading) { if (!heading.id) heading.id = modal.id+'-titulo'; modal.setAttribute('aria-labelledby',heading.id); }
        modal.addEventListener('click', event => { if (event.target === modal) close(modal); });
        new MutationObserver(sync).observe(modal,{attributes:true,attributeFilter:['class','style']});
    });
    document.addEventListener('click', event => {
        const button = event.target.closest('.cerrar-modal,.cerrar');
        if (button?.closest('.modal')) close(button.closest('.modal'));
    });
    document.addEventListener('keydown', event => {
        if (!current||document.querySelector('.vega-confirm-overlay')) return;
        if (event.key === 'Escape') { event.preventDefault(); close(current); }
        if (event.key === 'Tab') {
            const elements = focusable(current), first = elements[0], last = elements.at(-1);
            if (!first) { event.preventDefault(); current.focus(); }
            else if (event.shiftKey && (document.activeElement === first || !current.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
            else if (!event.shiftKey && (document.activeElement === last || !current.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
        }
    });
    sync();
})();

/* Sets the js class before first paint (CSS hides motion start states only under .js). Everything else is in site.js, loaded with defer. */
document.documentElement.classList.add('js');

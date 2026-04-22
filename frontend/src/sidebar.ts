export function initSidebar(activePage: 'dashboard' | 'chat' | 'credits') {
  document.querySelectorAll<HTMLElement>('.sidebar-item').forEach((item) => {
    if (item.dataset.page === activePage) {
      item.classList.add('active');
    }
  });
}

export function initSidebar(activePage: string, role?: string) {
  document.querySelectorAll<HTMLElement>('.sidebar-item').forEach((item) => {
    if (item.dataset.page === activePage) {
      item.classList.add('active');
    }
  });

  if (role === 'ADMIN') {
    const creditsLink = document.querySelector<HTMLElement>('[data-page="credits"]');
    if (creditsLink) creditsLink.style.display = 'none';
    const sidebar = document.querySelector('.sidebar');
    if (sidebar && !sidebar.querySelector('[data-page="admin"]')) {
      const divider = document.createElement('div');
      divider.className = 'sidebar-divider';

      const link = document.createElement('a');
      link.href = '/admin.html';
      link.className = 'sidebar-item' + (activePage === 'admin' ? ' active' : '');
      link.dataset.page = 'admin';
      link.innerHTML = '<span class="sidebar-icon">⚙</span> Admin Panel';

      sidebar.appendChild(divider);
      sidebar.appendChild(link);
    }
  }
}

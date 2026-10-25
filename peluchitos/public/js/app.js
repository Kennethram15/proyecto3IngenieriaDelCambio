// Funciones compartidas por todas las páginas

// Escapa texto para evitar inyección de HTML (XSS)
function esc(t) {
  return String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const q = n => 'Q' + Number(n).toFixed(2);

// Llamada a la API; lanza Error con el mensaje del servidor si falla
async function api(url, metodo = 'GET', cuerpo) {
  const opts = { method: metodo, headers: {} };
  if (cuerpo !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(cuerpo);
  }
  const r = await fetch(url, opts);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error(data.error || 'Ocurrió un error.');
    err.status = r.status;
    throw err;
  }
  return data;
}

// Mensaje temporal (toast)
function aviso(texto, tipo = 'success') {
  let zona = document.getElementById('toast-zona');
  if (!zona) {
    zona = document.createElement('div');
    zona.id = 'toast-zona';
    document.body.appendChild(zona);
  }
  const d = document.createElement('div');
  d.className = `alert alert-${tipo} shadow-sm mb-2`;
  d.textContent = texto;
  d.setAttribute('role', tipo === 'danger' ? 'alert' : 'status');
  zona.appendChild(d);
  setTimeout(() => d.remove(), 3500);
}

// Barra de navegación según el usuario
async function cargarNav() {
  const { user } = await api('/api/auth/yo');
  const nav = document.getElementById('nav');
  let links = '<li class="nav-item"><a class="nav-link" href="/index.html">Catálogo</a></li>';
  if (user && user.rol === 'cliente') {
    links += '<li class="nav-item"><a class="nav-link" href="/carrito.html">🛒 Carrito</a></li>' +
             '<li class="nav-item"><a class="nav-link" href="/pedidos.html">Mis pedidos</a></li>';
  }
  if (user && user.rol === 'admin') {
    links += '<li class="nav-item"><a class="nav-link" href="/admin.html">Panel admin</a></li>';
  }
  const derecha = user
    ? `<span class="navbar-text me-3">Hola, ${esc(user.nombre)}</span><button class="btn btn-light btn-sm" id="btn-salir">Salir</button>`
    : '<a class="btn btn-light btn-sm" href="/login.html">Ingresar</a>';
  nav.innerHTML = `
    <nav class="navbar navbar-expand-md">
      <div class="container">
        <a class="navbar-brand" href="/index.html"><span class="brand-icon" aria-hidden="true">🧸</span> Peluchitos</a>
        <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#menu" aria-controls="menu" aria-expanded="false" aria-label="Abrir menú de navegación"><span class="navbar-toggler-icon"></span></button>
        <div class="collapse navbar-collapse" id="menu">
          <ul class="navbar-nav me-auto">${links}</ul>
          <div class="d-flex align-items-center">${derecha}</div>
        </div>
      </div>
    </nav>`;
  const pagina = location.pathname === '/' ? '/index.html' : location.pathname;
  nav.querySelectorAll('.nav-link').forEach(link => {
    if (link.getAttribute('href') === pagina) {
      link.classList.add('active');
      link.setAttribute('aria-current', 'page');
    }
  });
  if (!document.querySelector('.site-footer')) {
    const footer = document.createElement('footer');
    footer.className = 'site-footer';
    footer.innerHTML = '<span><strong>Peluchitos</strong> · Pequeños amigos, grandes abrazos.</span><span>Un rincón para encontrar tu próximo favorito ♡</span>';
    document.body.appendChild(footer);
  }
  const salir = document.getElementById('btn-salir');
  if (salir) salir.onclick = async () => { await api('/api/auth/logout', 'POST'); location.href = '/index.html'; };
  return user;
}

const COLOR_ESTADO = {
  Pendiente: 'secondary', Pagado: 'info', Despachado: 'primary',
  Enviado: 'warning', Entregado: 'success', Cancelado: 'danger'
};
const badge = e => `<span class="badge text-bg-${COLOR_ESTADO[e] || 'secondary'}">${esc(e)}</span>`;

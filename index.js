// ── Configuración ────────────────────────────────────────────────────
const WORKER_URL = "https://fsspays.jorgitoa0109.workers.dev";
// Llave de identidad (pública) de Bold
const BOLD_API_KEY = "1A8CeHXY_vTtYlGwwUBAYGkMjtpOEwYYRatl0nBfOa8";
const BOLD_LIBRARY = "https://checkout.bold.co/library/boldPaymentButton.js";
const REDIRECT_URL =
  "https://andrevlare.github.io/FSS-Uniform-Form/pago-terminado";

// ── Estado ───────────────────────────────────────────────────────────
// catalog: { colegio: { grupo: { prenda: { talla: precio } } } }
let catalog = {};
let contadorEstudiantes = 0;
let ultimoTotalMostrado = 0;

// ── Acceso al catálogo ───────────────────────────────────────────────
const getGrupos = (colegio) => Object.keys(catalog[colegio] ?? {});
const getPrendas = (colegio, grupo) =>
  Object.keys(catalog[colegio]?.[grupo] ?? {});
const getTallas = (colegio, grupo, prenda) =>
  Object.keys(catalog[colegio]?.[grupo]?.[prenda] ?? {});
const getPrecio = (colegio, grupo, prenda, talla) =>
  catalog[colegio]?.[grupo]?.[prenda]?.[talla] ?? 0;

function getColegioSeleccionado() {
  return document.getElementById("colegio").value;
}

function escapeHtml(str) {
  return String(str).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}

// ── Cargar catálogo ──────────────────────────────────────────────────
async function cargarCatalogo() {
  mostrarEstadoCatalogo("cargando");
  try {
    const res = await fetch(`${WORKER_URL}/catalog`);
    if (!res.ok) throw new Error(`status ${res.status}`);
    catalog = await res.json();
    poblarColegios();
    mostrarEstadoCatalogo("listo");
  } catch (err) {
    console.error("Error al cargar el catálogo:", err);
    mostrarEstadoCatalogo("error");
  }
}

function mostrarEstadoCatalogo(estado) {
  document.getElementById("colegio-skeleton").hidden = estado !== "cargando";
  document.getElementById("colegio").hidden = estado !== "listo";
  document.getElementById("catalog-error").hidden = estado !== "error";
}

function poblarColegios() {
  const select = document.getElementById("colegio");
  select.innerHTML =
    '<option value="" disabled selected>Selecciona el colegio</option>';
  Object.keys(catalog).forEach((colegio) => {
    const opt = document.createElement("option");
    opt.value = colegio;
    opt.textContent = colegio;
    select.appendChild(opt);
  });
}

// ── Cambios globales (delegación de eventos) ────────────────────────
document.addEventListener("change", (e) => {
  if (e.target.id === "colegio") {
    onColegioChange();
  }
  if (e.target.matches("[data-talla-general]")) {
    aplicarTallaGeneral(e.target.closest(".grupo-card"), e.target.value);
  }
  if (e.target.matches("[data-prenda]")) {
    calcularTotal();
    e.target.closest(".student-card")?.querySelector(".card-error")?.remove();
  }
});

document.addEventListener("click", (e) => {
  // Cierra cualquier menú de "agregar grupo" abierto si el click fue afuera
  document.querySelectorAll("[data-add-grupo-menu]").forEach((menu) => {
    if (menu.hidden) return;
    const wrap = menu.closest(".add-grupo-wrap");
    if (!wrap.contains(e.target)) menu.hidden = true;
  });

  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  const action = btn.dataset.action;

  if (action === "eliminar-estudiante") {
    eliminarEstudiante(btn.closest(".student-card").dataset.id);
  } else if (action === "toggle-add-grupo") {
    const menu = btn
      .closest(".add-grupo-wrap")
      .querySelector("[data-add-grupo-menu]");
    menu.hidden = !menu.hidden;
  } else if (action === "agregar-grupo") {
    agregarGrupo(btn.closest(".student-card"), btn.dataset.grupo);
  } else if (action === "eliminar-grupo") {
    const card = btn.closest(".student-card");
    const grupoEl = btn.closest(".grupo-card");
    grupoEl.classList.add("removing");
    grupoEl.addEventListener(
      "animationend",
      () => {
        grupoEl.remove();
        actualizarMenuAgregarGrupo(card);
        calcularTotal();
      },
      { once: true },
    );
  } else if (action === "toggle-nota") {
    const notaInput = btn.closest(".prenda-row").querySelector("[data-nota]");
    notaInput.hidden = !notaInput.hidden;
    if (!notaInput.hidden) notaInput.focus();
  } else if (action === "reintentar-catalogo") {
    cargarCatalogo();
  }
});

// ── Colegio: al cambiar, cada tarjeta de estudiante se refresca ────────
function onColegioChange() {
  document.getElementById("colegio-error").textContent = "";
  document.getElementById("colegio").classList.remove("invalid");
  document.querySelectorAll(".student-card").forEach((card) => {
    card.querySelector("[data-grupos]").innerHTML = "";
    refrescarTarjeta(card);
  });
  calcularTotal();
}

function refrescarTarjeta(card) {
  const colegio = getColegioSeleccionado();
  const empty = card.querySelector("[data-grupos-empty]");
  const list = card.querySelector("[data-grupos]");
  const addWrap = card.querySelector("[data-add-grupo-wrap]");

  if (!colegio) {
    empty.hidden = false;
    list.hidden = true;
    addWrap.hidden = true;
    return;
  }

  empty.hidden = true;
  list.hidden = false;
  actualizarMenuAgregarGrupo(card);
}

// ── Grupos y prendas ─────────────────────────────────────────────────
function actualizarMenuAgregarGrupo(card) {
  const colegio = getColegioSeleccionado();
  const wrap = card.querySelector("[data-add-grupo-wrap]");
  const btn = wrap.querySelector(".btn-add-grupo");
  const menu = wrap.querySelector("[data-add-grupo-menu]");

  if (!colegio) {
    wrap.hidden = true;
    return;
  }
  wrap.hidden = false;

  const existentes = new Set(
    Array.from(card.querySelectorAll(".grupo-card")).map(
      (g) => g.dataset.grupo,
    ),
  );
  const disponibles = getGrupos(colegio).filter((g) => !existentes.has(g));

  if (disponibles.length === 0) {
    btn.hidden = true;
    menu.hidden = true;
    menu.innerHTML = "";
    return;
  }

  btn.hidden = false;
  menu.innerHTML = disponibles
    .map(
      (g) =>
        `<button type="button" class="add-grupo-item" data-action="agregar-grupo" data-grupo="${escapeHtml(g)}">${escapeHtml(g)}</button>`,
    )
    .join("");
}

function agregarGrupo(card, grupo) {
  const colegio = getColegioSeleccionado();
  const list = card.querySelector("[data-grupos]");
  list.appendChild(crearGrupoCard(colegio, grupo));
  card.querySelector("[data-add-grupo-menu]").hidden = true;
  actualizarMenuAgregarGrupo(card);
  card.querySelector(".card-error")?.remove();
  calcularTotal();
}

function crearGrupoCard(colegio, grupo) {
  const div = document.createElement("div");
  div.className = "grupo-card";
  div.dataset.grupo = grupo;

  const prendas = getPrendas(colegio, grupo);
  const tallasUnion = [
    ...new Set(prendas.flatMap((p) => getTallas(colegio, grupo, p))),
  ];

  div.innerHTML = `
    <div class="grupo-header">
      <span class="grupo-title">${escapeHtml(grupo)}</span>
      <div class="grupo-header-right">
        <select class="talla-general" data-talla-general aria-label="Talla general para ${escapeHtml(grupo)}">
          <option value="">Talla…</option>
          ${tallasUnion.map((t) => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join("")}
        </select>
        <button type="button" class="btn-remove-grupo" data-action="eliminar-grupo" aria-label="Quitar ${escapeHtml(grupo)}">✕</button>
      </div>
    </div>
    <div class="prendas-list">
      ${prendas.map((p) => filaPrendaHtml(colegio, grupo, p)).join("")}
    </div>
  `;

  return div;
}

function filaPrendaHtml(colegio, grupo, prenda) {
  const tallas = getTallas(colegio, grupo, prenda);
  const opciones = tallas
    .map((t) => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`)
    .join("");

  return `
    <div class="prenda-row">
      <span class="prenda-nombre">${escapeHtml(prenda)}</span>
      <select data-prenda="${escapeHtml(prenda)}" aria-label="Talla de ${escapeHtml(prenda)}">
        <option value="">— No llevar —</option>
        ${opciones}
      </select>
      <button type="button" class="btn-nota-toggle" data-action="toggle-nota" aria-label="Agregar nota para ${escapeHtml(prenda)}">📝</button>
      <input type="text" class="nota-input" data-nota hidden placeholder="¿Algo especial para esta prenda?" />
    </div>
  `;
}

// La talla general solo aplica a las prendas del grupo que tienen esa talla.
// Si una prenda no la tiene, queda sin seleccionar: el padre debe elegirla.
function aplicarTallaGeneral(grupoEl, talla) {
  const colegio = getColegioSeleccionado();
  const grupo = grupoEl.dataset.grupo;

  grupoEl.querySelectorAll("[data-prenda]").forEach((sel) => {
    const prenda = sel.dataset.prenda;
    const tallas = getTallas(colegio, grupo, prenda);
    sel.value = tallas.includes(talla) ? talla : "";
  });

  calcularTotal();
}

// ── Total ────────────────────────────────────────────────────────────
function calcularTotal() {
  const colegio = getColegioSeleccionado();
  let total = 0;
  let prendas = 0;
  let estudiantes = 0;

  document.querySelectorAll(".student-card").forEach((card) => {
    let tieneAlgo = false;
    card.querySelectorAll(".grupo-card").forEach((grupoEl) => {
      const grupo = grupoEl.dataset.grupo;
      grupoEl.querySelectorAll("[data-prenda]").forEach((sel) => {
        if (!sel.value) return;
        total += getPrecio(colegio, grupo, sel.dataset.prenda, sel.value);
        prendas++;
        tieneAlgo = true;
      });
    });
    if (tieneAlgo) estudiantes++;
  });

  actualizarTotalUI(total, prendas, estudiantes);
  return total;
}

function actualizarTotalUI(total, prendas, estudiantes) {
  const valueEl = document.getElementById("total-value");
  const subEl = document.getElementById("total-sub");

  if (total !== ultimoTotalMostrado) {
    valueEl.classList.remove("pulse");
    void valueEl.offsetWidth; // fuerza reflow para reiniciar la animación
    valueEl.classList.add("pulse");
  }
  ultimoTotalMostrado = total;

  valueEl.textContent = `$${total.toLocaleString("es-CO")}`;
  subEl.textContent =
    prendas === 0
      ? "Agrega prendas para ver el total"
      : `${prendas} prenda${prendas === 1 ? "" : "s"} · ${estudiantes} estudiante${estudiantes === 1 ? "" : "s"}`;
}

// ── Tarjeta de estudiante ────────────────────────────────────────────
function crearTarjetaEstudiante(numero) {
  const id = ++contadorEstudiantes;
  const div = document.createElement("div");
  div.className = "student-card";
  div.dataset.id = id;

  div.innerHTML = `
    <div class="student-header">
      <div class="student-num">
        <div class="badge">${numero}</div>
        <span class="student-label">Estudiante ${numero}</span>
      </div>
      <button type="button" class="btn-remove" data-action="eliminar-estudiante" ${numero === 1 ? "disabled" : ""}>
        ✕ Eliminar
      </button>
    </div>
    <div class="fields">
      <div class="field">
        <label>Código del estudiante</label>
        <input name="code_${id}" inputmode="numeric" placeholder="Ej: 20240123">
        <span class="field-error"></span>
      </div>
      <div class="field">
        <label>Nombre completo</label>
        <input name="name_${id}" placeholder="Nombre del estudiante">
        <span class="field-error"></span>
      </div>
      <div class="field full">
        <label>Grupo<span class="opt">(opcional)</span></label>
        <input name="curso_${id}" placeholder="Ej: Kinder A">
      </div>
    </div>

    <div class="grupos-empty" data-grupos-empty>
      Selecciona el colegio para ver los grupos disponibles
    </div>
    <div class="grupos-list" data-grupos hidden></div>

    <div class="add-grupo-wrap" data-add-grupo-wrap hidden>
      <button type="button" class="btn-add-grupo" data-action="toggle-add-grupo">
        + Agregar grupo
      </button>
      <div class="add-grupo-menu" data-add-grupo-menu hidden></div>
    </div>
  `;

  return div;
}

function agregarEstudiante() {
  const contenedor = document.getElementById("estudiantes");
  const numero = contenedor.children.length + 1;
  const tarjeta = crearTarjetaEstudiante(numero);
  contenedor.appendChild(tarjeta);
  refrescarTarjeta(tarjeta);
  actualizarBotonesEliminar();
}

function eliminarEstudiante(id) {
  const tarjeta = document.querySelector(`.student-card[data-id="${id}"]`);
  if (!tarjeta) return;
  tarjeta.classList.add("removing");
  tarjeta.addEventListener(
    "animationend",
    () => {
      tarjeta.remove();
      renumerarEstudiantes();
      actualizarBotonesEliminar();
      calcularTotal();
    },
    { once: true },
  );
}

function renumerarEstudiantes() {
  document.querySelectorAll(".student-card").forEach((t, i) => {
    t.querySelector(".badge").textContent = i + 1;
    t.querySelector(".student-label").textContent = `Estudiante ${i + 1}`;
  });
}

function actualizarBotonesEliminar() {
  const tarjetas = document.querySelectorAll(".student-card");
  tarjetas.forEach((t) => {
    t.querySelector(".btn-remove").disabled = tarjetas.length === 1;
  });
}

// ── Validación ───────────────────────────────────────────────────────
function setError(el, mensaje) {
  el.classList.add("invalid");
  const err = el.parentElement.querySelector(".field-error");
  if (err) err.textContent = mensaje;
}

function limpiarErrores() {
  document.querySelectorAll(".field-error").forEach((e) => (e.textContent = ""));
  document.querySelectorAll(".invalid").forEach((e) => e.classList.remove("invalid"));
  document.querySelectorAll(".card-error").forEach((e) => e.remove());
  document.getElementById("submit-error").textContent = "";
}

function validarFormulario() {
  limpiarErrores();
  let primerError = null;
  const marcar = (el) => {
    primerError = primerError || el;
  };

  const colegioEl = document.getElementById("colegio");
  if (!colegioEl.value) {
    setError(colegioEl, "Selecciona el colegio");
    marcar(colegioEl);
  }

  [
    ["nombre_padre", "Ingresa tu nombre completo"],
    ["email", "Ingresa tu correo electrónico"],
    ["telefono", "Ingresa un teléfono de contacto"],
    ["direccion", "Ingresa tu dirección"],
    ["cedula", "Ingresa tu número de cédula"],
  ].forEach(([id, msg]) => {
    const el = document.getElementById(id);
    if (!el.value.trim()) {
      setError(el, msg);
      marcar(el);
    }
  });

  const emailEl = document.getElementById("email");
  const email = emailEl.value.trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    setError(emailEl, "El correo no parece válido");
    marcar(emailEl);
  }

  document.querySelectorAll(".student-card").forEach((card) => {
    const id = card.dataset.id;
    const codeEl = card.querySelector(`[name="code_${id}"]`);
    const nameEl = card.querySelector(`[name="name_${id}"]`);

    if (!codeEl.value.trim()) {
      setError(codeEl, "Falta el código del estudiante");
      marcar(codeEl);
    }
    if (!nameEl.value.trim()) {
      setError(nameEl, "Falta el nombre del estudiante");
      marcar(nameEl);
    }

    const tienePrendas = Array.from(
      card.querySelectorAll("[data-prenda]"),
    ).some((sel) => sel.value);

    if (!tienePrendas) {
      const nombre = nameEl.value.trim() || `Estudiante ${id}`;
      const banner = document.createElement("div");
      banner.className = "card-error";
      banner.textContent = `${nombre} no tiene prendas seleccionadas`;
      card.querySelector(".student-header").after(banner);
      marcar(banner);
    }
  });

  const total = calcularTotal();
  if (total < 1000) {
    document.getElementById("total-error").textContent =
      "El monto mínimo es $1.000";
    marcar(document.getElementById("total-bar"));
  }

  const t1 = document.getElementById("terminos-produccion");
  const t2 = document.getElementById("terminos-datos");
  if (!t1.checked || !t2.checked) {
    document.getElementById("autorizaciones-error").textContent =
      "Debes aceptar las autorizaciones";
    marcar(t1.checked ? t2 : t1);
  }

  if (primerError) {
    primerError.scrollIntoView({ behavior: "smooth", block: "center" });
    if (typeof primerError.focus === "function") {
      primerError.focus({ preventScroll: true });
    }
    return false;
  }

  return true;
}

// ── Recolectar datos ─────────────────────────────────────────────────
function recolectarDatos() {
  const parent_name = document.getElementById("nombre_padre").value.trim();

  const students = Array.from(document.querySelectorAll(".student-card")).map(
    (card) => {
      const id = card.dataset.id;
      const items = [];

      card.querySelectorAll("[data-grupo]").forEach((grupoEl) => {
        const grupo = grupoEl.dataset.grupo;

        grupoEl.querySelectorAll("[data-prenda]").forEach((sel) => {
          const size = sel.value;
          if (!size) return; // "No llevar" → se omite

          const notaEl = sel.closest(".prenda-row").querySelector("[data-nota]");
          const nota = notaEl?.value.trim();

          items.push({
            grupo,
            prenda: sel.dataset.prenda,
            size,
            notas: nota || null,
          });
        });
      });

      return {
        code: card.querySelector(`[name="code_${id}"]`).value.trim(),
        name: card.querySelector(`[name="name_${id}"]`).value.trim(),
        curso: card.querySelector(`[name="curso_${id}"]`).value.trim() || null,
        items,
      };
    },
  );

  return {
    parent_name,
    email: document.getElementById("email").value.trim(),
    phone: document.getElementById("telefono").value.trim(),
    direction: document.getElementById("direccion").value.trim(),
    identification: document.getElementById("cedula").value.trim(),
    school: getColegioSeleccionado(),
    concept: `Uniformes — ${parent_name}`,
    notas: document.getElementById("notas_pedido").value.trim() || null,
    students,
  };
}

// ── Submit ───────────────────────────────────────────────────────────
document.getElementById("form").addEventListener("submit", async (e) => {
  e.preventDefault();

  if (!validarFormulario()) return;

  ponerCargando(true);

  try {
    const datos = recolectarDatos();

    const res = await fetch(`${WORKER_URL}/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(datos),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || "Error del servidor");
    }

    // El Worker devuelve el monto en pesos (Bold no usa centavos) y el hash
    // de integridad: SHA256(orderId + amount + currency + LlaveSecreta).
    const { orderId, amount, currency, integritySignature } = await res.json();

    const totalMostrado = calcularTotal();
    if (amount !== totalMostrado) {
      const seguir = confirm(
        `El precio se actualizó.\n\n` +
          `Total mostrado: $${totalMostrado.toLocaleString("es-CO")}\n` +
          `Total a pagar:  $${amount.toLocaleString("es-CO")}\n\n` +
          `¿Deseas continuar con el pago?`,
      );
      if (!seguir) {
        await cargarCatalogo();
        ponerCargando(false);
        return;
      }
    }

    // Abrir la pasarela de Bold (Embedded Checkout) con los datos de la venta
    abrirCheckoutBold({ orderId, amount, currency, integritySignature, datos });
  } catch (err) {
    document.getElementById("submit-error").textContent =
      `${err.message}. Por favor intenta de nuevo.`;
    ponerCargando(false);
  }
});

function ponerCargando(activo) {
  const btn = document.getElementById("btn-submit");
  const spinner = document.getElementById("spinner");
  const texto = document.getElementById("btn-texto");
  const form = document.getElementById("form");

  btn.disabled = activo;
  spinner.classList.toggle("active", activo);
  texto.textContent = activo ? "Procesando…" : "Pagar →";
  form.classList.toggle("is-loading", activo);
}

// ── Checkout de Bold ─────────────────────────────────────────────────
function abrirCheckoutBold({
  orderId,
  amount,
  currency,
  integritySignature,
  datos,
}) {
  const container = document.getElementById("bold-button-container");
  container.innerHTML = "";

  // Datos del comprador para precargar el formulario de pago de Bold
  const customerData = JSON.stringify({
    email: datos.email,
    fullName: datos.parent_name,
    phone: datos.phone,
    dialCode: "+57",
    documentNumber: datos.identification,
    documentType: "CC",
  });
  const billingAddress = JSON.stringify({
    address: datos.direction,
    country: "CO",
  });

  const script = document.createElement("script");
  // La librería se carga junto con el botón: si se carga antes (en el <head>),
  // escanea el DOM cuando este script todavía no existe y no lo renderiza.
  script.src = BOLD_LIBRARY;
  script.setAttribute("data-bold-button", "dark-L");
  script.setAttribute("data-api-key", BOLD_API_KEY);
  script.setAttribute("data-order-id", orderId);
  script.setAttribute("data-currency", currency || "COP");
  script.setAttribute("data-amount", amount);
  script.setAttribute("data-integrity-signature", integritySignature);
  script.setAttribute("data-redirection-url", REDIRECT_URL);
  script.setAttribute("data-description", datos.concept);
  script.setAttribute("data-render-mode", "embedded");
  script.setAttribute("data-customer-data", customerData);
  script.setAttribute("data-billing-address", billingAddress);
  container.appendChild(script);

  // Bold renderiza un <button> tras el script; lo pulsamos para abrir el modal
  esperarBotonBold(container).then((boldBtn) => {
    if (boldBtn) {
      boldBtn.click();
    } else {
      document.getElementById("submit-error").textContent =
        "No se pudo abrir la pasarela de pago. Intenta de nuevo.";
    }
    ponerCargando(false);
  });
}

function esperarBotonBold(container, intentos = 50) {
  return new Promise((resolve) => {
    let n = 0;
    const timer = setInterval(() => {
      // Bold renderiza un custom element <bold-payment-button> y monta el
      // botón real dentro de su Shadow DOM.
      const host = container.querySelector("bold-payment-button");
      const boldBtn = host?.shadowRoot?.querySelector("button");

      if (boldBtn) {
        clearInterval(timer);
        resolve(boldBtn);
      } else if (++n >= intentos) {
        clearInterval(timer);
        resolve(null);
      }
    }, 100);
  });
}

// ── Inicio ───────────────────────────────────────────────────────────
document
  .getElementById("btn-agregar")
  .addEventListener("click", agregarEstudiante);
document
  .getElementById("btn-retry-catalog")
  .addEventListener("click", cargarCatalogo);

agregarEstudiante();
cargarCatalogo();

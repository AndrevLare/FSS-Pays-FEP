// ── Configuración ────────────────────────────────────────────────────
const WORKER_URL = "https://fsspays.jorgitoa0109.workers.dev";
// Llave de identidad (pública) de Bold
const BOLD_API_KEY = "1A8CeHXY_vTtYlGwwUBAYGkMjtpOEwYYRatl0nBfOa8";
const BOLD_LIBRARY = "https://checkout.bold.co/library/boldPaymentButton.js";
const REDIRECT_URL =
  "https://andrevlare.github.io/FSS-Uniform-Form/pago-terminado";

// ── Estado ───────────────────────────────────────────────────────────
let catalog = {};
let contadorEstudiantes = 0;

// ── Cargar catálogo ──────────────────────────────────────────────────
async function cargarCatalogo() {
  try {
    const res = await fetch(`${WORKER_URL}/catalog`);
    catalog = await res.json();
    poblarColegios();
  } catch (err) {
    console.error("Error al cargar el catálogo:", err);
    alert("No se pudo cargar el catálogo. Por favor recargue la página.");
  }
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

// ── Cuando cambia el colegio ─────────────────────────────────────────
document.addEventListener("change", (e) => {
  if (e.target.id === "colegio") {
    actualizarDropdownsEstudiantes();
    calcularTotal();
  }
  if (e.target.dataset.tipo === "curso") {
    const card = e.target.closest(".student-card");
    actualizarTallas(card);
    calcularTotal();
  }
  if (e.target.dataset.tipo === "talla") {
    calcularTotal();
  }
});

function getCursosDelColegio() {
  const colegio = document.getElementById("colegio").value;
  if (!colegio || !catalog[colegio]) return [];
  return Object.keys(catalog[colegio]);
}

function getTallasDelCurso(colegio, curso) {
  if (!catalog[colegio] || !catalog[colegio][curso]) return [];
  return Object.keys(catalog[colegio][curso]);
}

function actualizarDropdownsEstudiantes() {
  document.querySelectorAll(".student-card").forEach((card) => {
    actualizarCursos(card);
    actualizarTallas(card);
  });
}

function actualizarCursos(card) {
  const selectCurso = card.querySelector('[data-tipo="curso"]');
  const cursos = getCursosDelColegio();
  selectCurso.innerHTML =
    '<option value="" disabled selected>Seleccionar curso</option>';
  cursos.forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c;
    selectCurso.appendChild(opt);
  });
  actualizarTallas(card);
}

function actualizarTallas(card) {
  const colegio = document.getElementById("colegio").value;
  const selectCurso = card.querySelector('[data-tipo="curso"]');
  const selectTalla = card.querySelector('[data-tipo="talla"]');
  const curso = selectCurso.value;

  selectTalla.innerHTML =
    '<option value="" disabled selected>Seleccionar talla</option>';

  if (!colegio || !curso) return;

  getTallasDelCurso(colegio, curso).forEach((t) => {
    const precio = catalog[colegio][curso][t];
    const opt = document.createElement("option");
    opt.value = t;
    opt.textContent = `${t} — $${precio.toLocaleString("es-CO")}`;
    selectTalla.appendChild(opt);
  });
}

// ── Calcular total ───────────────────────────────────────────────────
function calcularTotal() {
  const colegio = document.getElementById("colegio").value;
  let total = 0;

  document.querySelectorAll(".student-card").forEach((card) => {
    const curso = card.querySelector('[data-tipo="curso"]').value;
    const talla = card.querySelector('[data-tipo="talla"]').value;
    if (colegio && curso && talla && catalog[colegio]?.[curso]?.[talla]) {
      total += catalog[colegio][curso][talla];
    }
  });

  document.getElementById("total-display").textContent =
    total > 0 ? `$${total.toLocaleString("es-CO")}` : "$0";
}

// ── Crear tarjeta de estudiante ──────────────────────────────────────
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
      <button type="button" class="btn-remove" onclick="eliminarEstudiante(${id})" ${numero === 1 ? "disabled" : ""}>
        ✕ Eliminar
      </button>
    </div>
    <div class="fields">
      <div class="field">
        <label>Código del estudiante</label>
        <input name="code_${id}" placeholder="Ej: 20240123" required>
      </div>
      <div class="field">
        <label>Nombre completo</label>
        <input name="name_${id}" placeholder="Nombre del estudiante" required>
      </div>
      <div class="field">
        <label>Curso</label>
        <select name="school_year_${id}" data-tipo="curso" required>
          <option value="" disabled selected>Seleccionar curso</option>
        </select>
      </div>
      <div class="field">
        <label>Talla</label>
        <select name="size_${id}" data-tipo="talla" required>
          <option value="" disabled selected>Seleccionar talla</option>
        </select>
      </div>
    </div>
  `;

  return div;
}

function agregarEstudiante() {
  const contenedor = document.getElementById("estudiantes");
  const numero = contenedor.children.length + 1;
  const tarjeta = crearTarjetaEstudiante(numero);
  contenedor.appendChild(tarjeta);

  // Poblar cursos si ya hay un colegio seleccionado
  const colegio = document.getElementById("colegio").value;
  if (colegio) actualizarCursos(tarjeta);

  actualizarBotones();
}

function eliminarEstudiante(id) {
  const tarjeta = document.querySelector(`[data-id="${id}"]`);
  if (!tarjeta) return;
  tarjeta.classList.add("removing");
  tarjeta.addEventListener("animationend", () => {
    tarjeta.remove();
    renumerarEstudiantes();
    actualizarBotones();
    calcularTotal();
  });
}

function renumerarEstudiantes() {
  document.querySelectorAll(".student-card").forEach((t, i) => {
    t.querySelector(".badge").textContent = i + 1;
    t.querySelector(".student-label").textContent = `Estudiante ${i + 1}`;
  });
}

function actualizarBotones() {
  const tarjetas = document.querySelectorAll(".student-card");
  tarjetas.forEach((t) => {
    t.querySelector(".btn-remove").disabled = tarjetas.length === 1;
  });
}

// ── Recolectar datos ─────────────────────────────────────────────────
function recolectarDatos() {
  const tarjetas = document.querySelectorAll(".student-card");
  const students = Array.from(tarjetas).map((t) => {
    const id = t.dataset.id;
    return {
      code: t.querySelector(`[name="code_${id}"]`).value.trim(),
      name: t.querySelector(`[name="name_${id}"]`).value.trim(),
      school_year: t.querySelector(`[name="school_year_${id}"]`).value,
      size: t.querySelector(`[name="size_${id}"]`).value,
    };
  });

  const parent_name = document.getElementById("nombre_padre").value.trim();

  return {
    parent_name,
    email: document.getElementById("email").value.trim(),
    phone: document.getElementById("telefono").value.trim(),
    direction: document.getElementById("direccion").value.trim(),
    identification: document.getElementById("cedula").value.trim(),
    school: document.getElementById("colegio").value,
    concept: `Uniformes — ${parent_name}`,
    students,
  };
}

// ── Submit ───────────────────────────────────────────────────────────
document.getElementById("form").addEventListener("submit", async (e) => {
  e.preventDefault();

  const btn = document.getElementById("btn-submit");
  const spinner = document.getElementById("spinner");
  const texto = document.getElementById("btn-texto");

  btn.disabled = true;
  spinner.style.display = "block";
  texto.textContent = "Procesando...";

  try {
    const datos = recolectarDatos();

    const res = await fetch(`${WORKER_URL}/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(datos),
    });

    if (!res.ok) {
      const { error } = await res.json();
      throw new Error(error || "Error del servidor");
    }

    // El Worker devuelve el monto en pesos (Bold no usa centavos) y el hash
    // de integridad: SHA256(orderId + amount + currency + LlaveSecreta).
    const { orderId, amount, currency, integritySignature } = await res.json();

    // Abrir la pasarela de Bold (Embedded Checkout) con los datos de la venta
    abrirCheckoutBold({ orderId, amount, currency, integritySignature, datos });
  } catch (err) {
    alert(`Error: ${err.message}. Por favor intente de nuevo.`);
    restaurarBoton();
  }
});

// ── Checkout de Bold ─────────────────────────────────────────────────
function restaurarBoton() {
  const btn = document.getElementById("btn-submit");
  const spinner = document.getElementById("spinner");
  const texto = document.getElementById("btn-texto");
  btn.disabled = false;
  spinner.style.display = "none";
  texto.textContent = "Continuar al pago →";
}

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
  script.setAttribute("data-amount", amount * 100);
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
      alert("No se pudo abrir la pasarela de pago. Intente de nuevo.");
    }
    restaurarBoton();
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
agregarEstudiante();
cargarCatalogo();

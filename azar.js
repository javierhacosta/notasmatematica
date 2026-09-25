/* =====================================================
   NUEVO: ELECCIÓN ALEATORIA DE ESTUDIANTE EN ASISTENCIA
===================================================== */

function claveAzarAsistencia() {
    const fecha = document.getElementById("fechaAsistencia")?.value || "";
    return `${String(cursoSeleccionado || "").trim()}__${fecha}`;
}


function obtenerDescartadosAzarAsistencia() {
    const clave = claveAzarAsistencia();
    if (!clave || clave === "__") return [];

    try {
        const datos = JSON.parse(localStorage.getItem("azarAsistenciaDescartados") || "{}");
        const lista = datos[clave];
        return Array.isArray(lista) ? lista.map(String) : [];
    } catch (error) {
        console.warn("No se pudo leer la lista de estudiantes descartados del azar:", error);
        return [];
    }
}

async function guardarDescartadosAzarAsistencia(lista) {
    const clave = claveAzarAsistencia();
    if (!clave || clave === "__") return;

    const listaNormalizada = [...new Set((lista || []).map(String))];

    // Guardar en Supabase primero. Así, si la BD rechaza la operación,
    // no se oculta el error sobrescribiendo el estado local.
    await sincronizarDescartadosAzarAsistenciaBD(listaNormalizada);

    try {
        const datos = JSON.parse(localStorage.getItem("azarAsistenciaDescartados") || "{}");
        datos[clave] = listaNormalizada;
        localStorage.setItem("azarAsistenciaDescartados", JSON.stringify(datos));
    } catch (error) {
        console.warn("No se pudo guardar la lista de estudiantes descartados del azar:", error);
    }
}

async function cargarDescartadosAzarAsistenciaBD() {
    const curso = String(cursoSeleccionado || "").trim();
    const fecha = document.getElementById("fechaAsistencia")?.value || "";
    if (!curso || !fecha) return;

    try {
        const { data, error } = await supabaseClient
            .from(TABLA_AZAR_ASISTENCIA_DESCARTADOS_BD)
            .select("estudiante_id")
            .eq("curso", curso)
            .eq("fecha", fecha);

        if (error) throw error;

        const listaBD = (data || []).map(r => String(r.estudiante_id));
        const datos = JSON.parse(localStorage.getItem("azarAsistenciaDescartados") || "{}");
        datos[`${curso}__${fecha}`] = listaBD;
        localStorage.setItem("azarAsistenciaDescartados", JSON.stringify(datos));

        actualizarEstadoBotonElegirAzarAsistencia();

        const listaEl = document.getElementById("azarAsistenciaLista");
        if (listaEl && !listaEl.classList.contains("oculto")) {
            mostrarPorElegirAzarAsistencia();
        }
    } catch (error) {
        console.warn("No se pudo cargar desde BD la lista de descartados del azar:", error);
    }
}

async function sincronizarDescartadosAzarAsistenciaBD(lista) {
    const curso = String(cursoSeleccionado || "").trim();
    const fecha = document.getElementById("fechaAsistencia")?.value || "";
    if (!curso || !fecha) return;

    const listaNormalizada = [...new Set((lista || []).map(String))];

    // Sincronización completa sin depender de una restricción UNIQUE.
    const { data: existentes, error: errorExistentes } = await supabaseClient
        .from(TABLA_AZAR_ASISTENCIA_DESCARTADOS_BD)
        .select("estudiante_id")
        .eq("curso", curso)
        .eq("fecha", fecha);

    if (errorExistentes) throw errorExistentes;

    const idsNuevos = new Set(listaNormalizada);
    const idsEliminar = (existentes || [])
        .map(r => String(r.estudiante_id))
        .filter(id => !idsNuevos.has(id));

    if (idsEliminar.length > 0) {
        const { error: errorEliminar } = await supabaseClient
            .from(TABLA_AZAR_ASISTENCIA_DESCARTADOS_BD)
            .delete()
            .eq("curso", curso)
            .eq("fecha", fecha)
            .in("estudiante_id", idsEliminar);

        if (errorEliminar) throw errorEliminar;
    }

    const idsExistentes = new Set((existentes || []).map(r => String(r.estudiante_id)));
    const idsInsertar = listaNormalizada.filter(id => !idsExistentes.has(id));

    if (idsInsertar.length > 0) {
        const registros = idsInsertar.map(estudianteId => ({
            curso,
            fecha,
            estudiante_id: estudianteId
        }));

        const { error: errorGuardar } = await supabaseClient
            .from(TABLA_AZAR_ASISTENCIA_DESCARTADOS_BD)
            .insert(registros);

        if (errorGuardar) throw errorGuardar;
    }
}

function obtenerElegidosAzarAsistencia() {
    const clave = claveAzarAsistencia();
    if (!clave || clave === "__") return [];

    try {
        const datos = JSON.parse(localStorage.getItem("azarAsistenciaElegidos") || "{}");
        const lista = datos[clave];
        return Array.isArray(lista) ? lista.map(String) : [];
    } catch (error) {
        console.warn("No se pudo leer la lista de estudiantes elegidos al azar:", error);
        return [];
    }
}

function guardarElegidosAzarAsistencia(lista) {
    const clave = claveAzarAsistencia();
    if (!clave || clave === "__") return;

    const listaNormalizada = [...new Set((lista || []).map(String))];

    try {
        const datos = JSON.parse(localStorage.getItem("azarAsistenciaElegidos") || "{}");
        datos[clave] = listaNormalizada;
        localStorage.setItem("azarAsistenciaElegidos", JSON.stringify(datos));
    } catch (error) {
        console.warn("No se pudo guardar la lista de estudiantes elegidos al azar:", error);
    }

    sincronizarElegidosAzarAsistenciaBD(listaNormalizada).catch(error => {
        console.warn("No se pudo guardar en BD la lista de estudiantes elegidos al azar:", error);
    });
}

async function cargarElegidosAzarAsistenciaBD() {
    const curso = String(cursoSeleccionado || "").trim();
    const fecha = document.getElementById("fechaAsistencia")?.value || "";
    if (!curso || !fecha) return;

    try {
        const { data, error } = await supabaseClient
            .from(TABLA_AZAR_ASISTENCIA_BD)
            .select("estudiante_id,orden")
            .eq("curso", curso)
            .eq("fecha", fecha)
            .order("orden", { ascending: true });

        if (error) throw error;

        const listaBD = (data || []).map(r => String(r.estudiante_id));
        const listaLocal = obtenerElegidosAzarAsistencia();

        // Si existen elecciones antiguas guardadas localmente, se conservan y
        // se migran a la BD la primera vez que se abre esta fecha.
        if (listaBD.length === 0 && listaLocal.length > 0) {
            await sincronizarElegidosAzarAsistenciaBD(listaLocal);
            return;
        }

        const datos = JSON.parse(localStorage.getItem("azarAsistenciaElegidos") || "{}");
        datos[`${curso}__${fecha}`] = listaBD;
        localStorage.setItem("azarAsistenciaElegidos", JSON.stringify(datos));

        actualizarEstadoBotonElegirAzarAsistencia();
        const listaEl = document.getElementById("azarAsistenciaLista");
        if (listaEl && !listaEl.classList.contains("oculto")) {
            mostrarElegidosAzarAsistencia();
        }
    } catch (error) {
        console.warn("No se pudo cargar desde BD la lista de estudiantes elegidos al azar:", error);
    }
}

async function sincronizarElegidosAzarAsistenciaBD(lista) {
    const curso = String(cursoSeleccionado || "").trim();
    const fecha = document.getElementById("fechaAsistencia")?.value || "";
    if (!curso || !fecha) return;

    const listaNormalizada = [...new Set((lista || []).map(String))];

    const { data: existentes, error: errorExistentes } = await supabaseClient
        .from(TABLA_AZAR_ASISTENCIA_BD)
        .select("estudiante_id")
        .eq("curso", curso)
        .eq("fecha", fecha);

    if (errorExistentes) throw errorExistentes;

    const idsNuevos = new Set(listaNormalizada);
    const idsEliminar = (existentes || [])
        .map(r => String(r.estudiante_id))
        .filter(id => !idsNuevos.has(id));

    if (idsEliminar.length > 0) {
        const { error: errorEliminar } = await supabaseClient
            .from(TABLA_AZAR_ASISTENCIA_BD)
            .delete()
            .eq("curso", curso)
            .eq("fecha", fecha)
            .in("estudiante_id", idsEliminar);
        if (errorEliminar) throw errorEliminar;
    }

    if (listaNormalizada.length > 0) {
        const registros = listaNormalizada.map((estudianteId, indice) => ({
            curso,
            fecha,
            estudiante_id: estudianteId,
            orden: indice + 1
        }));

        const { error: errorGuardar } = await supabaseClient
            .from(TABLA_AZAR_ASISTENCIA_BD)
            .upsert(registros, { onConflict: "curso,fecha,estudiante_id" });

        if (errorGuardar) throw errorGuardar;
    }
}

function esHoyAzarAsistencia(fecha) {
    if (!fecha) return false;
    const hoy = new Date();
    const hoyLocal = [
        hoy.getFullYear(),
        String(hoy.getMonth() + 1).padStart(2, "0"),
        String(hoy.getDate()).padStart(2, "0")
    ].join("-");
    return fecha === hoyLocal;
}

function obtenerCandidatosAzarAsistencia() {
    const tipo = obtenerTipoEleccionAzarAsistencia();

    const estudiantesCurso = obtenerEstudiantesCursoActual()
        .filter(estudiante => estudiante && estudiante.id != null)
        .filter(estudiante => {
            if (tipo === "inicial") return String(estudiante.nombre || "").trim().length > 0;
            const numero = Number(estudiante.num_lista);
            return Number.isFinite(numero) && numero > 0;
        });

    const elegidos = new Set(
        obtenerElegidosAzarAsistencia().map(id => String(id))
    );
    const descartados = new Set(
        obtenerDescartadosAzarAsistencia().map(id => String(id))
    );

    return estudiantesCurso.filter(estudiante => {
        if (!estudianteEsEfectivo(estudiante)) return false;
        if (elegidos.has(String(estudiante.id))) return false;
        if (descartados.has(String(estudiante.id))) return false;

        const genero = obtenerGeneroEstadistica(estudiante.gen);
        if (tipo === "varones") return genero === "varon";
        if (tipo === "mujeres") return genero === "mujer";
        return true;
    });
}

const CLAVE_TAMANO_AZAR_ASISTENCIA = "tamanoNumeroAzarAsistencia";
const CLAVE_TIPO_AZAR_ASISTENCIA = "tipoEleccionAzarAsistencia";
let tamanoNumeroAzarAsistencia = Number(localStorage.getItem(CLAVE_TAMANO_AZAR_ASISTENCIA)) || 200;
let tipoEleccionAzarAsistencia = localStorage.getItem(CLAVE_TIPO_AZAR_ASISTENCIA) || "numero";

function obtenerTipoEleccionAzarAsistencia() {
    const tiposValidos = ["numero", "inicial", "varones", "mujeres"];
    return tiposValidos.includes(tipoEleccionAzarAsistencia)
        ? tipoEleccionAzarAsistencia
        : "numero";
}

function inicialEstudianteAzarAsistencia(estudiante) {
    const nombre = String(estudiante?.nombre || "").trim();
    if (!nombre) return "—";
    return nombre.charAt(0).toUpperCase();
}

function textoVisibleAzarAsistencia(estudiante) {
    const tipo = obtenerTipoEleccionAzarAsistencia();
    return tipo === "inicial"
        ? inicialEstudianteAzarAsistencia(estudiante)
        : String(estudiante?.num_lista ?? "—");
}

function aplicarTipoEleccionAzarAsistencia() {
    const tipo = obtenerTipoEleccionAzarAsistencia();
    document.querySelectorAll('input[name="tipoEleccionAzarAsistencia"]').forEach(input => {
        input.checked = input.value === tipo;
    });

    const numeroEl = document.getElementById("azarAsistenciaNumero");
    if (numeroEl && azarAsistenciaEstudianteActual) {
        numeroEl.textContent = textoVisibleAzarAsistencia(azarAsistenciaEstudianteActual);
    }
}

function aplicarTamanoNumeroAzarAsistencia() {
    const numeroEl = document.getElementById("azarAsistenciaNumero");
    if (numeroEl) {
        numeroEl.style.fontSize = `${tamanoNumeroAzarAsistencia}px`;
    }
}

function abrirConfigTamanoAzarAsistencia() {
    const modal = document.getElementById("modalConfigTamanoAzarAsistencia");
    const control = document.getElementById("tamanoNumeroAzarAsistencia");
    if (!modal || !control) return;

    control.value = String(tamanoNumeroAzarAsistencia);
    actualizarVistaTamanoAzarAsistencia(control.value);
    aplicarTipoEleccionAzarAsistencia();
    modal.classList.remove("oculto");
}

function actualizarVistaTamanoAzarAsistencia(valor) {
    const numero = Math.max(80, Math.min(320, Number(valor) || 200));
    const valorEl = document.getElementById("valorTamanoNumeroAzarAsistencia");
    if (valorEl) valorEl.textContent = `${numero} px`;

    const numeroEl = document.getElementById("azarAsistenciaNumero");
    if (numeroEl) numeroEl.style.fontSize = `${numero}px`;
}

function guardarTamanoAzarAsistencia() {
    const control = document.getElementById("tamanoNumeroAzarAsistencia");
    const numero = Math.max(80, Math.min(320, Number(control?.value) || 200));

    tamanoNumeroAzarAsistencia = numero;

    const radioSeleccionado = document.querySelector('input[name="tipoEleccionAzarAsistencia"]:checked');
    const tipoSeleccionado = radioSeleccionado?.value || "numero";
    tipoEleccionAzarAsistencia = ["numero", "inicial", "varones", "mujeres"].includes(tipoSeleccionado)
        ? tipoSeleccionado
        : "numero";

    localStorage.setItem(CLAVE_TAMANO_AZAR_ASISTENCIA, String(numero));
    localStorage.setItem(CLAVE_TIPO_AZAR_ASISTENCIA, tipoEleccionAzarAsistencia);

    aplicarTamanoNumeroAzarAsistencia();
    aplicarTipoEleccionAzarAsistencia();
    actualizarEstadoBotonElegirAzarAsistencia();
    cerrarConfigTamanoAzarAsistencia();
}

function cerrarConfigTamanoAzarAsistencia(event) {
    const modal = document.getElementById("modalConfigTamanoAzarAsistencia");
    if (!modal) return;
    if (event && event.target !== modal) return;

    const control = document.getElementById("tamanoNumeroAzarAsistencia");
    if (control) control.value = String(tamanoNumeroAzarAsistencia);
    actualizarVistaTamanoAzarAsistencia(tamanoNumeroAzarAsistencia);
    modal.classList.add("oculto");
}

function abrirModalAzarAsistencia() {
    if (!cursoSeleccionado) {
        alert("Primero selecciona un curso.");
        return;
    }

    const fecha = document.getElementById("fechaAsistencia")?.value || "";
    if (!fecha) {
        alert("Selecciona primero una fecha de asistencia.");
        return;
    }

    const modal = document.getElementById("modalAzarAsistencia");
    if (!modal) return;

    azarAsistenciaCursoFecha = claveAzarAsistencia();
    azarAsistenciaEstudianteActual = null;

    const fechaEl = document.getElementById("azarAsistenciaFecha");
    const avisoFecha = document.getElementById("azarAsistenciaAvisoFecha");
    const numeroEl = document.getElementById("azarAsistenciaNumero");
    const nombreEl = document.getElementById("azarAsistenciaNombre");
    const listaEl = document.getElementById("azarAsistenciaLista");

    if (fechaEl) {
        fechaEl.textContent = `Curso: ${cursoSeleccionado} · ${formatearFechaGuardadaAsistencia(fecha)}`;
    }

    if (avisoFecha) {
        const esHoy = esHoyAzarAsistencia(fecha);
        avisoFecha.classList.toggle("oculto", esHoy);
        avisoFecha.textContent = esHoy
            ? ""
            : "⚠️ La fecha seleccionada no corresponde al día de hoy. El azar se guardará igualmente para la fecha seleccionada.";
    }

    if (numeroEl) {
        numeroEl.textContent = "—";
        numeroEl.style.color = "#1557a6";
        numeroEl.classList.remove("animando");
        aplicarTamanoNumeroAzarAsistencia();
        aplicarTipoEleccionAzarAsistencia();
    }

    if (nombreEl) {
        nombreEl.innerHTML = "Presiona «Elegir al azar»";
    }

    if (listaEl) {
        listaEl.innerHTML = "";
        listaEl.classList.add("oculto");
    }

    modal.classList.remove("oculto");

    if (!esHoyAzarAsistencia(fecha)) {
        alert("⚠️ Atención: la fecha de asistencia seleccionada no corresponde al día de hoy.");
    }

    actualizarEstadoBotonElegirAzarAsistencia();
    cargarElegidosAzarAsistenciaBD().catch(error => {
        console.warn("No se pudo sincronizar la lista de elegidos al abrir el azar:", error);
    });
    cargarDescartadosAzarAsistenciaBD().catch(error => {
        console.warn("No se pudo sincronizar la lista de descartados al abrir el azar:", error);
    });
}

function cerrarModalAzarAsistencia(event) {
    const modal = document.getElementById("modalAzarAsistencia");
    if (!modal) return;
    if (event && event.target !== modal) return;

    if (azarAsistenciaAnimacion) {
        clearInterval(azarAsistenciaAnimacion);
        azarAsistenciaAnimacion = null;
    }

    modal.classList.add("oculto");
}

function actualizarEstadoBotonElegirAzarAsistencia() {
    const boton = document.getElementById("botonElegirAzarAsistencia");
    if (!boton) return;

    const candidatos = obtenerCandidatosAzarAsistencia();
    boton.disabled = candidatos.length === 0;

    if (candidatos.length === 0) {
        boton.textContent = "✓ Todos elegidos";
    } else {
        boton.textContent = "🎲 Elegir al azar";
    }
}

function elegirEstudianteAzarAsistencia() {
    if (azarAsistenciaAnimacion) return;

    const numeroEl = document.getElementById("azarAsistenciaNumero");
    const nombreEl = document.getElementById("azarAsistenciaNombre");
    const boton = document.getElementById("botonElegirAzarAsistencia");
    const listaEl = document.getElementById("azarAsistenciaLista");

    const candidatos = obtenerCandidatosAzarAsistencia();

    if (!candidatos.length) {
        alert("✓ Ya fueron elegidos todos los estudiantes del curso para esta fecha.");
        actualizarEstadoBotonElegirAzarAsistencia();
        return;
    }

    if (listaEl) listaEl.classList.add("oculto");
    if (nombreEl) nombreEl.innerHTML = "🎲 Eligiendo...";
    if (numeroEl) numeroEl.classList.add("animando");
    if (boton) {
        boton.disabled = true;
        boton.textContent = "🎲 Eligiendo...";
    }

    const mostrarNumeroRapido = () => {
        const candidato = candidatos[Math.floor(Math.random() * candidatos.length)];
        if (numeroEl) {
            numeroEl.textContent = textoVisibleAzarAsistencia(candidato);
            const generoCandidato = obtenerGeneroEstadistica(candidato.gen);
            if (generoCandidato === "mujer") {
                numeroEl.style.color = configuracionAulaActual.colorMujer || "#e91e63";
            } else if (generoCandidato === "varon") {
                numeroEl.style.color = configuracionAulaActual.colorVaron || "#1976d2";
            } else {
                numeroEl.style.color = "#1557a6";
            }
        }
    };

    mostrarNumeroRapido();
    azarAsistenciaAnimacion = setInterval(mostrarNumeroRapido, 65);

    setTimeout(() => {
        if (azarAsistenciaAnimacion) {
            clearInterval(azarAsistenciaAnimacion);
            azarAsistenciaAnimacion = null;
        }

        const elegido = candidatos[Math.floor(Math.random() * candidatos.length)];
        azarAsistenciaEstudianteActual = elegido;

        const elegidos = obtenerElegidosAzarAsistencia();
        elegidos.push(String(elegido.id));
        guardarElegidosAzarAsistencia(elegidos);

        if (numeroEl) {
            numeroEl.textContent = textoVisibleAzarAsistencia(elegido);
            const generoElegido = obtenerGeneroEstadistica(elegido.gen);
            if (generoElegido === "mujer") {
                numeroEl.style.color = configuracionAulaActual.colorMujer || "#e91e63";
            } else if (generoElegido === "varon") {
                numeroEl.style.color = configuracionAulaActual.colorVaron || "#1976d2";
            } else {
                numeroEl.style.color = "#1557a6";
            }
            numeroEl.classList.remove("animando");
        }

        if (nombreEl) {
            nombreEl.innerHTML = "";
            const botonNombre = document.createElement("button");
            botonNombre.type = "button";
            botonNombre.textContent = construirNombreCortoAula(elegido);
            botonNombre.title = "Añadir una observación de asistencia";
            botonNombre.addEventListener("click", function() {
                abrirAsistenciaDesdeAzar(elegido.id);
            });
            nombreEl.appendChild(botonNombre);
        }

        actualizarEstadoBotonElegirAzarAsistencia();
    }, 2000);
}

function abrirAsistenciaDesdeAzar(estudianteId) {
    const fecha = document.getElementById("fechaAsistencia")?.value || "";
    if (!fecha) {
        alert("Selecciona primero una fecha de asistencia.");
        return;
    }

    const modalAzar = document.getElementById("modalAzarAsistencia");
    if (modalAzar) {
        modalAzar.dataset.azarlOcultoTemporalmente = "true";
        modalAzar.style.display = "none";
    }

    abrirAsistenciaEstudianteDesdeAula(estudianteId);

    setTimeout(() => {
        const modalAsistencia = document.getElementById("modalAsistenciaEstudianteAula");
        if (modalAsistencia) {
            modalAsistencia.style.zIndex = "10050";

            if (modalAsistencia.dataset.azarlVigilando !== "true") {
                modalAsistencia.dataset.azarlVigilando = "true";

                const observer = new MutationObserver(() => {
                    const visible = getComputedStyle(modalAsistencia).display !== "none";

                    if (!visible) {
                        observer.disconnect();
                        delete modalAsistencia.dataset.azarlVigilando;

                        const azar = document.getElementById("modalAzarAsistencia");
                        if (azar && azar.dataset.azarlOcultoTemporalmente === "true") {
                            azar.style.display = "flex";
                            azar.style.zIndex = "10100";
                            delete azar.dataset.azarlOcultoTemporalmente;
                        }
                    }
                });

                observer.observe(modalAsistencia, {
                    attributes: true,
                    attributeFilter: ["style", "class"]
                });
            }
        }

        const campo = document.getElementById("observacionAsistenciaAulaIndividual");
        if (campo) campo.focus();
    }, 80);
}


function mostrarPorElegirAzarAsistencia() {
    const listaEl = document.getElementById("azarAsistenciaLista");
    if (!listaEl) return;

    const tipo = obtenerTipoEleccionAzarAsistencia();
    const elegidos = new Set(obtenerElegidosAzarAsistencia().map(id => String(id)));
    const descartados = new Set(obtenerDescartadosAzarAsistencia().map(id => String(id)));

    // Se muestran también los estudiantes bloqueados; sólo quedan fuera del sorteo.
    const estudiantes = obtenerEstudiantesCursoActual()
        .filter(estudiante => estudiante && estudiante.id != null)
        .filter(estudiante => !elegidos.has(String(estudiante.id)))
        .filter(estudiante => estudianteEsEfectivo(estudiante))
        .filter(estudiante => {
            if (tipo === "inicial") return String(estudiante.nombre || "").trim().length > 0;
            const numero = Number(estudiante.num_lista);
            return Number.isFinite(numero) && numero > 0;
        })
        .filter(estudiante => {
            const genero = obtenerGeneroEstadistica(estudiante.gen);
            if (tipo === "varones") return genero === "varon";
            if (tipo === "mujeres") return genero === "mujer";
            return true;
        });

    if (!estudiantes.length) {
        listaEl.innerHTML = `<div style="padding:12px;text-align:center;color:#666;">No quedan estudiantes por elegir para esta fecha.</div>`;
        listaEl.classList.remove("oculto");
        return;
    }

    const filas = estudiantes.map((estudiante, indice) => {
        const idSeguro = JSON.stringify(String(estudiante.id));
        const bloqueado = descartados.has(String(estudiante.id));
        return `
        <tr${bloqueado ? ' class="azar-estudiante-bloqueado"' : ''}>
            <td>${indice + 1}</td>
            <td>
                <button type="button"
                        class="azar-asistencia-nombre-elegido"
                        onclick='abrirAsistenciaDesdeAzar(${idSeguro})'
                        title="Ver y modificar la asistencia y observación de este día">
                    ${escapeHTML(String(estudiante.nombre || ""))}
                </button>
            </td>
            <td><strong>${escapeHTML(textoVisibleAzarAsistencia(estudiante))}</strong></td>
            <td>
                <button type="button"
                        class="boton-descartar-azar"
                        onclick='descartarEstudianteAzarAsistencia(${idSeguro}, event)'
                        title="${bloqueado ? "Desbloquear estudiante para el sorteo" : "Bloquear estudiante y descartarlo del sorteo"}"
                        aria-label="${bloqueado ? "Desbloquear estudiante para el sorteo" : "Bloquear estudiante y descartarlo del sorteo"}">
                    ${bloqueado ? "🔓" : "🔒"}
                </button>
            </td>
        </tr>
        `;
    }).join("");

    listaEl.innerHTML = `
        <table>
            <thead>
                <tr>
                    <th>#</th>
                    <th>Nombre</th>
                    <th>${escapeHTML(
                        tipo === "inicial"
                            ? "Inicial"
                            : "N.º lista"
                    )}</th>
                    <th></th>
                </tr>
            </thead>
            <tbody>${filas}</tbody>
        </table>
    `;
    listaEl.classList.remove("oculto");
}

async function descartarEstudianteAzarAsistencia(estudianteId, event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }

    const actuales = obtenerDescartadosAzarAsistencia();
    const id = String(estudianteId);
    const estaBloqueado = actuales.some(item => String(item) === id);

    // El estudiante no se elimina: se bloquea/desbloquea y sólo se excluye o incluye en el sorteo.
    const nuevaLista = estaBloqueado
        ? actuales.filter(item => String(item) !== id)
        : [...actuales, id];

    try {
        await guardarDescartadosAzarAsistencia(nuevaLista);
    } catch (error) {
        console.error("No se pudo guardar en BD el bloqueo/desbloqueo del estudiante:", error);
        alert(
            "No se pudo guardar el bloqueo en la base de datos.\n\n" +
            (error?.message || error?.details || error?.hint || "Error desconocido")
        );
        return;
    }

    if (azarAsistenciaEstudianteActual && String(azarAsistenciaEstudianteActual.id) === id && !estaBloqueado) {
        azarAsistenciaEstudianteActual = null;
    }

    mostrarPorElegirAzarAsistencia();
    actualizarEstadoBotonElegirAzarAsistencia();
}


function mostrarElegidosAzarAsistencia() {
    const listaEl = document.getElementById("azarAsistenciaLista");
    if (!listaEl) return;

    const elegidosIds = obtenerElegidosAzarAsistencia();
    const mapa = new Map(
        obtenerEstudiantesCursoActual().map(estudiante => [String(estudiante.id), estudiante])
    );

    const elegidos = elegidosIds
        .map(id => mapa.get(String(id)))
        .filter(Boolean);

    if (!elegidos.length) {
        listaEl.innerHTML = `<div style="padding:12px;text-align:center;color:#666;">Todavía no se eligió ningún estudiante para esta fecha.</div>`;
        listaEl.classList.remove("oculto");
        return;
    }

    const filas = elegidos.map((estudiante, indice) => {
        const idSeguro = JSON.stringify(String(estudiante.id));
        return `
        <tr>
            <td>${indice + 1}</td>
            <td>
                <button type="button"
                        class="azar-asistencia-nombre-elegido"
                        onclick='abrirAsistenciaDesdeAzar(${idSeguro})'
                        title="Ver y modificar la asistencia y observación de este día">
                    ${escapeHTML(String(estudiante.nombre || ""))}
                </button>
            </td>
            <td><strong>${escapeHTML(textoVisibleAzarAsistencia(estudiante))}</strong></td>
            <td>
                <button type="button"
                        class="boton-eliminar-elegido-azar"
                        onclick='eliminarElegidoAzarAsistencia(${idSeguro}, event)'
                        title="Quitar de ya elegidos"
                        aria-label="Quitar de ya elegidos">
                    🗑️
                </button>
            </td>
        </tr>
        `;
    }).join("");

    listaEl.innerHTML = `
        <table>
            <thead>
                <tr>
                    <th>#</th>
                    <th>Nombre</th>
                    <th>${escapeHTML(
                        obtenerTipoEleccionAzarAsistencia() === "inicial"
                            ? "Inicial"
                            : "N.º lista"
                    )}</th>
                    <th></th>
                </tr>
            </thead>
            <tbody>${filas}</tbody>
        </table>
    `;
    listaEl.classList.remove("oculto");
}


async function eliminarElegidoAzarAsistencia(estudianteId, event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }

    const actuales = obtenerElegidosAzarAsistencia();
    const id = String(estudianteId);
    const nuevas = actuales.filter(item => String(item) !== id);

    if (nuevas.length === actuales.length) return;

    const confirmar = confirm("¿Está seguro de eliminar a este estudiante de la lista de elegidos?\n\nEsta acción no se puede deshacer.");
    if (!confirmar) return;

    try {
        await guardarElegidosAzarAsistencia(nuevas);
    } catch (error) {
        console.error("No se pudo eliminar de la BD el estudiante elegido:", error);
        alert(
            "No se pudo eliminar al estudiante de la base de datos.\n\n" +
            (error?.message || error?.details || error?.hint || "Error desconocido")
        );
        return;
    }
    if (azarAsistenciaEstudianteActual && String(azarAsistenciaEstudianteActual.id) === id) {
        azarAsistenciaEstudianteActual = null;
    }

    mostrarElegidosAzarAsistencia();
    actualizarEstadoBotonElegirAzarAsistencia();
}




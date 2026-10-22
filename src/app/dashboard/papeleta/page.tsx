"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Precio = {
  sitio: string;
  precio: number;
};

type Hermano = {
  numeroHermano: string;
  nombreCompleto: string;
  medalla: string;
};

function normalizar(texto: string) {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export default function PapeletaPage() {
  const router = useRouter();

  const [usuario, setUsuario] = useState("");
  const [rol, setRol] = useState("");

  const [precios, setPrecios] = useState<Precio[]>([]);
  const [hermanos, setHermanos] = useState<Hermano[]>([]);

  const [busqueda, setBusqueda] = useState("");
  const [hermanoSeleccionado, setHermanoSeleccionado] = useState<Hermano | null>(null);

  const [sitio, setSitio] = useState("");
  const [lugar, setLugar] = useState("");
  const [entrada, setEntrada] = useState("");

  useEffect(() => {
    const user = localStorage.getItem("hermandad_user");
    const rolGuardado = localStorage.getItem("hermandad_rol");

    if (!user) {
      router.push("/login");
    } else {
      setUsuario(user);
      setRol(rolGuardado || "");
    }
  }, [router]);

  useEffect(() => {
    async function cargarDatos() {
      try {
        const [resPrecios, resHermanos] = await Promise.all([
          fetch("/api/papeleta/precios", { cache: "no-store" }),
          fetch("/api/hermanos/buscar", { cache: "no-store" }),
        ]);

        const dataPrecios = await resPrecios.json();
        const dataHermanos = await resHermanos.json();

        setPrecios(dataPrecios.precios ?? []);
        setHermanos(dataHermanos.hermanos ?? []);
      } catch (error) {
        console.error(error);
      }
    }

    cargarDatos();
  }, []);

  const precioPapeleta = useMemo(() => {
    const encontrado = precios.find((p) => p.sitio === sitio);
    return encontrado?.precio ?? 0;
  }, [sitio, precios]);

  const sugerencias = useMemo(() => {
    if (busqueda.trim().length < 2) return [];

    const texto = normalizar(busqueda);

    return hermanos
      .filter((h) => normalizar(h.nombreCompleto).includes(texto))
      .slice(0, 8);
  }, [busqueda, hermanos]);

  const nombrePapeleta =
    hermanoSeleccionado?.nombreCompleto || busqueda.trim() || "—";

  const numeroHermanoPapeleta =
    hermanoSeleccionado?.numeroHermano || "—";

  function seleccionarHermano(hermano: Hermano) {
    setHermanoSeleccionado(hermano);
    setBusqueda(hermano.nombreCompleto);
  }

  function handleLogout() {
    localStorage.removeItem("hermandad_user");
    localStorage.removeItem("hermandad_rol");
    router.push("/login");
  }

  const menuItems = [
    { label: "INICIO", href: "/dashboard", roles: ["admin", "consulta"] },
    { label: "HERMANOS", href: "/dashboard/hermanos", roles: ["admin", "consulta"] },
    { label: "HEMEROTECA", href: "/dashboard/hemeroteca", roles: ["admin", "consulta"] },
    { label: "PAPELETA", href: "/dashboard/papeleta", roles: ["admin"] },
  ];

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#180808" }}>
      <aside style={sidebarStyle}>
        <div style={escudoBox}>
          <img
            src="/escudo-hermandad.png"
            alt="Escudo"
            style={{ width: "100%", height: "100%", objectFit: "contain" }}
          />
        </div>

        <p style={tituloSidebar}>
          Hermandad<br />de la<br />Sagrada Lanzada
        </p>

        <div style={{ width: "54%", height: "1px", background: "#3a1010", margin: "16px 0" }} />

        <nav style={{ width: "100%", padding: "0 14px", display: "flex", flexDirection: "column", gap: "2px" }}>
          {menuItems
            .filter((item) => item.roles.includes(rol))
            .map((item) => {
              const activo = item.href === "/dashboard/papeleta";

              return (
                <a
                  key={item.href}
                  href={item.href}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    padding: "10px 13px",
                    borderLeft: activo ? "3px solid #6b1414" : "3px solid transparent",
                    background: activo ? "rgba(107,20,20,0.2)" : "transparent",
                    textDecoration: "none",
                    borderRadius: "2px",
                  }}
                >
                  <span
                    style={{
                      fontFamily: "Cinzel, serif",
                      fontSize: "10px",
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      color: activo ? "#dfc990" : "#c8a97a",
                    }}
                  >
                    {item.label}
                  </span>
                </a>
              );
            })}
        </nav>

        <div style={{ marginTop: "auto", padding: "0 14px", width: "100%" }}>
          <button onClick={handleLogout} style={botonSalir}>
            Cerrar sesión
          </button>
        </div>
      </aside>

      <main style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <div style={topbarStyle}>
          <span style={topbarTitle}>Gestión de papeletas</span>
          <span style={topbarUser}>{usuario}</span>
        </div>

        <div style={{ flex: 1, padding: "28px 36px" }}>
          <div style={card}>
            <h1 style={pageTitle}>Papeleta de sitio</h1>
            <p style={pageSubtitle}>
              Gestión de papeletas y pagos asociados a la estación de penitencia.
            </p>
          </div>

          <div style={card}>
            <div style={{ position: "relative" }}>
              <label style={labelStyle}>Nombre para la papeleta</label>

              <input
                value={busqueda}
                onChange={(e) => {
                  setBusqueda(e.target.value);
                  setHermanoSeleccionado(null);
                }}
                placeholder="Buscar hermano o escribir nombre libre..."
                style={inputStyle}
              />

              {sugerencias.length > 0 && !hermanoSeleccionado && (
                <div style={sugerenciasBox}>
                  {sugerencias.map((h) => (
                    <button
                      key={`${h.numeroHermano}-${h.nombreCompleto}`}
                      onClick={() => seleccionarHermano(h)}
                      style={sugerenciaItem}
                    >
                      {h.nombreCompleto}
                      <span style={{ color: "#8f7a4b", marginLeft: "8px" }}>
                        · Nº {h.numeroHermano}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div style={card}>
            <p style={sectionTitle}>Datos de la papeleta</p>

            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#140606" }}>
                  {[
                    "Estado",
                    "Nombre",
                    "Nº Hermano",
                    "Sitio",
                    "Lugar",
                    "Entrada",
                    "Papeleta",
                  ].map((titulo) => (
                    <th key={titulo} style={thStyle}>
                      {titulo}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                <tr>
                  <td style={tdStyle}>Activa</td>
                  <td style={tdStyle}>{nombrePapeleta}</td>
                  <td style={tdStyle}>{numeroHermanoPapeleta}</td>

                  <td style={tdStyle}>
                    <select
                      value={sitio}
                      onChange={(e) => setSitio(e.target.value)}
                      style={selectStyle}
                    >
                      <option value="">Seleccione sitio</option>
                      {precios.map((p, index) => (
                        <option key={`${p.sitio}-${index}`} value={p.sitio}>
                          {p.sitio}
                        </option>
                      ))}
                    </select>
                  </td>

                  <td style={tdStyle}>
                    <select
                      value={lugar}
                      onChange={(e) => setLugar(e.target.value)}
                      style={selectStyle}
                    >
                      <option value="">Seleccione lugar</option>
                      <option value="PASO SAGRADA LANZADA">PASO SAGRADA LANZADA</option>
                      <option value="PALIO ESPERANZA DEL MAR">PALIO ESPERANZA DEL MAR</option>
                    </select>
                  </td>

                  <td style={tdStyle}>
                    <select
                      value={entrada}
                      onChange={(e) => setEntrada(e.target.value)}
                      style={selectStyle}
                    >
                      <option value="">Seleccione entrada</option>
                      <option value="SOLO">SOLO</option>
                      <option value="UN ACOMPAÑANTE">UN ACOMPAÑANTE</option>
                    </select>
                  </td>

                  <td style={tdStyle}>{precioPapeleta} €</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}

const sidebarStyle = {
  width: "210px",
  flexShrink: 0,
  background: "#100404",
  borderRight: "2px solid #6b1414",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  padding: "28px 0 20px",
} as const;

const escudoBox = {
  width: "106px",
  height: "106px",
  borderRadius: "50%",
  border: "2px solid #6b1414",
  background: "#180808",
  overflow: "hidden",
  marginBottom: "14px",
} as const;

const tituloSidebar = {
  fontFamily: "Cinzel, serif",
  fontSize: "9.5px",
  fontWeight: 700,
  color: "#dfc990",
  textAlign: "center",
  letterSpacing: "0.14em",
  lineHeight: 1.75,
  padding: "0 16px",
  textTransform: "uppercase",
} as const;

const botonSalir = {
  width: "100%",
  background: "transparent",
  border: "1px solid #3a1010",
  borderRadius: "2px",
  padding: "8px",
  cursor: "pointer",
  color: "#c8a97a",
  fontFamily: "Cinzel, serif",
  fontSize: "9px",
  letterSpacing: "0.1em",
  textTransform: "uppercase",
} as const;

const topbarStyle = {
  background: "#100404",
  borderBottom: "1px solid #2a0e0e",
  padding: "0 36px",
  height: "44px",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
} as const;

const topbarTitle = {
  fontFamily: "Cinzel, serif",
  fontSize: "10px",
  letterSpacing: "0.2em",
  textTransform: "uppercase",
  color: "#c8a97a",
} as const;

const topbarUser = {
  fontFamily: "Georgia, serif",
  fontSize: "12px",
  color: "#d2b48c",
} as const;

const card = {
  background: "#100404",
  border: "1px solid #2a0e0e",
  borderTop: "2px solid #6b1414",
  borderRadius: "3px",
  padding: "20px",
  maxWidth: "1200px",
  marginBottom: "22px",
} as const;

const pageTitle = {
  color: "#dfc990",
  fontFamily: "Cinzel, serif",
  fontSize: "26px",
  marginBottom: "8px",
} as const;

const pageSubtitle = {
  color: "#a88b58",
  fontFamily: "Georgia, serif",
  fontSize: "13px",
} as const;

const sectionTitle = {
  fontFamily: "Cinzel, serif",
  fontSize: "9px",
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  color: "#fefefe",
  marginBottom: "16px",
} as const;

const thStyle = {
  textAlign: "left",
  padding: "12px",
  borderBottom: "1px solid #3a1010",
  color: "#dfc990",
  fontFamily: "Cinzel, serif",
  fontSize: "10px",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
} as const;

const tdStyle = {
  padding: "12px",
  color: "#dfc990",
  fontFamily: "Georgia, serif",
  fontSize: "13px",
  borderBottom: "1px solid #2a0e0e",
} as const;

const selectStyle = {
  width: "100%",
  background: "#180808",
  border: "1px solid #3a1010",
  color: "#dfc990",
  padding: "8px",
  outline: "none",
  fontFamily: "Georgia, serif",
  fontSize: "12px",
} as const;

const labelStyle = {
  display: "block",
  fontFamily: "Cinzel, serif",
  fontSize: "8.5px",
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "#fefefe",
  marginBottom: "8px",
} as const;

const inputStyle = {
  width: "100%",
  background: "#180808",
  border: "1px solid #3a1010",
  borderRadius: "3px",
  padding: "11px 14px",
  color: "#dfc990",
  fontFamily: "Georgia, serif",
  fontSize: "13px",
  outline: "none",
} as const;

const sugerenciasBox = {
  position: "absolute",
  left: 0,
  right: 0,
  top: "72px",
  background: "#180808",
  border: "1px solid #6b1414",
  borderRadius: "3px",
  zIndex: 20,
  overflow: "hidden",
} as const;

const sugerenciaItem = {
  width: "100%",
  textAlign: "left",
  background: "transparent",
  border: "none",
  borderBottom: "1px solid #2a0e0e",
  padding: "10px 12px",
  cursor: "pointer",
  color: "#dfc990",
  fontFamily: "Georgia, serif",
  fontSize: "13px",
} as const;
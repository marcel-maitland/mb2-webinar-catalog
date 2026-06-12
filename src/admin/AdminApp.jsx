import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Routes, Route, Link, NavLink, useNavigate, Navigate } from "react-router-dom";
import { supabase } from "../lib/supabase.js";
import Login from "./Login.jsx";
import EventsList from "./EventsList.jsx";
import EventForm from "./EventForm.jsx";
import ImportCsv from "./ImportCsv.jsx";
import Vendors from "./Vendors.jsx";
import Clients from "./Clients.jsx";
import "./admin.css";

/* ============================================================
   Client context
============================================================ */
const ClientContext = createContext(null);

/**
 * Hook for any admin page to read the current client + role state.
 *   const { currentClient, currentClientId, clients, isSuperAdmin, setClient, reload } = useClient();
 */
export function useClient() {
  const ctx = useContext(ClientContext);
  if (!ctx) throw new Error("useClient must be used inside the admin client context");
  return ctx;
}

/* ============================================================
   AdminApp shell
============================================================ */
export default function AdminApp() {
  const [session, setSession] = useState(undefined);
  const [isAdmin, setIsAdmin] = useState(false);
  const [checkingAdmin, setCheckingAdmin] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    // Supabase emits TOKEN_REFRESHED automatically (every hour, AND on tab focus
    // when the token is about to expire). The session object is a NEW reference
    // each time even though the user hasn't changed — without this guard, every
    // tab-focus would re-render the admin tree and remount EventForm, blowing
    // away in-progress edits.
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => {
      setSession((prev) => {
        if (prev?.user?.id === (s?.user?.id ?? null)) return prev;
        return s ?? null;
      });
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Only re-check admin status when the actual signed-in user changes — not on
  // every token refresh, which would unmount the route below.
  const sessionUserId = session?.user?.id ?? null;
  useEffect(() => {
    let cancelled = false;
    async function check() {
      if (!sessionUserId) { setIsAdmin(false); return; }
      setCheckingAdmin(true);
      const { data } = await supabase
        .from("admins")
        .select("user_id")
        .eq("user_id", sessionUserId)
        .maybeSingle();
      if (!cancelled) {
        setIsAdmin(!!data);
        setCheckingAdmin(false);
      }
    }
    check();
    return () => { cancelled = true; };
  }, [sessionUserId]);

  if (session === undefined) return <div className="admin"><p>Loading…</p></div>;
  if (!session) return <Login />;
  if (checkingAdmin) return <div className="admin"><p>Checking access…</p></div>;
  if (!isAdmin) return <NoAccess email={session.user.email} />;

  return (
    <ClientProvider session={session}>
      <AdminShell />
    </ClientProvider>
  );
}

/* ============================================================
   Provider — loads accessible clients + current selection
============================================================ */
function ClientProvider({ session, children }) {
  const [clients, setClients] = useState([]);
  const [currentClientId, setCurrentClientId] = useState(
    () => localStorage.getItem("currentClientId") || null
  );
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setError("");
    // Get is_super_admin flag for the signed-in user
    const { data: me, error: meErr } = await supabase
      .from("admins")
      .select("is_super_admin")
      .eq("user_id", session.user.id)
      .maybeSingle();
    if (meErr) { setError(meErr.message); return; }
    const isSuper = !!me?.is_super_admin;
    setIsSuperAdmin(isSuper);

    // Fetch accessible clients
    let accessible = [];
    if (isSuper) {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name, slug, logo_url")
        .order("name");
      if (error) { setError(error.message); return; }
      accessible = data || [];
    } else {
      const { data, error } = await supabase
        .from("client_admins")
        .select("client_id, clients (id, name, slug, logo_url)")
        .eq("user_id", session.user.id);
      if (error) { setError(error.message); return; }
      accessible = (data || [])
        .map((r) => r.clients)
        .filter(Boolean)
        .sort((a, b) => a.name.localeCompare(b.name));
    }
    setClients(accessible);

    // Pick a current client
    if (accessible.length > 0) {
      const stored = localStorage.getItem("currentClientId");
      const ok = stored && accessible.some((c) => c.id === stored);
      const chosen = ok ? stored : accessible[0].id;
      setCurrentClientId(chosen);
      localStorage.setItem("currentClientId", chosen);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [session.user.id]);

  const setClient = (id) => {
    setCurrentClientId(id);
    localStorage.setItem("currentClientId", id);
  };

  const currentClient = useMemo(
    () => clients.find((c) => c.id === currentClientId) || null,
    [clients, currentClientId]
  );

  if (loading) return <div className="admin"><p>Loading workspace…</p></div>;

  if (clients.length === 0) {
    return (
      <div className="admin">
        <div className="adminCard" style={{ maxWidth: 540, margin: "80px auto" }}>
          <h2>No client access yet</h2>
          <p>
            You're signed in as <strong>{session.user.email}</strong>, but you haven't been
            granted access to any client yet. Ask a super admin to add you to a client.
          </p>
          <button className="ghostBtn" onClick={() => supabase.auth.signOut()}>Sign out</button>
        </div>
      </div>
    );
  }

  return (
    <ClientContext.Provider
      value={{
        currentClient,
        currentClientId,
        clients,
        isSuperAdmin,
        setClient,
        reload: load,
        sessionUser: session.user,
      }}
    >
      {children}
    </ClientContext.Provider>
  );
}

/* ============================================================
   AdminShell — nav + routes (renders with client context available)
============================================================ */
function AdminShell() {
  const { currentClient, isSuperAdmin, sessionUser } = useClient();
  return (
    <div className="admin">
      <Nav email={sessionUser.email} />
      <main className="adminMain">
        <Routes>
          <Route index element={<EventsList />} />
          <Route path="events/new" element={<EventForm mode="new" />} />
          <Route path="events/:id" element={<EventForm mode="edit" />} />
          <Route path="vendors" element={<Vendors />} />
          <Route path="import" element={<ImportCsv />} />
          {isSuperAdmin && <Route path="clients" element={<Clients />} />}
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
      </main>
    </div>
  );
}

/* ============================================================
   Top nav with client switcher
============================================================ */
function Nav({ email }) {
  const navigate = useNavigate();
  const { currentClient, clients, isSuperAdmin, setClient } = useClient();
  const canSwitch = isSuperAdmin || clients.length > 1;
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate("/admin");
  };

  return (
    <header className="adminNav">
      <div className="adminBrand">
        <Link to="/admin" className="adminBrandLink" aria-label="Go to events">
          {currentClient?.logo_url
            ? <img src={currentClient.logo_url} alt="" className="adminBrandLogo" />
            : <ClientLogoPh name={currentClient?.name || ""} />
          }
          <span className="adminBrandText">{currentClient?.name || "Catalog"}</span>
        </Link>

        {canSwitch && (
          <div className="clientSwitcher" ref={wrapRef}>
            <button
              type="button"
              className="clientSwitcherToggle"
              onClick={() => setOpen((s) => !s)}
              aria-haspopup="listbox"
              aria-expanded={open}
              title="Switch client"
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" aria-hidden="true">
                <path d="M7 10l5 5 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            {open && (
              <ul className="clientSwitcherList" role="listbox">
                <li className="clientSwitcherLabel">Switch client</li>
                {clients.map((c) => (
                  <li
                    key={c.id}
                    role="option"
                    aria-selected={c.id === currentClient?.id}
                    className={`clientSwitcherItem ${c.id === currentClient?.id ? "active" : ""}`}
                    onClick={() => { setClient(c.id); setOpen(false); }}
                  >
                    {c.logo_url
                      ? <img src={c.logo_url} alt="" className="clientSwitcherLogo" />
                      : <ClientLogoPh name={c.name} small />
                    }
                    <span>{c.name}</span>
                    {c.id === currentClient?.id && <span className="clientSwitcherCheck">✓</span>}
                  </li>
                ))}
                {isSuperAdmin && (
                  <li className="clientSwitcherFooter">
                    <Link to="/admin/clients" onClick={() => setOpen(false)}>Manage clients →</Link>
                  </li>
                )}
              </ul>
            )}
          </div>
        )}
      </div>

      <nav className="adminNavLinks">
        <NavLink to="/admin" end>Events</NavLink>
        <NavLink to="/admin/vendors">Vendors</NavLink>
        <NavLink to="/admin/import">Import</NavLink>
        {isSuperAdmin && <NavLink to="/admin/clients">Clients</NavLink>}
        <a href={currentClient?.slug ? `/c/${currentClient.slug}` : "/"} target="_blank" rel="noopener">View catalog ↗</a>
      </nav>

      <div className="adminUser">
        {isSuperAdmin && <span className="superBadge" title="You can see and manage every client">SUPER</span>}
        <span className="muted">{email}</span>
        <button className="ghostBtn" onClick={signOut}>Sign out</button>
      </div>
    </header>
  );
}

function ClientLogoPh({ name, small }) {
  const letter = (name || "?").charAt(0).toUpperCase();
  // Reuse the same hashed palette idea as vendors
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const palettes = [
    ["#fff7ed", "#c2410c"], ["#ecfdf5", "#047857"], ["#eff6ff", "#1d4ed8"],
    ["#f5f3ff", "#6d28d9"], ["#fffbeb", "#b45309"], ["#fef2f2", "#b91c1c"],
  ];
  const [bg, fg] = palettes[h % palettes.length];
  return (
    <div
      className={`adminBrandLogoPh ${small ? "adminBrandLogoPhSm" : ""}`}
      style={{ background: bg, color: fg }}
    >
      {letter}
    </div>
  );
}

/* ============================================================
   "Not an admin yet" landing
============================================================ */
function NoAccess({ email }) {
  return (
    <div className="admin">
      <div className="adminCard" style={{ maxWidth: 520, margin: "80px auto" }}>
        <h2>You're signed in, but not an admin yet</h2>
        <p>
          You're logged in as <strong>{email}</strong>. Ask an existing super admin to grant you access by
          running this SQL in Supabase:
        </p>
        <pre className="codeBlock">
{`insert into public.admins (user_id, email)
select id, email from auth.users where email = '${email}';`}
        </pre>
        <button className="ghostBtn" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </div>
    </div>
  );
}

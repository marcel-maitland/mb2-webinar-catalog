import { useEffect, useState } from "react";
import { Routes, Route, Link, NavLink, useNavigate, Navigate } from "react-router-dom";
import { supabase } from "../lib/supabase.js";
import Login from "./Login.jsx";
import EventsList from "./EventsList.jsx";
import EventForm from "./EventForm.jsx";
import ImportCsv from "./ImportCsv.jsx";
import Vendors from "./Vendors.jsx";
import "./admin.css";

export default function AdminApp() {
  const [session, setSession] = useState(undefined); // undefined = loading
  const [isAdmin, setIsAdmin] = useState(false);
  const [checkingAdmin, setCheckingAdmin] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => setSession(s ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      if (!session) {
        setIsAdmin(false);
        return;
      }
      setCheckingAdmin(true);
      const { data } = await supabase
        .from("admins")
        .select("user_id")
        .eq("user_id", session.user.id)
        .maybeSingle();
      if (!cancelled) {
        setIsAdmin(!!data);
        setCheckingAdmin(false);
      }
    }
    check();
    return () => { cancelled = true; };
  }, [session]);

  if (session === undefined) return <div className="admin"><p>Loading…</p></div>;
  if (!session) return <Login />;
  if (checkingAdmin) return <div className="admin"><p>Checking access…</p></div>;
  if (!isAdmin) return <NoAccess email={session.user.email} />;

  return (
    <div className="admin">
      <Nav email={session.user.email} />
      <main className="adminMain">
        <Routes>
          <Route index element={<EventsList />} />
          <Route path="events/new" element={<EventForm mode="new" />} />
          <Route path="events/:id" element={<EventForm mode="edit" />} />
          <Route path="vendors" element={<Vendors />} />
          <Route path="import" element={<ImportCsv />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
      </main>
    </div>
  );
}

function Nav({ email }) {
  const navigate = useNavigate();
  const signOut = async () => {
    await supabase.auth.signOut();
    navigate("/admin");
  };
  return (
    <header className="adminNav">
      <div className="adminBrand">
        <Link to="/admin">MB2 Events Admin</Link>
      </div>
      <nav className="adminNavLinks">
        <NavLink to="/admin" end>Events</NavLink>
        <NavLink to="/admin/vendors">Vendors</NavLink>
        <NavLink to="/admin/import">Import</NavLink>
        <a href="/" target="_blank" rel="noopener">View catalog ↗</a>
      </nav>
      <div className="adminUser">
        <span className="muted">{email}</span>
        <button className="ghostBtn" onClick={signOut}>Sign out</button>
      </div>
    </header>
  );
}

function NoAccess({ email }) {
  return (
    <div className="admin">
      <div className="adminCard" style={{ maxWidth: 520, margin: "80px auto" }}>
        <h2>You're signed in, but not an admin yet</h2>
        <p>
          You're logged in as <strong>{email}</strong>. Ask an existing admin to grant you access by
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
